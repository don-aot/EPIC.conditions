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


"""Service for attribute key management."""
from sqlalchemy.orm import aliased

from condition_api.models.attribute_key import AttributeKey
from condition_api.models.condition_attribute import ConditionAttribute
from condition_api.models.db import db
from condition_api.utils.enums import AttributeKeys


class AttributeKeyService:
    """Attribute Key management service."""

    @staticmethod
    def get_all_attributes(condition_id, management_plan_id=None):
        """Fetch all attributes."""
        condition_attributes = aliased(ConditionAttribute)
        attribute_keys = aliased(AttributeKey)

        if management_plan_id:
            subquery = (
                db.session.query(condition_attributes.attribute_key_id)
                .filter(condition_attributes.management_plan_id == management_plan_id)
                .subquery()
            )
        else:
            subquery = (
                db.session.query(condition_attributes.attribute_key_id)
                .filter(condition_attributes.condition_id == condition_id)
                .subquery()
            )

        always_excluded = [
            AttributeKeys.PARTIES_REQUIRED_TO_BE_SUBMITTED.value,
            AttributeKeys.DELIVERABLE_NAME.value,
        ]
        if not management_plan_id:
            always_excluded.append(AttributeKeys.MANAGEMENT_PLAN_ACRONYM.value)
        else:
            always_excluded.append(AttributeKeys.REQUIRES_IEM_TERMS_OF_ENGAGEMENT.value)

        attributes_data = (
            db.session.query(
                attribute_keys.id,
                attribute_keys.key_name,
            )
            .filter(
                ~attribute_keys.id.in_(db.session.query(subquery.c.attribute_key_id)),
                ~attribute_keys.key_name.in_(always_excluded),
            )
            .order_by(attribute_keys.sort_order)
            .all()
        )

        if not attributes_data:
            return None

        result = []

        for attributes in attributes_data:
            result.append({
                "attribute_key_id": attributes.id,
                "attribute_key_name": attributes.key_name
            })

        return result
