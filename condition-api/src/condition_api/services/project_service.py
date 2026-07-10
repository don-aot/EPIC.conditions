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


"""Service for project management."""
from sqlalchemy import String, and_, case, func, not_
from sqlalchemy.dialects.postgresql import ARRAY

from condition_api.models.amendment import Amendment
from condition_api.models.condition import Condition
from condition_api.models.db import db
from condition_api.models.document import Document
from condition_api.models.document_category import DocumentCategory  # used in get_all_projects group_by
from condition_api.models.document_type import DocumentType
from condition_api.models.project import Project


class ProjectService:
    """Project management service."""

    @staticmethod
    def get_all_projects():
        """Fetch all projects along with related documents in a single query."""
        # Fetch all projects with their related documents, document types, and conditions in one query
        project_data = (
            db.session.query(
                Project.project_id,
                Project.project_name,
                DocumentCategory.id.label("document_category_id"),
                DocumentCategory.category_name.label("document_category"),
                func.array_agg(func.distinct(DocumentType.document_type), type_=ARRAY(String)).label("document_types"),
                func.greatest(func.max(Document.date_issued), func.max(Amendment.date_issued)).label("max_date_issued"),
                func.count(Amendment.document_id).label("amendment_count"),  # pylint: disable=not-callable
                func.bool_or(Document.is_latest_amendment_added).label("is_latest_amendment_added")
            )
            .outerjoin(Document, and_(Document.project_id == Project.project_id, Document.is_active.is_(True)))
            .outerjoin(DocumentType, DocumentType.id == Document.document_type_id)
            .outerjoin(DocumentCategory, DocumentCategory.id == Document.document_category_id)
            .outerjoin(Amendment, Amendment.document_id == Document.id)
            .filter(Project.is_active.is_(True))
            .group_by(
                Project.project_id,
                Project.project_name,
                DocumentCategory.id,
                DocumentCategory.category_name
            )
        ).all()

        if not project_data:
            return None

        # Transform query results into the desired structure
        projects_map = {}
        for row in project_data:
            project_id = row.project_id
            if project_id not in projects_map:
                projects_map[project_id] = {
                    "project_id": project_id,
                    "project_name": row.project_name,
                    "documents": [],
                }

            if row.document_category_id:  # Ensure there's a document category id associated

                projects_map[project_id]["documents"].append({
                    "document_category_id": row.document_category_id,
                    "document_category": row.document_category,
                    "document_types": row.document_types,
                    "date_issued": row.max_date_issued,
                    "status": ProjectService.check_project_conditions(project_id, row.document_category_id),
                    "is_latest_amendment_added": row.is_latest_amendment_added,
                    "amendment_count": row.amendment_count,
                })

        # Convert the map to a list of projects
        return list(projects_map.values())

    @staticmethod
    def check_project_conditions(project_id, document_category_id):
        """
        Check all documents in the `documents` table for a specific project.

        :param project_id: ID of the project to check.
        :return: None if any document has no conditions or invalid conditions, otherwise True.
        """
        # Fetch all documents for the project
        documents = (
            db.session.query(Document.id, Document.document_id)
            .filter(and_(
                Document.project_id == project_id,
                Document.document_category_id == document_category_id,
                Document.is_active.is_(True)
            ))
            .all()
        )

        if not documents:
            return None

        for document in documents:
            document_pk = document.id
            document_id = document.document_id
            # Check if the document has any conditions
            condition_count = (
                db.session.query(func.count(Condition.id))  # pylint: disable=not-callable
                .filter(Condition.document_id == document_id, Condition.amended_document_id.is_(None))
                .filter(
                    not_(
                        and_(
                            Condition.condition_name.is_(None),
                            Condition.condition_number.is_(None)
                        )
                    )
                )
                .scalar()
            )
            if condition_count == 0:
                return None
            # Fetch all amendments related to the document
            amendments = (
                db.session.query(Amendment.amended_document_id)
                .filter(Amendment.document_id == document_pk)
                .all()
            )

            # Check if any amendment has zero conditions
            for amendment in amendments:
                amended_document_id = amendment.amended_document_id
                amendment_condition_count = (
                    db.session.query(func.count(Condition.id))  # pylint: disable=not-callable
                    .filter(Condition.amended_document_id == amended_document_id)
                    .filter(
                        not_(
                            and_(
                                Condition.condition_name.is_(None),
                                Condition.condition_number.is_(None)
                            )
                        )
                    )
                    .scalar()
                )
                if amendment_condition_count == 0:
                    return None

        all_approved = (
            db.session.query(
                func.min(
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
                ).label("all_approved"))
            .join(Document, Document.document_id == Condition.document_id)
            .filter(
                and_(
                    Document.project_id == project_id,
                    Document.document_category_id == document_category_id
                )
            )
            .filter(
                not_(
                    and_(
                        Condition.condition_name.is_(None),
                        Condition.condition_number.is_(None)
                    )
                )
            )
            .first()
        )

        if all_approved is None:
            return None

        return all_approved[0]

    @staticmethod
    def get_projects_with_approved_conditions():
        """Fetch all projects that have at least one approved condition."""
        projects = (
            db.session.query(Project.project_id)
            .join(Condition, Project.project_id == Condition.project_id)
            .filter(
                Project.is_active.is_(True),
                Condition.is_approved.is_(True),
                Condition.is_topic_tags_approved.is_(True),
                Condition.is_condition_attributes_approved.is_(True)
            )
            .distinct()
            .all()
        )

        return projects

    @staticmethod
    def get_available_projects():
        """Fetch all inactive projects (synced but not yet added to condition repo)."""
        projects = (
            db.session.query(
                Project.project_id,
                Project.project_name,
            )
            .filter(Project.is_active.is_(False))
            .order_by(Project.project_name)
            .all()
        )

        if not projects:
            return []

        return [
            {
                "project_id": row.project_id,
                "project_name": row.project_name,
            }
            for row in projects
        ]

    @staticmethod
    def get_all_projects_simple():
        """Fetch all projects (active and inactive) as a simple id/name list."""
        projects = (
            db.session.query(Project.project_id, Project.project_name, Project.project_type)
            .order_by(Project.project_name)
            .all()
        )
        return [
            {"project_id": row.project_id, "project_name": row.project_name, "project_type": row.project_type}
            for row in projects
        ]

    @staticmethod
    def activate_project(project_id):
        """Activate a project to make it visible in the condition repo."""
        project = Project.get_by_id(project_id)
        if not project:
            return None
        project.is_active = True
        db.session.commit()
        return project
