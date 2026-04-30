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


# pylint: disable=too-many-lines

"""Service for condition management."""
import re
from collections import defaultdict
from datetime import datetime

from flask import current_app
from sqlalchemy import and_, case, extract, func, not_
from sqlalchemy.orm import aliased

from condition_api.exceptions import ConditionNumberExistsError, ConditionNumberExistsInProjectError
from condition_api.models.amendment import Amendment
from condition_api.models.attribute_key import AttributeKey
from condition_api.models.condition import Condition
from condition_api.models.condition_attribute import ConditionAttribute
from condition_api.models.db import db
from condition_api.models.document import Document
from condition_api.models.document_category import DocumentCategory
from condition_api.models.document_type import DocumentType
from condition_api.models.management_plan import ManagementPlan
from condition_api.models.project import Project
from condition_api.models.subcondition import Subcondition
from condition_api.schemas.condition import ConsolidatedConditionSchema, ProjectDocumentConditionSchema
from condition_api.utils.enums import AttributeKeys, ConditionType, IEMTermsConfig


class ConditionService:
    """Service for managing condition-related operations."""

    @staticmethod
    def get_condition_details(project_id, document_id, condition_id):
        """Fetch condition details along with related condition attributes by project ID."""
        # Aliases for the tables
        projects = aliased(Project)
        amendments = aliased(Amendment)

        # Check for amendment and resolve base document info
        is_amendment, base_document_info = ConditionService._get_base_document_info(
            document_id, amendments)

        # Fetch project metadata
        project_name = ConditionService._get_project_name(project_id, projects)

        # Fetch condition + subconditions
        condition_rows = ConditionService._fetch_condition_data(
            is_amendment,
            base_document_info,
            document_id,
            condition_id
        )
        if not condition_rows:
            return None

        condition = ConditionService._build_condition_structure(condition_rows)

        # Fetch and attach condition attributes
        condition["condition_attributes"] = ConditionService._fetch_condition_attributes(
            condition_rows[0].requires_management_plan, condition_id)

        # Extract static document metadata from the first row
        first = condition_rows[0]
        return {
            "project_name": project_name,
            "document_category_id": first.document_category_id,
            "document_category": first.document_category,
            "document_label": first.document_label,
            "condition": condition,
        }

    # pylint: disable=too-many-locals
    @staticmethod
    def get_all_conditions(
        project_id,
        document_id,
        include_nested_conditions=False,
        active_only=False
    ):
        """Fetch all conditions and their related subconditions by project ID and document ID."""
        # Aliases for the tables
        aliases = {
            "projects": aliased(Project),
            "documents": aliased(Document),
            "amendments": aliased(Amendment),
            "conditions": aliased(Condition),
        }

        documents = aliases["documents"]
        amendments = aliases["amendments"]
        conditions = aliases["conditions"]

        # Check if the document_id is an amendment
        is_amendment, base_document_info = ConditionService._get_base_document_info(
            document_id, aliases["amendments"])

        condition_join, document_label_query, date_issued_query, base_table = (
            ConditionService._get_document_context(
                is_amendment, base_document_info,
                aliases["documents"], aliases["amendments"], aliases["conditions"]
            )
        )

        amendment_subquery = ConditionService._build_amendment_subquery(
            project_id, document_id, aliases
        )

        # Query for all conditions and their related subconditions and attributes
        condition_data = (
            db.session.query(
                document_label_query,
                conditions.id.label('condition_id'),
                conditions.condition_name,
                conditions.condition_number,
                conditions.condition_text,
                case(
                    (
                        and_(
                            conditions.is_approved.is_(True),  # Check if condition is approved
                            conditions.is_condition_attributes_approved.is_(True),  # Check if attributes are approved
                            conditions.is_topic_tags_approved.is_(True)  # Check if topic tags are approved
                        ),
                        True  # All conditions are met
                    ),
                    else_=False  # At least one condition is not met
                ).label('is_approved'),  # Derived column for the calculated approval status
                conditions.is_active,
                conditions.is_standard_condition,
                conditions.topic_tags,
                conditions.subtopic_tags,
                amendment_subquery.c.amendment_names,
                date_issued_query
            )
            .select_from(base_table)
            .outerjoin(
                conditions,
                condition_join
            )
            .outerjoin(
                amendment_subquery,
                and_(
                    conditions.condition_number == amendment_subquery.c.condition_number,
                    conditions.document_id == amendment_subquery.c.document_id
                )
            )
            .filter(
                (
                    (amendments.amended_document_id == base_document_info.amended_document_id)
                    if is_amendment
                    else (documents.document_id == document_id and conditions.amended_document_id is None)
                )
            )
            .filter(
                not_(
                    and_(
                        conditions.condition_name.is_(None),
                        conditions.condition_number.is_(None)
                    )
                )
            )
            .filter(conditions.is_active.is_(True) if active_only else True)
            .group_by(
                conditions.id,
                conditions.condition_name,
                conditions.condition_number,
                conditions.condition_text,
                conditions.is_approved,
                conditions.is_condition_attributes_approved,
                conditions.is_topic_tags_approved,
                conditions.is_active,
                conditions.is_standard_condition,
                conditions.topic_tags,
                conditions.subtopic_tags,
                amendment_subquery.c.amendment_names,
                date_issued_query,
                document_label_query
            )
            .order_by(conditions.condition_number)
            .all()
        )

        conditions_map = {}

        # Process the query result
        for row in condition_data:
            cond_id = row.condition_id

            # Add each condition to the map if not already present
            conditions_map[cond_id] = {
                "condition_id": row.condition_id,
                "condition_name": row.condition_name,
                "condition_number": row.condition_number,
                "condition_text": row.condition_text,
                "is_approved": row.is_approved,
                "is_active": row.is_active,
                "is_standard_condition": row.is_standard_condition,
                "topic_tags": row.topic_tags,
                "subtopic_tags": row.subtopic_tags,
                "amendment_names": row.amendment_names,
                "year_issued": row.year_issued,
                "condition_attributes": [],
                "subconditions": []
            }

            if include_nested_conditions:
                ConditionService._populate_subconditions(conditions_map, cond_id)

        # Return all conditions
        return {
            "conditions": list(conditions_map.values())
        }

    @staticmethod
    def _get_document_context(is_amendment, base_document_info, documents, amendments, conditions):

        if is_amendment:
            amendment_label_subquery = (
                db.session.query(amendments.amendment_name)
                .filter(amendments.amended_document_id == base_document_info.amended_document_id)
                .subquery()
            )
            document_label_query = amendment_label_subquery.c.amendment_name.label("document_label")
            condition_join = amendments.amended_document_id == conditions.amended_document_id
            date_issued_query = extract("year", amendments.date_issued).label("year_issued")
            base_table = amendments
        else:
            condition_join = and_(
                documents.document_id == conditions.document_id,
                conditions.amended_document_id.is_(None)
            )
            document_label_query = documents.document_label
            date_issued_query = extract("year", documents.date_issued).label("year_issued")
            base_table = documents

        return condition_join, document_label_query, date_issued_query, base_table

    @staticmethod
    def _build_amendment_subquery(project_id, document_id, aliases):
        projects = aliases["projects"]
        documents = aliases["documents"]
        amendments = aliases["amendments"]
        conditions = aliases["conditions"]

        return (
            db.session.query(
                conditions.condition_number,
                conditions.document_id.label("document_id"),
                func.string_agg(amendments.amendment_name.distinct(), ', ').label('amendment_names')
            )
            .join(conditions, conditions.amended_document_id == amendments.amended_document_id)
            .join(documents, conditions.document_id == documents.document_id)
            .join(projects, projects.project_id == documents.project_id)
            .filter(
                (projects.project_id == project_id) & (documents.document_id == document_id) &
                (conditions.condition_type == ConditionType.AMEND)
            )
            .group_by(conditions.condition_number, conditions.document_id)
            .subquery()
        )

    @staticmethod
    def _populate_subconditions(conditions_map, cond_id):
        """Populates sub conditions"""
        subcondition_map = {}
        top_level_subconditions = []

        # First pass: create all subcondition objects
        for sub_row in ConditionService._fetch_subconditions(cond_id):
            # Handle subconditions
            subcond_id = sub_row.subcondition_id
            if subcond_id:
                subcondition_map[subcond_id] = {
                    "subcondition_identifier": sub_row.subcondition_identifier,
                    "subcondition_text": sub_row.subcondition_text,
                    "sort_order": sub_row.sort_order,
                    "subconditions": []
                }

        # Second pass: assign parent-child relationships
        for sub_row in ConditionService._fetch_subconditions(cond_id):
            subcond_id = sub_row.subcondition_id
            parent_id = sub_row.parent_subcondition_id

            if subcond_id:
                subcondition = subcondition_map[subcond_id]
                if parent_id:
                    parent = subcondition_map.get(parent_id)
                    if parent:
                        parent["subconditions"].append(subcondition)
                else:
                    # No parent means top-level subcondition
                    top_level_subconditions.append(subcondition)

        # Attach top-level subconditions to the condition
        conditions_map[cond_id]["subconditions"] = top_level_subconditions

    @staticmethod
    def _fetch_subconditions(cond_id):
        """Fetch sub conditions"""
        subconditions = aliased(Subcondition)
        results = db.session.query(
            subconditions.id.label('subcondition_id'),
            subconditions.subcondition_identifier,
            subconditions.subcondition_text,
            subconditions.sort_order,
            subconditions.parent_subcondition_id
        ).filter(
            subconditions.condition_id == cond_id
        ).order_by(
            subconditions.parent_subcondition_id.nullsfirst(),  # ensure parents come first
            subconditions.sort_order
        ).all()
        return results

    @staticmethod
    def update_condition(
        conditions_data,
        condition_id=None,
        check_condition_exists=None,
        check_condition_over_project=None,
        allow_duplicate_condition=None,
    ):
        """
        Update the approved status, topic tags, and subconditions of a specific condition.

        This method accepts either:
        1. condition_id as input.
        """
        condition = db.session.query(Condition).filter_by(id=condition_id).one_or_none()

        if not condition:
            raise ValueError("Condition not found for the given condition ID.")

        condition_number = conditions_data.get("condition_number")

        if check_condition_exists:
            ConditionService._check_duplicate_condition_number(condition, condition_id, condition_number)

        if check_condition_over_project:
            ConditionService._check_condition_conflict_in_project(condition, condition_number)
        # Mark existing condition inactive if needed
        if condition.amended_document_id and not check_condition_over_project and not allow_duplicate_condition:
            ConditionService._deactivate_existing_condition(condition, condition_number)

        # Update condition fields
        if any(k != "subconditions" for k in conditions_data):
            ConditionService._update_from_dict(condition, conditions_data)

        # Handle subconditions
        if "subconditions" in conditions_data:
            ConditionService._update_subconditions(condition_id, conditions_data.get("subconditions") or [])

        condition.commit()
        return condition

    @staticmethod
    def _check_duplicate_condition_number(condition, condition_id, condition_number):
        # Check if the same condition number exists in the same document or amendment
        query = db.session.query(Condition.condition_number).filter(
            Condition.id != condition_id
        )

        if condition.amended_document_id is None:
            query = query.filter(
                Condition.document_id == condition.document_id,
                Condition.amended_document_id.is_(None),
            )
        else:
            query = query.filter(
                Condition.amended_document_id == condition.amended_document_id
            )

        existing_numbers = [num[0] for num in query.all() if num[0] is not None]
        if condition_number in existing_numbers:
            raise ConditionNumberExistsError("This condition number already exists. Please enter a new one.")

    @staticmethod
    def _check_condition_conflict_in_project(condition, condition_number):
        query = db.session.query(
            Condition.condition_number, Condition.project_id, Condition.document_id, Condition.condition_name
        ).filter(
            Condition.project_id == condition.project_id,
            Condition.amended_document_id.is_(None),
        )

        condition_map = {
            c[0]: {"project_id": c[1], "document_id": c[2], "condition_name": c[3]}
            for c in query.all() if c[0] is not None
        }

        if condition_number in condition_map:
            meta = condition_map[condition_number]
            project = db.session.query(Project).filter_by(project_id=meta["project_id"]).first()
            document = db.session.query(Document).filter_by(document_id=meta["document_id"]).first()

            project_name = project.project_name if project else "Unknown Project"
            document_name = document.document_label if document else "Unknown Document"
            condition_name = meta.get("condition_name", "Unknown")
            if condition.amended_document_id:
                raise ConditionNumberExistsInProjectError(
                    f"Adding this condition will amend condition <b>{condition_number}) {condition_name}</b> in "
                    f"<b>{document_name}</b> of <b>{project_name}</b>.<br/><br/>Are you sure you wish to proceed?",
                    is_amendment=True
                )

            raise ConditionNumberExistsInProjectError(
                f"This condition number already exists in <b>{document_name}</b> of "
                f"<b>{project_name}</b>.<br/><br/>Are you sure you wish to proceed?",
                is_amendment=False
            )

    @staticmethod
    def _deactivate_existing_condition(condition, condition_number):
        existing = db.session.query(Condition).filter(
            Condition.document_id == condition.document_id,
            Condition.condition_number == condition_number,
            Condition.amended_document_id.is_(None)
        ).first()

        if existing:
            existing.is_active = False
            existing.effective_to = datetime.utcnow()
            db.session.add(existing)

    @staticmethod
    def _update_subconditions(condition_id, subconditions):
        existing_ids = ConditionService._collect_existing_subcondition_ids(subconditions)

        delete_query = db.session.query(Subcondition).filter(
            Subcondition.condition_id == condition_id
        )

        if existing_ids:
            delete_query = delete_query.filter(Subcondition.id.notin_(existing_ids))

        delete_query.delete(synchronize_session=False)

        ConditionService.upsert_subconditions(condition_id, subconditions, None)

    @staticmethod
    def _collect_existing_subcondition_ids(subconditions):
        existing_ids = []

        for subcondition in subconditions:
            subcondition_id = subcondition.get("subcondition_id")

            if str(subcondition_id).isdigit():
                existing_ids.append(int(subcondition_id))

            existing_ids.extend(
                ConditionService._collect_existing_subcondition_ids(
                    subcondition.get("subconditions") or []
                )
            )

        return existing_ids

    @staticmethod
    def _update_from_dict(condition_item: Condition, input_dict: dict):
        """Update a SQLAlchemy model instance from a dictionary."""
        if not isinstance(condition_item, Condition):
            raise TypeError(f"Expected a Condition model instance, got {type(condition_item).__name__}")

        allowed_list_keys = {"topic_tags", "subtopic_tags"}

        # Update only attributes that exist on the model
        for key, value in input_dict.items():
            if hasattr(condition_item, key):
                if key in allowed_list_keys:
                    setattr(condition_item, key, value)
                elif not isinstance(value, (list, dict)):
                    setattr(condition_item, key, value)

    @staticmethod
    def upsert_subconditions(condition_id, subconditions, parent_id=None):
        """Update on insert sub conditions"""
        for idx, subcond_data in enumerate(subconditions):
            subcondition_id = subcond_data.get("subcondition_id")
            sort_order = idx + 1

            # Check if the subcondition exists
            if "-" in str(subcondition_id):
                existing_subcondition = False
            else:
                existing_subcondition = db.session.query(Subcondition).filter_by(
                    id=subcondition_id, condition_id=condition_id
                ).first()

            if existing_subcondition:
                # Update the existing subcondition
                existing_subcondition.subcondition_identifier = subcond_data.get("subcondition_identifier")
                existing_subcondition.subcondition_text = subcond_data.get("subcondition_text")
                existing_subcondition.parent_subcondition_id = parent_id
                existing_subcondition.sort_order = sort_order
            else:
                # Insert a new subcondition
                new_subcondition = Subcondition(
                    condition_id=condition_id,
                    subcondition_identifier=subcond_data.get("subcondition_identifier"),
                    subcondition_text=subcond_data.get("subcondition_text"),
                    parent_subcondition_id=parent_id,
                    sort_order=sort_order
                )
                db.session.add(new_subcondition)
                db.session.flush()  # Ensure we get the ID of the newly added subcondition

                # Set the ID for further nested subconditions
                subcondition_id = new_subcondition.id

            # Recursively handle child subconditions
            if "subconditions" in subcond_data:
                ConditionService.upsert_subconditions(
                    condition_id, subcond_data["subconditions"], parent_id=subcondition_id)

    @staticmethod
    def create_condition(project_id, document_id, conditions_data,
                         allow_duplicate_condition=None, check_condition_over_project=None):
        """Create a new condition."""
        amendment = (
            db.session.query(Amendment.document_id)
            .filter(Amendment.amended_document_id == document_id)
            .first()
        )

        amended_document_id = document_id if amendment else None

        if amendment:
            document = (
                db.session.query(Document.document_id)
                .filter(Document.id == amendment[0])
                .first()
            )
            final_document_id = document[0]
            # Check if a condition exists with the given document_id and condition_number
            existing_conditions = (
                db.session.query(Condition)
                .filter(
                    Condition.document_id == final_document_id,
                    Condition.condition_number == conditions_data.get("condition_number"),
                    Condition.is_active.is_(True)
                )
                .all()
            )

            ConditionService._check_duplicate_condition_number(
                condition=Condition(
                    document_id=final_document_id,
                    amended_document_id=amended_document_id
                ),
                condition_id=None,  # None since we are creating a new one
                condition_number=conditions_data.get("condition_number")
            )

            # If it exists, update is_active to False
            if existing_conditions and not allow_duplicate_condition:
                for condition in existing_conditions:
                    condition.is_active = False
                    condition.effective_to = datetime.utcnow()
                    db.session.add(condition)
        else:
            final_document_id = document_id
            # Check for duplicate condition number within the same document
            condition_number = conditions_data.get("condition_number")
            if condition_number:
                ConditionService._check_duplicate_condition_number(
                    condition=Condition(
                        document_id=final_document_id,
                        amended_document_id=None
                    ),
                    condition_id=None,
                    condition_number=condition_number
                )

        # Check for condition number conflict across the project
        condition_number = conditions_data.get("condition_number")
        if check_condition_over_project and condition_number:
            temp_condition = Condition(
                document_id=final_document_id,
                amended_document_id=amended_document_id,
                project_id=project_id
            )
            ConditionService._check_condition_conflict_in_project(
                temp_condition, condition_number)

        new_condition = Condition(
            document_id=final_document_id,
            amended_document_id=amended_document_id,
            project_id=project_id,
            is_approved=False,
            condition_name=conditions_data.get("condition_name"),
            condition_number=conditions_data.get("condition_number"),
            condition_text=conditions_data.get("condition_text"),
            is_standard_condition=conditions_data.get("is_standard_condition"),
            topic_tags=conditions_data.get("topic_tags"),
            subtopic_tags=conditions_data.get("subtopic_tags"),
            condition_type=conditions_data.get("condition_type"),
            requires_management_plan=conditions_data.get("requires_management_plan"),
            effective_from=datetime.utcnow()
        )
        db.session.add(new_condition)
        db.session.flush()

        if conditions_data.get("subconditions"):
            ConditionService.create_subconditions(
                new_condition.id, conditions_data.get("subconditions"), None)

        db.session.commit()

        source_condition_id = conditions_data.get("condition_id")
        if source_condition_id:
            try:
                source_condition_id = int(source_condition_id)
            except (ValueError, TypeError):
                source_condition_id = None
        if source_condition_id:
            ConditionService._copy_condition_attributes(source_condition_id, new_condition.id)

        return {
            "condition_id": new_condition.id
        }

    @staticmethod
    def create_subconditions(condition_id, subconditions, parent_id=None):
        """Create sub conditions"""
        for idx, subcond_data in enumerate(subconditions):
            sort_order = idx + 1
            new_subcondition = Subcondition(
                condition_id=condition_id,
                subcondition_identifier=subcond_data.get("subcondition_identifier"),
                subcondition_text=subcond_data.get("subcondition_text"),
                parent_subcondition_id=parent_id,
                sort_order=sort_order
            )
            db.session.add(new_subcondition)
            db.session.flush()

            subcondition_id = new_subcondition.id

            if "subconditions" in subcond_data:
                ConditionService.upsert_subconditions(
                    condition_id, subcond_data["subconditions"], parent_id=subcondition_id)

    @staticmethod
    def _copy_condition_attributes(source_condition_id, target_condition_id):
        """Copy requires_management_plan flag, management plans, and condition attributes from source to target."""
        source_condition = db.session.query(Condition).filter_by(id=source_condition_id).first()
        if source_condition and source_condition.requires_management_plan is not None:
            target_condition = db.session.query(Condition).filter_by(id=target_condition_id).first()
            if target_condition:
                target_condition.requires_management_plan = source_condition.requires_management_plan

        source_plans = db.session.query(ManagementPlan).filter_by(
            condition_id=source_condition_id
        ).all()

        plan_id_map = {}
        for plan in source_plans:
            new_plan = ManagementPlan(condition_id=target_condition_id, name=plan.name)
            db.session.add(new_plan)
            db.session.flush()
            plan_id_map[plan.id] = new_plan.id

        source_attrs = db.session.query(ConditionAttribute).filter_by(
            condition_id=source_condition_id
        ).all()

        for attr in source_attrs:
            new_management_plan_id = (
                plan_id_map.get(attr.management_plan_id)
                if attr.management_plan_id else None
            )
            new_attr = ConditionAttribute(
                condition_id=target_condition_id,
                attribute_key_id=attr.attribute_key_id,
                attribute_value=attr.attribute_value,
                management_plan_id=new_management_plan_id
            )
            db.session.add(new_attr)

        db.session.commit()

    @staticmethod
    def get_condition_details_by_id(condition_id):
        """Fetch all conditions and their related details by condition ID."""
        condition_data = ConditionService._get_condition_data(condition_id)
        if not condition_data:
            return None

        document_label, year_issued, actual_document_id = ConditionService._get_document_info(condition_data)

        project_data = (
            db.session.query(
                Project.project_id,
                Project.project_name,
                DocumentType.document_category_id,
                DocumentCategory.category_name.label("document_category")
            )
            .outerjoin(Document, Project.project_id == Document.project_id)
            .outerjoin(DocumentType, DocumentType.id == Document.document_type_id)
            .outerjoin(DocumentCategory, DocumentCategory.id == DocumentType.document_category_id)
            .filter(Document.document_id == condition_data.document_id)
            .first()
        )

        project_id = project_data.project_id if project_data else None
        project_name = project_data.project_name if project_data else None
        document_category = project_data.document_category if project_data else None
        document_category_id = project_data.document_category_id if project_data else None

        condition_details = {
            "condition_id": condition_data.id,
            "condition_name": condition_data.condition_name,
            "condition_number": condition_data.condition_number,
            "condition_text": condition_data.condition_text,
            "is_approved": condition_data.is_approved,
            "is_standard_condition": condition_data.is_standard_condition,
            "topic_tags": condition_data.topic_tags,
            "subtopic_tags": condition_data.subtopic_tags,
            "year_issued": year_issued,
            "condition_attributes": [],
            "subconditions": []
        }

        condition_details["subconditions"] = ConditionService._build_nested_subconditions(condition_id)

        return {
            "project_id": project_id,
            "project_name": project_name,
            "document_category_id": document_category_id,
            "document_category": document_category,
            "document_id": actual_document_id,
            "document_label": document_label,
            "condition": condition_details
        }

    @staticmethod
    def _get_condition_data(condition_id):
        return db.session.query(
            Condition.id,
            Condition.document_id,
            Condition.amended_document_id,
            Condition.condition_name,
            Condition.condition_number,
            Condition.condition_text,
            Condition.is_approved,
            Condition.is_standard_condition,
            Condition.topic_tags,
            Condition.subtopic_tags
        ).filter(Condition.id == condition_id).first()

    @staticmethod
    def _get_document_info(condition_data):
        amended_document_id = condition_data.amended_document_id

        if amended_document_id:
            amendment_data = (
                db.session.query(
                    Amendment.amended_document_id,
                    Amendment.amendment_name.label("document_label"),
                    extract("year", Amendment.date_issued).label("year_issued")
                )
                .filter(Amendment.amended_document_id == amended_document_id)
                .first()
            )
            actual_document_id = amendment_data.amended_document_id if amendment_data else None
            document_label = amendment_data.document_label if amendment_data else None
            year_issued = amendment_data.year_issued if amendment_data else None
        else:
            actual_document_id = condition_data.document_id
            document_details = db.session.query(
                Document.document_label,
                extract("year", Document.date_issued).label("year_issued")
            ).filter(Document.document_id == actual_document_id).first()

            document_label = document_details.document_label if document_details else None
            year_issued = document_details.year_issued if document_details else None

        return document_label, year_issued, actual_document_id

    @staticmethod
    def _build_nested_subconditions(condition_id):
        sub_condition_data = (
            db.session.query(
                Subcondition.id.label('subcondition_id'),
                Subcondition.subcondition_identifier,
                Subcondition.subcondition_text,
                Subcondition.parent_subcondition_id,
                Subcondition.sort_order
            )
            .filter(Subcondition.condition_id == condition_id)
            .order_by(Subcondition.sort_order)
            .all()
        )

        subcondition_map = {}
        nested_subconditions = []

        for row in sub_condition_data:
            subcondition_map[row.subcondition_id] = {
                "subcondition_id": row.subcondition_id,
                "subcondition_identifier": row.subcondition_identifier,
                "subcondition_text": row.subcondition_text,
                "sort_order": row.sort_order,
                "subconditions": []
            }

        for row in sub_condition_data:
            current = subcondition_map[row.subcondition_id]
            if row.parent_subcondition_id:
                parent = subcondition_map.get(row.parent_subcondition_id)
                if parent:
                    parent["subconditions"].append(current)
                else:
                    nested_subconditions.append(current)
            else:
                nested_subconditions.append(current)

        return nested_subconditions

    @staticmethod
    def delete_condition(condition_id):
        """Remove condition data."""
        query = db.session.query(Condition).filter(Condition.id == condition_id)
        query.delete()
        db.session.commit()

    @staticmethod
    def get_consolidated_conditions(
        project_id,
        category_id=None,
        all_conditions=False,
        include_condition_attributes=False,
        user_is_internal=False,
        latest_amendment_only=False,
    ):  # pylint: disable=too-many-arguments
        """Fetch all consolidated conditions."""
        filter_condition = (
            Project.project_id == project_id
            if not user_is_internal or all_conditions
            else and_(
                Project.project_id == project_id,
                DocumentCategory.id == category_id,
            )
        )

        latest_amendment_subquery = (
            db.session.query(
                Document.document_id.label("document_id"),
                Condition.condition_number,
                func.max(Amendment.date_issued).label("latest_amendment_date"),
            )
            .select_from(Project)
            .join(Document, Document.project_id == Project.project_id)
            .join(Amendment, Amendment.document_id == Document.id)
            .join(Condition, Condition.amended_document_id == Amendment.amended_document_id)
            .filter(filter_condition)
            .group_by(Document.document_id, Condition.condition_number)
            .subquery()
        )

        if user_is_internal:
            if latest_amendment_only:
                ranked = (
                    db.session.query(
                        DocumentCategory.id.label('category_id'),
                        Condition.condition_number.label('condition_number'),
                        Amendment.amendment_name.label('amendment_name'),
                        func.row_number().over(
                            partition_by=[DocumentCategory.id, Condition.condition_number],
                            order_by=Amendment.date_issued.desc()
                        ).label('rn')
                    )
                    .select_from(Project)
                    .join(Document, Document.project_id == Project.project_id)
                    .join(DocumentType, DocumentType.id == Document.document_type_id)
                    .join(DocumentCategory, DocumentCategory.id == DocumentType.document_category_id)
                    .join(Amendment, Amendment.document_id == Document.id)
                    .join(Condition, Condition.amended_document_id == Amendment.amended_document_id)
                    .filter(filter_condition)
                    .filter(Condition.condition_type == ConditionType.AMEND)
                    .subquery()
                )
                amendment_subquery = (
                    db.session.query(
                        ranked.c.category_id.label('id'),
                        ranked.c.condition_number,
                        ranked.c.amendment_name.label('amendment_names'),
                    )
                    .filter(ranked.c.rn == 1)
                    .subquery()
                )
            else:
                amendment_subquery = (
                    db.session.query(
                        DocumentCategory.id,
                        Condition.condition_number,
                        func.string_agg(
                            Amendment.amendment_name.distinct(), ', '
                        ).label('amendment_names'),
                    )
                    .select_from(Project)
                    .join(Document, Document.project_id == Project.project_id)
                    .join(DocumentType, DocumentType.id == Document.document_type_id)
                    .join(DocumentCategory, DocumentCategory.id == DocumentType.document_category_id)
                    .join(Amendment, Amendment.document_id == Document.id)
                    .join(Condition, Condition.amended_document_id == Amendment.amended_document_id)
                    .filter(filter_condition)
                    .filter(Condition.condition_type == ConditionType.AMEND)
                    .group_by(DocumentCategory.id, Condition.condition_number)
                    .subquery()
                )

        query = (
            db.session.query(
                Project.project_name,
                Document.id,
                Document.document_id,
                DocumentCategory.category_name,
                case(
                    (latest_amendment_subquery.c.latest_amendment_date.isnot(None),
                     extract("year", latest_amendment_subquery.c.latest_amendment_date)),
                    else_=extract("year", Document.date_issued),
                ).label("year_issued"),
                Condition.id.label("condition_id"),
                Condition.condition_name,
                Condition.condition_number,
                Condition.condition_text,
                Condition.is_approved,
                Condition.topic_tags,
                Condition.is_condition_attributes_approved,
                Condition.is_topic_tags_approved,
                Condition.is_standard_condition,
                Condition.requires_management_plan,
                Condition.condition_type,
                case(
                    (Condition.amended_document_id.isnot(None), Condition.amended_document_id),
                    else_=Condition.document_id,
                ).label("effective_document_id"),
                Document.document_label,
                Amendment.amendment_name
            )
            .join(Document, Document.project_id == Project.project_id)
            .join(DocumentType, DocumentType.id == Document.document_type_id)
            .join(DocumentCategory, DocumentCategory.id == DocumentType.document_category_id)
            .join(Condition, Condition.document_id == Document.document_id)
            .outerjoin(Amendment, Amendment.amended_document_id == Condition.amended_document_id)
            .outerjoin(
                latest_amendment_subquery,
                and_(
                    Condition.condition_number == latest_amendment_subquery.c.condition_number,
                    Document.document_id == latest_amendment_subquery.c.document_id,
                ),
            )
            .filter(filter_condition)
            .filter(Condition.is_active.is_(True))
        )

        if user_is_internal:
            query = query.add_columns(amendment_subquery.c.amendment_names.label("amendment_names"))
            query = query.outerjoin(
                amendment_subquery,
                and_(
                    Condition.condition_number == amendment_subquery.c.condition_number,
                    DocumentCategory.id == amendment_subquery.c.id
                ),
            )

        if not user_is_internal:
            query = query.filter(and_(Condition.is_approved.is_(True),
                                      Condition.is_condition_attributes_approved.is_(True),
                                      Condition.is_topic_tags_approved.is_(True)))

        query = query.filter(
            not_(
                and_(
                    Condition.condition_name.is_(None),
                    Condition.condition_number.is_(None)
                )
            )
        ).order_by(Condition.condition_number)

        condition_data = query.all()

        if not condition_data:
            return []

        if user_is_internal:
            return ConditionService._process_internal_conditions(condition_data)

        return ConditionService._process_external_conditions(condition_data, include_condition_attributes)

    @staticmethod
    def _process_internal_conditions(condition_data):
        """Process conditions for internal users."""
        conditions_map = {}

        for row in condition_data:
            conditions_map[row.condition_id] = {
                "condition_id": row.condition_id,
                "condition_name": row.condition_name,
                "condition_number": row.condition_number,
                "is_approved": row.is_approved,
                "is_standard_condition": row.is_standard_condition,
                "topic_tags": row.topic_tags,
                "amendment_names": row.amendment_names,
                "year_issued": row.year_issued,
                "effective_document_id": row.effective_document_id,
                "source_document": row.amendment_name if row.amendment_name
                and row.condition_type == ConditionType.ADD else row.document_label,
                "subconditions": []
            }

        for cond_id in conditions_map:
            ConditionService._populate_subconditions(conditions_map, cond_id)

        return ProjectDocumentConditionSchema().dump(
            {
                "project_name": condition_data[0].project_name,
                "document_category": condition_data[0].category_name,
                "conditions": list(conditions_map.values()),
            }
        )

    @staticmethod
    def _process_external_conditions(condition_data, include_condition_attributes):
        """Process conditions for external users."""
        result = []

        for row in condition_data:
            # Prepare the container for condition details
            condition_details = {
                "subconditions": []
            }

            # Fetch all subconditions for this condition, including parent linkage
            sub_condition_data = (
                db.session.query(
                    Subcondition.id.label('subcondition_id'),
                    Subcondition.subcondition_identifier,
                    Subcondition.subcondition_text,
                    Subcondition.parent_subcondition_id,
                )
                .filter(Subcondition.condition_id == row.condition_id)
                .all()
            )

            subcondition_map = {}

            # Build nested subcondition structure
            for sub_condition in sub_condition_data:
                subcond_id = sub_condition.subcondition_id
                if subcond_id:
                    subcondition = {
                        "subcondition_id": sub_condition.subcondition_id,
                        "subcondition_identifier": sub_condition.subcondition_identifier,
                        "subcondition_text": sub_condition.subcondition_text,
                        "subconditions": []
                    }
                    subcondition_map[subcond_id] = subcondition

                    if sub_condition.parent_subcondition_id:
                        parent = subcondition_map.get(sub_condition.parent_subcondition_id)
                        if parent:
                            parent["subconditions"].append(subcondition)
                    else:
                        condition_details["subconditions"].append(subcondition)

            if condition_details["subconditions"]:
                condition_text = ConditionService._build_condition_text(condition_details["subconditions"])
            else:
                condition_text = row.condition_text  # fallback if no subconditions

            if row.requires_management_plan:
                plans = db.session.query(ManagementPlan).filter(
                    ManagementPlan.condition_id == row.condition_id,
                    ManagementPlan.is_approved.is_(True)
                ).all()

                for plan in plans:
                    plan_name = plan.name

                    condition_attributes = (
                        ConditionService._fetch_condition_attributes_external(
                            row.condition_id, include_condition_attributes, plan.id, plan_name)
                    )

                    result.append({
                        "condition_name": row.condition_name,
                        "plan_name": plan_name,
                        "condition_number": row.condition_number,
                        "condition_text": condition_text,
                        "is_standard_condition": row.is_standard_condition,
                        "condition_attributes": condition_attributes
                    })
            else:
                condition_attributes = (
                    ConditionService._fetch_condition_attributes_external(
                        row.condition_id, include_condition_attributes)
                )
                plan_name = row.condition_name

                if (
                    condition_attributes.get("requires_iem_terms_of_engagement")
                    and condition_attributes.get("deliverable_name")
                ):
                    deliverable_name = condition_attributes.get("deliverable_name")
                    plan_name = deliverable_name[0]

                result.append({
                    "condition_name": row.condition_name,
                    "plan_name": plan_name,
                    "condition_number": row.condition_number,
                    "condition_text": condition_text,
                    "is_standard_condition": row.is_standard_condition,
                    "condition_attributes": condition_attributes,
                })

        conditions_schema = ConsolidatedConditionSchema(many=True)
        return {"conditions": conditions_schema.dump(result)}

    @staticmethod
    def _build_condition_text(subconditions):
        """Recursively build condition_text from nested subconditions"""
        parts = []
        for sub_condition in subconditions:
            prefix = f"{sub_condition['subcondition_identifier']} " if sub_condition['subcondition_identifier'] else ""
            text = prefix + sub_condition['subcondition_text']
            if sub_condition['subconditions']:
                # Recursively append nested subconditions
                nested_text = ConditionService._build_condition_text(sub_condition['subconditions'])
                text += " " + nested_text
            parts.append(text)
        return " ".join(parts)

    @staticmethod
    def _fetch_condition_attributes_external(
        condition_id,
        include_condition_attributes,
        management_plan_id=None,
        plan_name=None
    ):
        """Fetch condition attributes based on the user type and flags."""
        if not include_condition_attributes:
            return []

        excluded_key_names = {AttributeKeys.PARTIES_REQUIRED_TO_BE_SUBMITTED.value}
        formatted_key_names = {
            AttributeKeys.PARTIES_REQUIRED_TO_BE_CONSULTED.value,
            AttributeKeys.MILESTONES_RELATED_TO_PLAN_SUBMISSION.value,
            AttributeKeys.MILESTONES_RELATED_TO_PLAN_IMPLEMENTATION.value,
        }

        query = db.session.query(
            AttributeKey.key_name,
            AttributeKey.external_key,
            ConditionAttribute.attribute_value,
        ).outerjoin(
            AttributeKey, ConditionAttribute.attribute_key_id == AttributeKey.id
        ).filter(
            ConditionAttribute.condition_id == condition_id,
            ~AttributeKey.key_name.in_(excluded_key_names),
        )

        if management_plan_id:
            query = query.filter(ConditionAttribute.management_plan_id == management_plan_id)
        else:
            query = query.filter(ConditionAttribute.management_plan_id.is_(None))

        attributes_data = query.order_by(AttributeKey.sort_order).all()

        result = {}
        requires_iem = False
        deliverables = []

        for key_name, external_key, raw_value in attributes_data:
            if not external_key:
                continue

            # Handle requires_iem_terms_of_engagement
            if key_name == AttributeKeys.REQUIRES_IEM_TERMS_OF_ENGAGEMENT.value:
                requires_iem = raw_value
                result[external_key] = requires_iem
                continue

            # Handle deliverable_name separately
            if key_name == AttributeKeys.DELIVERABLE_NAME.value:
                deliverables.append((raw_value or "", key_name))
                continue

            # Format value
            value = ConditionService._format_attribute_value(key_name, raw_value, formatted_key_names)
            result[external_key] = value

        # Handle deliverables
        if deliverables:
            result.update(
                ConditionService._process_deliverables(deliverables, requires_iem, formatted_key_names)
            )

        if management_plan_id:
            result["requires_management_plan"] = "true"
            result["deliverable_name"] = [plan_name]

        return result

    @staticmethod
    def _format_attribute_value(key_name, raw_value, formatted_key_names):
        """Format value"""
        if key_name in formatted_key_names:
            return ConditionService.format_attribute_value(raw_value)
        if not raw_value:
            return None
        if raw_value == "N/A":
            return raw_value if current_app.config.get('ENABLE_NEW_SUBMIT_FLOW', False) else None
        return raw_value.replace("{", "").replace("}", "").replace('"', "")

    @staticmethod
    def _process_deliverables(deliverables, requires_iem, formatted_key_names):
        deliverable_phrase = IEMTermsConfig.DELIVERABLE_VALUE
        selected_value = None

        if requires_iem:
            selected_value = next((val for val, _ in deliverables if deliverable_phrase in val), None)
        else:
            selected_value = next((val for val, _ in deliverables if deliverable_phrase not in val), None)

        if not selected_value and deliverables:
            selected_value = deliverables[0][0]

        if not selected_value:
            return {}

        if AttributeKeys.DELIVERABLE_NAME.value in formatted_key_names:
            return {"deliverable_name": [ConditionService.format_attribute_value(selected_value)]}

        return {
            "deliverable_name": [
                selected_value.replace("{", "").replace("}", "").replace('"', "")
                if selected_value and selected_value != "N/A"
                else None
            ]
        }

    @staticmethod
    def format_attribute_value(raw_value):
        """Format attribute"""
        if not raw_value or raw_value == "N/A":
            return None

        # Match values inside `{}` correctly, including those with escaped quotes
        matches = re.findall(r'"((?:[^"\\]|\\.)*)"|([^,{}]+)', raw_value)

        # Clean up extracted values (preserve quotes properly)
        clean_list = [
            (match[0].replace('\\"', '"').strip() if match[0] else match[1].strip())  # Handle escaped quotes properly
            for match in matches
        ]

        return clean_list  # Return as a proper JSON list (not a string!)

    @staticmethod
    def _get_base_document_info(document_id, amendments):
        """Determine if document is an amendment and return base info."""
        amendment = db.session.query(
            amendments.document_id, amendments.amended_document_id
        ).filter(amendments.amended_document_id == document_id).first()

        if amendment:
            return True, amendment
        return False, None

    @staticmethod
    def _get_project_name(project_id, projects):
        """Fetch the project name."""
        result = db.session.query(projects.project_name).filter(projects.project_id == project_id).first()
        return result[0] if result else None

    @staticmethod
    def _get_document_joins_and_columns(
            is_amendment, base_document_info, document_id, document_types, conditions):
        """Get joins needed for fetching condition data"""
        documents = aliased(Document)
        amendments = aliased(Amendment)

        if is_amendment:
            # Use amendment join path
            document_join = amendments.amended_document_id == conditions.amended_document_id
            document_type_join = amendments.document_type_id == document_types.id
            document_label_col = amendments.amendment_name.label("document_label")
            date_col = extract("year", amendments.date_issued).label("year_issued")
            document_filter = amendments.amended_document_id == base_document_info.amended_document_id
            doc_entity = amendments
        else:
            document_join = documents.document_id == conditions.document_id
            document_type_join = documents.document_type_id == document_types.id
            document_label_col = documents.document_label
            date_col = extract("year", documents.date_issued).label("year_issued")
            document_filter = documents.document_id == document_id
            doc_entity = documents

        return document_join, document_type_join, document_label_col, date_col, document_filter, doc_entity

    @staticmethod
    def _fetch_condition_data(
        is_amendment,
        base_document_info,
        document_id,
        condition_id
    ):
        """Retrieve condition with subconditions and document metadata."""
        document_types = aliased(DocumentType)
        document_categories = aliased(DocumentCategory)
        conditions = aliased(Condition)
        subconditions = aliased(Subcondition)

        document_join, document_type_join, document_label_col, date_col, document_filter, doc_entity =\
            ConditionService._get_document_joins_and_columns(
                is_amendment, base_document_info, document_id,
                document_types, conditions
            )

        query = (
            db.session.query(
                document_types.document_category_id,
                document_categories.category_name.label("document_category"),
                document_label_col,
                conditions.id,
                date_col,
                conditions.condition_name,
                conditions.condition_number,
                conditions.condition_text,
                conditions.is_approved,
                conditions.topic_tags,
                conditions.is_topic_tags_approved,
                conditions.is_condition_attributes_approved,
                conditions.is_standard_condition,
                conditions.requires_management_plan,
                conditions.subtopic_tags,
                subconditions.id.label("subcondition_id"),
                subconditions.subcondition_identifier,
                subconditions.subcondition_text,
                subconditions.sort_order,
                subconditions.parent_subcondition_id,
            )
            .outerjoin(subconditions, conditions.id == subconditions.condition_id)
            .outerjoin(doc_entity, document_join)
            .outerjoin(document_types, document_type_join)
            .outerjoin(document_categories, document_categories.id == document_types.document_category_id)
            .filter(document_filter, conditions.id == condition_id)
            .order_by(subconditions.sort_order)
        )

        return query.all()

    @staticmethod
    def _build_condition_structure(condition_rows):
        """Organize the condition and subconditions into hierarchical structure."""
        first = condition_rows[0]
        condition = {
            "condition_id": first.id,
            "condition_name": first.condition_name,
            "condition_number": first.condition_number,
            "condition_text": first.condition_text,
            "is_approved": first.is_approved,
            "topic_tags": first.topic_tags,
            "is_topic_tags_approved": first.is_topic_tags_approved,
            "is_condition_attributes_approved": first.is_condition_attributes_approved,
            "is_standard_condition": first.is_standard_condition,
            "requires_management_plan": first.requires_management_plan,
            "subtopic_tags": first.subtopic_tags,
            "year_issued": first.year_issued,
            "condition_attributes": [],
            "subconditions": [],
        }

        sub_map = {}
        children = defaultdict(list)

        # Organize subconditions
        for row in condition_rows:
            if row.subcondition_id:
                sub = {
                    "subcondition_id": row.subcondition_id,
                    "subcondition_identifier": row.subcondition_identifier,
                    "subcondition_text": row.subcondition_text,
                    "sort_order": row.sort_order,
                    "subconditions": [],
                }
                sub_map[row.subcondition_id] = sub
                children[row.parent_subcondition_id].append(sub)

        # Link hierarchy
        for sub in sub_map.values():
            if sub["subcondition_id"] in children:
                sub["subconditions"] = children[sub["subcondition_id"]]

        # Top-level subconditions
        condition["subconditions"] = children[None]
        return condition

    @staticmethod
    def _fetch_condition_attributes(requires_management_plan, condition_id):
        """Fetch and return condition attributes, grouping those linked to management plans."""
        if requires_management_plan:
            # Fetch management plans and their attributes
            plan_attrs = (
                db.session.query(
                    ManagementPlan.id.label("plan_id"),
                    ManagementPlan.name.label("plan_name"),
                    ManagementPlan.is_approved.label("is_approved"),
                    ConditionAttribute.id.label("attribute_id"),
                    AttributeKey.key_name,
                    ConditionAttribute.attribute_value,
                )
                .join(ConditionAttribute, ManagementPlan.id == ConditionAttribute.management_plan_id)
                .outerjoin(AttributeKey, ConditionAttribute.attribute_key_id == AttributeKey.id)
                .filter(
                    ManagementPlan.condition_id == condition_id,
                    AttributeKey.key_name != AttributeKeys.PARTIES_REQUIRED_TO_BE_SUBMITTED.value
                )
                .order_by(ManagementPlan.id, AttributeKey.sort_order)
                .all()
            )

            # Group plan attributes
            plan_map = {}
            for row in plan_attrs:
                plan_id = row.plan_id
                if plan_id not in plan_map:
                    plan_map[plan_id] = {
                        "id": plan_id,
                        "name": row.plan_name,
                        "is_approved": row.is_approved,
                        "attributes": []
                    }
                plan_map[plan_id]["attributes"].append({
                    "id": row.attribute_id,
                    "key": row.key_name,
                    "value": row.attribute_value
                })

            return {
                "independent_attributes": [],
                "management_plans": list(plan_map.values())
            }

        # Fetch independent attributes (no management_plan_id)
        independent_attrs = (
            db.session.query(
                ConditionAttribute.id,
                AttributeKey.key_name,
                ConditionAttribute.attribute_value,
            )
            .outerjoin(AttributeKey, ConditionAttribute.attribute_key_id == AttributeKey.id)
            .filter(
                ConditionAttribute.condition_id == condition_id,
                ConditionAttribute.management_plan_id.is_(None),
                ~ConditionAttribute.attribute_key_id.in_([5])  # Exclude "Parties required"
            )
            .order_by(AttributeKey.sort_order)
            .all()
        )

        independent_results = [
            {"id": row.id, "key": row.key_name, "value": row.attribute_value}
            for row in independent_attrs
        ]
        return {
            "independent_attributes": independent_results,
            "management_plans": []
        }
