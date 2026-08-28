"""Tests for extraction request service behavior."""

from datetime import datetime
import uuid

from flask import g

from condition_api.models import (
    Condition,
    ConditionAttribute,
    ExtractionRequest,
    IEMTerms,
    ManagementPlan,
    Report,
    ReportSubmission,
    Subcondition,
    db,
)
from condition_api.services.extraction_request_service import ExtractionRequestService
from tests.utilities.factory_utils import (
    factory_document_model,
    factory_project_model,
    factory_user_model,
    get_seeded_document_type,
)
from tests.utilities.factory_scenarios import TestJwtClaims


def test_create_request_sets_uploaded_by_staff_user_id():
    """Create stores the uploader via an explicit staff user foreign key."""
    auth_guid = TestJwtClaims.staff_admin_role['sub']
    staff_user = factory_user_model(auth_guid=auth_guid)
    g.jwt_oidc_token_info = TestJwtClaims.staff_admin_role

    project = factory_project_model(project_id=str(uuid.uuid4()))
    doc_type = get_seeded_document_type("Certificate")
    document = factory_document_model(project_id=project.project_id, document_type_id=doc_type.id)

    result = ExtractionRequestService.create(
        {
            "project_id": project.project_id,
            "document_id": document.document_id,
            "document_type_id": doc_type.id,
            "document_label": document.document_label,
            "original_file_name": "uploaded.pdf",
            "s3_url": "condition_extraction_documents/uploaded.pdf",
            "file_size_bytes": 1234,
        }
    )

    assert result.uploaded_by_staff_user_id == staff_user.id
    assert result.uploaded_by_name


def test_reject_request_soft_rejects_and_clears_extracted_data():
    """Rejecting preserves the request for archive display but drops raw JSON."""
    project = factory_project_model(project_id=str(uuid.uuid4()))
    doc_type = get_seeded_document_type("Certificate")
    document = factory_document_model(project_id=project.project_id, document_type_id=doc_type.id)
    document.is_active = True
    request = ExtractionRequest(
        project_id=project.project_id,
        document_id=document.document_id,
        document_type_id=doc_type.id,
        document_label=document.document_label,
        s3_url="condition_extraction_documents/test.pdf",
        status="completed",
        extracted_data={"conditions": [{"condition_number": 1}]},
    )
    db.session.add(request)
    db.session.commit()

    result = ExtractionRequestService.reject_request(request.id)

    assert result.status == "rejected"
    assert result.extracted_data is None

    persisted = db.session.query(ExtractionRequest).filter_by(id=request.id).one()
    assert persisted.status == "rejected"
    assert persisted.extracted_data is None

    refreshed_document = db.session.query(type(document)).filter_by(document_id=document.document_id).one()
    assert refreshed_document.is_active is False


def test_import_request_loads_conditions_into_existing_document():
    """Import uses the request target document and writes conditions via the ORM service."""
    auth_guid = TestJwtClaims.staff_admin_role['sub']
    staff_user = factory_user_model(auth_guid=auth_guid)
    g.jwt_oidc_token_info = TestJwtClaims.staff_admin_role

    project = factory_project_model(project_id=str(uuid.uuid4()))
    doc_type = get_seeded_document_type("Certificate")
    document = factory_document_model(project_id=project.project_id, document_type_id=doc_type.id)
    request = ExtractionRequest(
        project_id=project.project_id,
        document_id=document.document_id,
        document_type_id=doc_type.id,
        document_label=document.document_label,
        s3_url="condition_extraction_documents/test.pdf",
        status="completed",
        extracted_data={
            "conditions": [
                {
                    "condition_number": 1,
                    "condition_name": "Construction Environmental Management Plan",
                    "condition_text": "Prepare and implement the plan.",
                    "topic_tags": ["Environmental", "Water"],
                    "subtopic_tags": ["Fish"],
                    "deliverables": [
                        {
                            "is_plan": True,
                            "deliverable_name": "Construction Environmental Management Plan",
                            "management_plan_acronym": "CEMP",
                            "approval_type": "review",
                            "related_phase": "construction",
                            "days_prior_to_commencement": "30",
                            "fn_consultation_required": True,
                            "stakeholders_to_consult": ["Nation A", "Nation B"],
                            "stakeholders_to_submit_to": ["EAO"],
                            "implementation_phase": "construction",
                        }
                    ],
                    "clauses": [
                        {
                            "clause_identifier": "1.a",
                            "clause_text": "First nested clause",
                            "subconditions": [
                                {
                                    "subcondition_identifier": "1.a.i",
                                    "subcondition_text": "Second nested clause",
                                }
                            ],
                        }
                    ],
                }
            ]
        },
    )
    db.session.add(request)
    db.session.commit()

    result = ExtractionRequestService.import_request(request.id)

    assert result.status == "imported"
    assert result.extracted_data is None
    assert result.imported_by_staff_user_id == staff_user.id
    assert result.imported_by_name

    condition = db.session.query(Condition).filter_by(document_id=document.document_id).one()
    assert condition.project_id == project.project_id
    assert condition.condition_name == "Construction Environmental Management Plan"
    assert condition.requires_management_plan is True

    plans = db.session.query(ManagementPlan).filter_by(condition_id=condition.id).all()
    assert len(plans) == 1
    assert plans[0].name == "Construction Environmental Management Plan"

    subconditions = (
        db.session.query(Subcondition)
        .filter_by(condition_id=condition.id)
        .order_by(Subcondition.sort_order.asc(), Subcondition.id.asc())
        .all()
    )
    assert len(subconditions) == 2
    assert subconditions[0].subcondition_identifier == "1.a"
    assert subconditions[1].parent_subcondition_id == subconditions[0].id

    attributes = db.session.query(ConditionAttribute).filter_by(condition_id=condition.id).all()
    assert len(attributes) >= 6


def test_import_request_loads_reports_and_resolves_cross_condition_plan_link():
    """A report can link to a management plan created by a different condition in the same document."""
    auth_guid = TestJwtClaims.staff_admin_role['sub']
    factory_user_model(auth_guid=auth_guid)
    g.jwt_oidc_token_info = TestJwtClaims.staff_admin_role

    project = factory_project_model(project_id=str(uuid.uuid4()))
    doc_type = get_seeded_document_type("Certificate")
    document = factory_document_model(project_id=project.project_id, document_type_id=doc_type.id)
    request = ExtractionRequest(
        project_id=project.project_id,
        document_id=document.document_id,
        document_type_id=doc_type.id,
        document_label=document.document_label,
        s3_url="condition_extraction_documents/test.pdf",
        status="completed",
        extracted_data={
            "conditions": [
                {
                    "condition_number": 1,
                    "condition_name": "Condition 1",
                    "condition_text": "Prepare and implement the plan.",
                    "deliverables": [
                        {
                            "is_plan": True,
                            "deliverable_name": "Aquatic Effects Monitoring Plan",
                        }
                    ],
                    "report_submissions": [],
                },
                {
                    "condition_number": 12,
                    "condition_name": "Condition 12",
                    "condition_text": "Submit monitoring results annually.",
                    "deliverables": [],
                    "report_submissions": [
                        {
                            "report_type": "Management Plan Associated Report",
                            "report_title": "Annual Aquatic Effects Monitoring Report",
                            "linked_management_plan_name": "aquatic effects monitoring plan",
                            "recipients": ["EAO", "MOE"],
                            "submission_schedule": [
                                {
                                    "phase": "Operations",
                                    "frequency": "Annually",
                                    "timing": "By March 31 each year",
                                }
                            ],
                        },
                        {
                            "report_type": "Compliance Notification",
                            "report_title": "Non-Compliance Notification",
                            "linked_management_plan_name": None,
                            "recipients": [],
                            "submission_schedule": [
                                {
                                    "phase": "All Phases",
                                    "frequency": "As Needed",
                                    "timing": "Within 72 hours of non-compliance",
                                }
                            ],
                        },
                    ],
                },
            ]
        },
    )
    db.session.add(request)
    db.session.commit()

    ExtractionRequestService.import_request(request.id)

    plan = db.session.query(ManagementPlan).filter_by(condition_id=(
        db.session.query(Condition).filter_by(condition_number=1, document_id=document.document_id).one().id
    )).one()
    assert plan.name == "Aquatic Effects Monitoring Plan"

    condition_12 = db.session.query(Condition).filter_by(condition_number=12, document_id=document.document_id).one()
    assert condition_12.requires_report is True

    reports = db.session.query(Report).filter_by(condition_id=condition_12.id).order_by(Report.id.asc()).all()
    assert len(reports) == 2

    mp_report = reports[0]
    assert mp_report.report_type == "Management Plan Associated Report"
    assert mp_report.recipients == ["EAO", "MOE"]

    mp_submission = db.session.query(ReportSubmission).filter_by(report_id=mp_report.id).one()
    assert mp_submission.phase == "Operations"
    assert mp_submission.frequency == "Annually"
    assert mp_submission.report_title == "Annual Aquatic Effects Monitoring Report"
    assert mp_submission.linked_management_plan_id == plan.id

    cn_report = reports[1]
    assert cn_report.report_type == "Compliance Notification"
    cn_submission = db.session.query(ReportSubmission).filter_by(report_id=cn_report.id).one()
    assert cn_submission.linked_management_plan_id is None


def test_import_request_routes_iem_deliverable_to_iem_terms_not_management_plan():
    """A deliverable flagged as the IEM Terms of Engagement lands in iem_terms, not management_plans."""
    auth_guid = TestJwtClaims.staff_admin_role['sub']
    factory_user_model(auth_guid=auth_guid)
    g.jwt_oidc_token_info = TestJwtClaims.staff_admin_role

    project = factory_project_model(project_id=str(uuid.uuid4()))
    doc_type = get_seeded_document_type("Certificate")
    document = factory_document_model(project_id=project.project_id, document_type_id=doc_type.id)
    request = ExtractionRequest(
        project_id=project.project_id,
        document_id=document.document_id,
        document_type_id=doc_type.id,
        document_label=document.document_label,
        s3_url="condition_extraction_documents/test.pdf",
        status="completed",
        extracted_data={
            "conditions": [
                {
                    "condition_number": 1,
                    "condition_name": "Condition 1",
                    "condition_text": "The IEM Terms of Engagement must be submitted to the EAO.",
                    "deliverables": [
                        {
                            "is_plan": True,
                            "is_iem_terms_of_engagement": True,
                            "deliverable_name": "Independent Environmental Monitor Terms of Engagement",
                            "approval_type": "Approval",
                            "fn_consultation_required": True,
                            "stakeholders_to_consult": ["Nation A"],
                        },
                        {
                            "is_plan": True,
                            "deliverable_name": "Construction Environmental Management Plan",
                            "approval_type": "Review",
                        },
                    ],
                }
            ]
        },
    )
    db.session.add(request)
    db.session.commit()

    ExtractionRequestService.import_request(request.id)

    condition = db.session.query(Condition).filter_by(document_id=document.document_id).one()
    assert condition.requires_iem_terms is True
    assert condition.requires_management_plan is True

    iem_packages = db.session.query(IEMTerms).filter_by(condition_id=condition.id).all()
    assert len(iem_packages) == 1
    assert iem_packages[0].name == "Independent Environmental Monitor Terms of Engagement"

    plans = db.session.query(ManagementPlan).filter_by(condition_id=condition.id).all()
    assert len(plans) == 1
    assert plans[0].name == "Construction Environmental Management Plan"

    iem_attributes = db.session.query(ConditionAttribute).filter_by(
        condition_id=condition.id, iem_terms_id=iem_packages[0].id
    ).all()
    assert len(iem_attributes) >= 2
    assert all(attr.management_plan_id is None for attr in iem_attributes)

    plan_attributes = db.session.query(ConditionAttribute).filter_by(
        condition_id=condition.id, management_plan_id=plans[0].id
    ).all()
    assert all(attr.iem_terms_id is None for attr in plan_attributes)


def test_get_all_adds_queue_position_and_estimates(monkeypatch):
    """Pending and processing requests should expose queue metadata for the UI."""
    project = factory_project_model(project_id=str(uuid.uuid4()))
    doc_type = get_seeded_document_type("Certificate")
    document = factory_document_model(
        project_id=project.project_id,
        document_type_id=doc_type.id,
    )

    processing_request = ExtractionRequest(
        project_id=project.project_id,
        document_id=document.document_id,
        document_label="Processing document",
        s3_url="condition_extraction_documents/processing.pdf",
        status="processing",
        created_date=datetime(2026, 4, 29, 8, 0, 0),
        updated_date=datetime(2026, 4, 29, 8, 5, 0),
    )
    first_pending_request = ExtractionRequest(
        project_id=project.project_id,
        document_id=document.document_id,
        document_label="Queued document 1",
        s3_url="condition_extraction_documents/pending-1.pdf",
        status="pending",
        created_date=datetime(2026, 4, 29, 8, 1, 0),
    )
    second_pending_request = ExtractionRequest(
        project_id=project.project_id,
        document_id=document.document_id,
        document_label="Queued document 2",
        s3_url="condition_extraction_documents/pending-2.pdf",
        status="pending",
        created_date=datetime(2026, 4, 29, 8, 2, 0),
    )
    db.session.add_all([processing_request, first_pending_request, second_pending_request])
    db.session.commit()

    monkeypatch.setattr(
        ExtractionRequestService,
        "_get_queue_reference_time",
        staticmethod(lambda: datetime(2026, 4, 29, 8, 10, 0)),
    )

    results = ExtractionRequestService.get_all()
    results_by_id = {result.id: result for result in results}

    assert results_by_id[processing_request.id].queue_position is None
    assert results_by_id[processing_request.id].estimated_wait_minutes == 0
    assert results_by_id[processing_request.id].estimated_ready_minutes == 10

    assert results_by_id[first_pending_request.id].queue_position == 1
    assert results_by_id[first_pending_request.id].estimated_wait_minutes == 30
    assert results_by_id[first_pending_request.id].estimated_ready_minutes == 45

    assert results_by_id[second_pending_request.id].queue_position == 2
    assert results_by_id[second_pending_request.id].estimated_wait_minutes == 60
    assert results_by_id[second_pending_request.id].estimated_ready_minutes == 75
