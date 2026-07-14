# Copyright © 2024 Province of British Columbia
#
# Licensed under the Apache License, Version 2.0 (the 'License');
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an 'AS IS' BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.


"""Service for document management."""
import uuid
from datetime import date
from sqlalchemy import and_, case, extract, func, not_

from condition_api.models.amendment import Amendment
from condition_api.models.condition import Condition
from condition_api.models.db import db
from condition_api.models.document import Document
from condition_api.models.document_category import DocumentCategory
from condition_api.models.document_type import DocumentType as DocumentTypeModel
from condition_api.models.project import Project
from condition_api.utils.enums import DocumentType


class DocumentService:
    """Service for managing document-related operations."""

    @staticmethod
    def get_all_documents_by_category(project_id, category_id):
        """Fetch all documents and its amendments for the given project_id and category_id."""
        # Fetch the original document
        documents = db.session.query(
            Project.project_name.label('project_name'),
            DocumentCategory.category_name.label('document_category'),
            Document.id.label('id'),
            Document.document_id.label('document_id'),
            Document.document_label.label('document_label'),
            Document.is_latest_amendment_added,
            Document.created_date,
            extract('year', Document.date_issued).label('year_issued'),
            case(
                (
                    func.count(  # pylint: disable=not-callable
                        case(
                            # Include only valid conditions for the count
                            (
                                not_(
                                    and_(
                                        Condition.condition_name.is_(None),
                                        Condition.condition_number.is_(None)
                                    )
                                ),  # Exclude invalid conditions
                                Condition.id
                            )
                        )
                    ) == 0,  # If there are no valid conditions
                    None
                ),
                else_=func.min(
                    case(
                        # Check approval status for valid conditions only
                        (
                            and_(
                                not_(
                                    and_(
                                        Condition.condition_name.is_(None),
                                        Condition.condition_number.is_(None)
                                    )
                                ),  # Exclude invalid conditions
                                not_(
                                    and_(
                                        Condition.is_approved.is_(True),
                                        Condition.is_condition_attributes_approved.is_(True),
                                        Condition.is_topic_tags_approved.is_(True)
                                    )
                                )  # If all are not True, mark as not approved
                            ),
                            0  # Not approved
                        ),
                        else_=1  # Approved
                    )
                )
            ).label("status")
        ).outerjoin(
            Project,
            Project.project_id == Document.project_id
        ).outerjoin(
            DocumentCategory,
            DocumentCategory.id == Document.document_category_id
        ).outerjoin(
            Condition,
            and_(
                Condition.document_id == Document.document_id,
                Condition.amended_document_id.is_(None)  # Ensure only original conditions
            )
        ).filter(
            (Project.project_id == project_id)
            & (Document.document_category_id == category_id)
            & (Document.is_active.is_(True))
        ).group_by(
            Project.project_name,
            DocumentCategory.category_name,
            Document.id,
            Document.document_id,
            Document.document_label,
            Document.created_date,
            Document.date_issued
        ).all()

        if not documents:
            # If no original document is found, return an empty list
            return []

        # Combine original document with amendments in the result
        result = []

        # Iterate over documents and fetch amendments
        for document in documents:
            # Fetch all amendments associated with the original document
            amendments_query = db.session.query(
                Amendment.amended_document_id.label('document_id'),
                Amendment.amendment_name.label('document_label'),
                Amendment.created_date,
                extract('year', Amendment.date_issued).label('year_issued'),
                case(
                    # If there are no conditions, return None
                    (func.count(Condition.id) == 0, None),  # pylint: disable=not-callable
                    else_=func.min(
                        case(
                            (
                                not_(
                                    and_(
                                        Condition.is_approved.is_(True),
                                        Condition.is_condition_attributes_approved.is_(True),
                                        Condition.is_topic_tags_approved.is_(True)
                                    )
                                ),  # If any of the conditions are not True
                                0  # Not approved
                            ),
                            else_=1  # Approved
                        )
                    )
                ).label("status")
            ).outerjoin(
                Condition,
                Condition.amended_document_id == Amendment.amended_document_id
            ).filter(
                Amendment.document_id == document.id
            ).group_by(
                Amendment.amended_document_id,
                Amendment.amendment_name,
                Amendment.created_date,
                Amendment.date_issued
            ).all()

            # Append the main document to the result list
            result.append({
                'document_id': document.document_id,
                'document_label': document.document_label,
                'created_date': document.created_date,
                'year_issued': document.year_issued,
                'status': document.status,
                'is_latest_amendment_added': document.is_latest_amendment_added
            })

            # Append all amendments for the current document
            for amendment in amendments_query:
                result.append({
                    'document_id': amendment.document_id,
                    'document_label': amendment.document_label,
                    'created_date': amendment.created_date,
                    'year_issued': amendment.year_issued,
                    'status': amendment.status,
                    'parent_document_id': document.document_id
                })

        project_name = documents[0].project_name if documents else None
        document_category = documents[0].document_category if documents else None

        sorted_result = sorted(result, key=lambda x: x['created_date'])
        return {
            "project_name": project_name,
            "document_category": document_category,
            "documents": list(sorted_result)
        }

    @staticmethod
    def create_document(project_id, document):
        """Create new document."""
        required_fields = ["document_label", "document_type_id", "is_latest_amendment_added"]

        # Check if any required field is missing
        if any(document.get(field) is None or document.get(field) == ""
               for field in required_fields) or project_id is None:
            raise ValueError("Missing required fields. All fields except 'document_link' \
                             must be provided and cannot be empty.")

        document_id = document.get("document_id")
        if not document_id:
            # Generate a random ID using UUID and convert it to a string
            document_id = uuid.uuid4().hex

        date_issued = document.get("date_issued")
        if not date_issued:
            date_issued = date.today()

        new_document = Document(
            document_id=document_id,
            date_issued=date_issued,
            project_id=project_id,
            document_label=document.get("document_label"),
            document_link=document.get("document_link"),
            document_type_id=document.get("document_type_id"),
            document_category_id=document.get("document_category_id"),
            is_latest_amendment_added=document.get("is_latest_amendment_added"),
            is_active=True
        )
        db.session.add(new_document)
        db.session.flush()

        # Activate the project so the document is visible in the condition repository.
        project = db.session.query(Project).filter_by(project_id=project_id).first()
        if project:
            project.is_active = True

        db.session.commit()
        return new_document

    @staticmethod
    def update_document_details(document_id, document):
        """Update an existing document's details in place."""
        existing_document = db.session.query(Document).filter_by(document_id=document_id).first()
        if not existing_document:
            raise ValueError("Document not found")

        date_issued = document.get("date_issued")
        if not date_issued:
            date_issued = date.today()

        existing_document.document_label = document.get("document_label")
        existing_document.document_link = document.get("document_link")
        existing_document.document_type_id = document.get("document_type_id")
        existing_document.document_category_id = document.get("document_category_id")
        existing_document.date_issued = date_issued
        existing_document.is_latest_amendment_added = document.get("is_latest_amendment_added")
        existing_document.is_active = document.get("is_active")

        db.session.commit()
        return existing_document

    @staticmethod
    def get_all_documents_by_project_id(project_id, document_id=None, document_type=None):
        """Fetch all documents and its amendments for the given project_id."""
        documents_query = db.session.query(
            Document.id.label('document_record_id'),
            Document.document_id.label('document_id'),
            Document.document_label,
            Document.created_date
        ).outerjoin(
            Project,
            Project.project_id == Document.project_id
        ).filter(
            Project.project_id == project_id,
            Document.is_active.is_(True)
        )

        documents = documents_query.all()

        if not documents:
            # If no original document is found, return an empty list
            return []

        result = []

        ref_created_date = DocumentService.get_reference_created_date(document_id) if document_id else None
        for document in documents:
            result.append({
                "type": "document",
                'document_record_id': document.document_record_id,
                'document_id': document.document_id,
                'document_label': document.document_label
            })

            if document_type is not None and int(document_type) == DocumentType.Amendment.value:
                amendments = (
                    db.session.query(Amendment)
                    .filter(
                        Amendment.document_id == document.document_record_id,
                        Amendment.created_date < ref_created_date
                    )
                    .order_by(Amendment.date_issued)
                    .all()
                )

                for amendment in amendments:
                    result.append({
                        "type": "amendment",
                        'document_record_id': amendment.id,
                        'document_id': amendment.amended_document_id,
                        'document_label': amendment.amendment_name
                    })

        return result

    @staticmethod
    def get_reference_created_date(doc_id):
        """
        Returns the created_date for a document or amendment identified by doc_id.

        The method first attempts to find a matching Document using document_id.
        If not found, it then attempts to find a matching Amendment using
        amended_document_id.

        Args:
            doc_id (str): The document or amendment identifier.

        Returns:
            datetime | None: The created_date if found, otherwise None.
        """
        # Try document first
        doc = db.session.query(Document).filter(Document.document_id == doc_id).first()
        if doc:
            return doc.created_date

        # If not found, try amendment
        amendment = db.session.query(Amendment).filter(Amendment.amended_document_id == doc_id).first()
        if amendment:
            return amendment.created_date

        return None

    @staticmethod
    def get_document_details(document_id):
        """Fetch document details by document_id."""
        # Check if the document_id is an amendment
        is_amendment_document = (
            db.session.query(
                Amendment.document_id,
                Amendment.amended_document_id,
                Amendment.amendment_name,
                Amendment.document_type_id,
            )
            .filter(Amendment.amended_document_id == document_id)
            .first()
        )

        if is_amendment_document:
            amendment_detail = (
                db.session.query(
                    Project.project_name.label('project_name'),
                    Document.document_category_id.label('document_category_id'),
                    DocumentCategory.category_name.label('document_category'),
                    extract("year", Amendment.date_issued).label('year_issued')
                )
                .select_from(Document)
                .outerjoin(DocumentCategory, DocumentCategory.id == Document.document_category_id)
                .outerjoin(Project, Project.project_id == Document.project_id)
                .outerjoin(Amendment, Amendment.amended_document_id == document_id)
                .filter(Document.id == is_amendment_document.document_id)
                .first()
            )
            document = amendment_detail
        else:
            # Fetch the original document
            document = (
                db.session.query(
                    Project.project_name.label('project_name'),
                    Document.document_category_id.label('document_category_id'),
                    DocumentCategory.category_name.label('document_category'),
                    Document.document_id.label('document_id'),
                    Document.document_label.label('document_label'),
                    DocumentTypeModel.id.label('document_type_id'),
                    extract("year", Document.date_issued).label('year_issued')
                )
                .outerjoin(Project, Project.project_id == Document.project_id)
                .outerjoin(DocumentTypeModel, DocumentTypeModel.id == Document.document_type_id)
                .outerjoin(DocumentCategory, DocumentCategory.id == Document.document_category_id)
                .filter(Document.document_id == document_id)
                .first()
            )

            if not document:
                # If no original document is found, return
                return None

        return {
            "project_name": document.project_name,
            "document_category_id": document.document_category_id,
            "document_category": document.document_category,
            "document_id": (
                is_amendment_document.amended_document_id
                if is_amendment_document else document.document_id
            ),
            "document_label": (
                is_amendment_document.amendment_name
                if is_amendment_document else document.document_label
            ),
            "document_type_id": (
                is_amendment_document.document_type_id
                if is_amendment_document else document.document_type_id
            ),
            "year_issued": int(document.year_issued) if document.year_issued else None,
        }

    @staticmethod
    def update_document(document_id: str, document_label: str):
        """
        Update the document label for a specific document.

        If the document is an amendment, update `amendment_name`.
        Otherwise, update `document_label`.
        """
        if not document_id or not document_label:
            return None  # Ensure valid inputs

        # Check if the document_id is an amendment
        amendment = db.session.query(Amendment).filter_by(amended_document_id=document_id).first()

        if amendment:
            amendment.amendment_name = document_label
            db.session.add(amendment)
        else:
            document = db.session.query(Document).filter_by(document_id=document_id).first()
            if not document:
                return None  # Document does not exist

            document.document_label = document_label
            db.session.add(document)

        # Commit changes once to avoid redundant calls
        db.session.commit()

        # Return updated document details
        return DocumentService.get_document_details(document_id)

    @staticmethod
    def get_document_labels_by_project(project_id, document_type_id=None):
        """Fetch inactive document metadata for a project, optionally filtered by document type."""
        documents_query = (
            db.session.query(
                Document.document_id,
                Document.document_label,
                Document.date_issued,
                Document.act,
                Project.project_type,
            )
            .join(Project, Project.project_id == Document.project_id)
            .filter(Document.project_id == project_id, Document.is_active.is_(False))
            .order_by(Document.document_label)
        )

        if document_type_id:
            documents_query = documents_query.filter(Document.document_type_id == document_type_id)

        documents = documents_query.all()

        return [
            {
                "document_id": row.document_id,
                "document_label": row.document_label,
                "date_issued": str(row.date_issued) if row.date_issued else None,
                "act": row.act,
                "project_type": row.project_type,
            }
            for row in documents
        ]

    @staticmethod
    def get_available_documents(project_id):
        """Fetch all inactive documents for a project (synced but not yet added)."""
        documents = (
            db.session.query(
                Document.document_id,
                Document.document_label,
                Document.date_issued,
                DocumentTypeModel.document_type.label('document_type'),
            )
            .outerjoin(DocumentTypeModel, DocumentTypeModel.id == Document.document_type_id)
            .filter(
                Document.project_id == project_id,
                Document.is_active.is_(False)
            )
            .order_by(Document.date_issued.desc())
            .all()
        )

        if not documents:
            return []

        return [
            {
                "document_id": row.document_id,
                "document_label": row.document_label,
                "date_issued": str(row.date_issued) if row.date_issued else None,
                "document_type": row.document_type,
            }
            for row in documents
        ]

    @staticmethod
    def activate_document(document_id):
        """Activate a document to make it visible in the condition repo."""
        document = db.session.query(Document).filter_by(document_id=document_id).first()
        if not document:
            return None
        document.is_active = True
        db.session.commit()
        return document
