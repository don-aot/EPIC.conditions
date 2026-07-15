"""Service for extraction request management."""
import logging
from datetime import datetime
from typing import Optional

from flask import current_app
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import selectinload

from condition_api.models.db import db
from condition_api.models.document import Document
from condition_api.models.document_type_category import DocumentTypeCategory
from condition_api.models.extraction_request import ExtractionRequest
from condition_api.models.project import Project
from condition_api.services.extraction_import_service import load_extracted_data
from condition_api.services.staff_user_service import StaffUserService
from condition_api.utils.token_info import TokenInfo

logger = logging.getLogger(__name__)


class ExtractionRequestService:
    """Service for managing extraction requests."""

    ACTIVE_QUEUE_STATUSES = {'pending', 'processing'}

    @staticmethod
    def _get_current_staff_user():
        """Return the current authenticated staff user, creating it if needed."""
        auth_guid = TokenInfo.get_id()
        if auth_guid:
            return StaffUserService.get_by_auth_guid(auth_guid)
        return None

    @staticmethod
    def _resolve_document_category_id(document_type_id: Optional[int]) -> Optional[int]:
        """Return the single category for a document type via the junction table."""
        if not document_type_id:
            return None
        row = (
            db.session.query(DocumentTypeCategory)
            .filter_by(document_type_id=document_type_id)
            .order_by(DocumentTypeCategory.id)
            .first()
        )
        return row.document_category_id if row else None

    @staticmethod
    def create(data: dict) -> ExtractionRequest:
        """Create a new extraction request with status pending.

        The document and project remain inactive until extraction is successfully
        imported or the user completes manual entry.
        """
        current_staff_user = ExtractionRequestService._get_current_staff_user()

        request = ExtractionRequest(
            project_id=data['project_id'],
            document_id=data.get('document_id'),
            document_type_id=data.get('document_type_id'),
            uploaded_by_staff_user_id=current_staff_user.id if current_staff_user else None,
            document_label=data.get('document_label'),
            original_file_name=data.get('original_file_name'),
            s3_url=data['s3_url'],
            file_size_bytes=data.get('file_size_bytes'),
            status='pending',
        )
        db.session.add(request)

        # Ensure the document record exists in the DB so the extraction result can reference it.
        # The document stays inactive until extraction is imported or manual entry is completed.
        document_id = data.get('document_id')
        if document_id:
            document = db.session.query(Document).filter_by(document_id=document_id).first()
            if not document:
                raw_date = data.get('date_issued')
                parsed_date = None
                if raw_date:
                    try:
                        parsed_date = datetime.strptime(raw_date[:10], '%Y-%m-%d').date()
                    except ValueError:
                        logger.warning("Could not parse date_issued '%s' for document_id=%s", raw_date, document_id)

                document = Document(
                    document_id=document_id,
                    project_id=data['project_id'],
                    document_type_id=data.get('document_type_id'),
                    document_label=data.get('document_label'),
                    date_issued=parsed_date,
                    act=data.get('act'),
                    is_active=False,
                )
                db.session.add(document)
                logger.info("Created new document document_id=%s from extraction request", document_id)
            else:
                # Always honour the document type the user explicitly selected, even
                # when the document already exists in the DB with a different type.
                if data.get('document_type_id'):
                    document.document_type_id = data['document_type_id']

        db.session.commit()
        db.session.refresh(request)
        return request

    @staticmethod
    def _get_queue_reference_time():
        """Return the current reference time used for queue estimates."""
        return datetime.utcnow()

    @staticmethod
    def _get_minutes_elapsed(start_time: datetime, reference_time: datetime) -> int:
        """Return whole elapsed minutes between two timestamps."""
        elapsed_seconds = max(0, (reference_time - start_time).total_seconds())
        return int(elapsed_seconds // 60)

    @staticmethod
    def _apply_queue_metadata(requests):
        """Attach transient queue and ETA fields for UI display.

        The UI should treat these values as rough operational estimates only.
        They are derived from config, not from a direct cron scheduler callback.
        """
        cron_interval_minutes = current_app.config['EXTRACTION_QUEUE_CRON_INTERVAL_MINUTES']
        processing_estimate_minutes = current_app.config['EXTRACTION_PROCESSING_ESTIMATE_MINUTES']
        now = ExtractionRequestService._get_queue_reference_time()

        for request in requests:
            request.queue_position = None
            request.estimated_wait_minutes = None
            request.estimated_ready_minutes = None

            if request.status == 'processing':
                started_at = request.updated_date or request.created_date or now
                elapsed_minutes = ExtractionRequestService._get_minutes_elapsed(started_at, now)
                request.estimated_wait_minutes = 0
                request.estimated_ready_minutes = max(
                    1, processing_estimate_minutes - elapsed_minutes
                )

        pending_requests = sorted(
            (request for request in requests if request.status == 'pending'),
            key=lambda request: (request.created_date or now, request.id),
        )

        for queue_position, request in enumerate(pending_requests, start=1):
            request.queue_position = queue_position
            request.estimated_wait_minutes = cron_interval_minutes * queue_position
            request.estimated_ready_minutes = (
                request.estimated_wait_minutes + processing_estimate_minutes
            )

    @staticmethod
    def get_all(status_filter=None):
        """Get extraction requests optionally filtered by status."""
        query = (
            db.session.query(ExtractionRequest)
            .options(
                selectinload(ExtractionRequest.uploaded_by_staff_user),
                selectinload(ExtractionRequest.imported_by_staff_user),
            )
            .order_by(ExtractionRequest.created_date.desc())
        )
        if status_filter:
            query = query.filter(ExtractionRequest.status == status_filter)
        requests = query.all()
        ExtractionRequestService._apply_queue_metadata(
            [request for request in requests if request.status in ExtractionRequestService.ACTIVE_QUEUE_STATUSES]
        )
        return requests

    @staticmethod
    def manual_entry_request(request_id: int):
        """Mark an extraction request as manually entered and purge its raw extracted JSON."""
        req = db.session.query(ExtractionRequest).filter_by(id=request_id).first()
        if not req:
            raise ValueError("ExtractionRequest not found")
        try:
            req.status = 'manual'
            req.extracted_data = None
            req.error_message = None

            # Activate the document and project now that the user has completed manual entry.
            if req.document_id:
                document = db.session.query(Document).filter_by(document_id=req.document_id).first()
                if document:
                    if req.document_type_id:
                        document.document_type_id = req.document_type_id
                        document.document_category_id = (
                            document.document_category_id
                            or ExtractionRequestService._resolve_document_category_id(req.document_type_id)
                        )
                    document.is_active = True

            project = db.session.query(Project).filter_by(project_id=req.project_id).first()
            if project:
                project.is_active = True

            db.session.commit()
        except SQLAlchemyError as exc:
            db.session.rollback()
            logger.error("Failed to mark ExtractionRequest id=%s as manual: %s", request_id, exc)
            raise ValueError("Failed to update extraction request due to a database error.") from exc
        db.session.refresh(req)
        return req

    @staticmethod
    def _deactivate_project_if_no_active_docs(project_id, exclude_document_id):
        """Deactivate the project when no other active documents remain."""
        other_active = (
            db.session.query(Document)
            .filter(
                Document.project_id == project_id,
                Document.document_id != exclude_document_id,
                Document.is_active.is_(True),
            )
            .first()
        )
        if not other_active:
            project = db.session.query(Project).filter_by(project_id=project_id).first()
            if project:
                project.is_active = False

    @staticmethod
    def reject_request(request_id: int):
        """Reject an extraction request and purge its raw extracted JSON."""
        req = db.session.query(ExtractionRequest).filter_by(id=request_id).first()
        if not req:
            raise ValueError("ExtractionRequest not found")
        try:
            req.status = 'rejected'
            req.extracted_data = None
            req.error_message = None

            if req.document_id:
                document = db.session.query(Document).filter_by(document_id=req.document_id).first()
                if document:
                    document.is_active = False
                    if document.project_id:
                        ExtractionRequestService._deactivate_project_if_no_active_docs(
                            document.project_id, req.document_id
                        )

            db.session.commit()
        except SQLAlchemyError as exc:
            db.session.rollback()
            logger.error("Failed to reject ExtractionRequest id=%s: %s", request_id, exc)
            raise ValueError("Failed to reject extraction request due to a database error.") from exc
        db.session.refresh(req)
        return req

    @staticmethod
    def import_request(request_id: int):
        """Import the extracted conditions, marking the request as imported."""
        req = db.session.query(ExtractionRequest).filter_by(id=request_id).first()
        if not req:
            raise ValueError("ExtractionRequest not found")
        if req.status != 'completed':
            raise ValueError("Request must be completed to import")
        if not req.document_id:
            raise ValueError("Request must reference an existing document to import")

        try:
            current_staff_user = ExtractionRequestService._get_current_staff_user()
            load_extracted_data(
                data=req.extracted_data or {},
                project_id=req.project_id,
                document_id=req.document_id,
            )

            req.status = 'imported'
            req.imported_by_staff_user_id = current_staff_user.id if current_staff_user else None
            req.extracted_data = None

            if req.document_id:
                document = db.session.query(Document).filter_by(document_id=req.document_id).first()
                if document:
                    if req.document_type_id:
                        document.document_type_id = req.document_type_id
                        document.document_category_id = (
                            document.document_category_id
                            or ExtractionRequestService._resolve_document_category_id(req.document_type_id)
                        )
                    document.is_active = True

            # Activate the project now that extraction is complete and imported.
            project = db.session.query(Project).filter_by(project_id=req.project_id).first()
            if project:
                project.is_active = True

            db.session.commit()
        except (SQLAlchemyError, ValueError, TypeError):
            db.session.rollback()
            raise
        db.session.refresh(req)
        return req
