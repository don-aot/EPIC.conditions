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
"""API endpoints for managing a condition attribute resource."""

from http import HTTPStatus

from flask import request
from flask_cors import cross_origin
from flask_restx import Namespace, Resource

from marshmallow import ValidationError

from condition_api.schemas.condition_attribute import ConditionAttributesSchema
from condition_api.services.condition_attribute_service import ConditionAttributeService
from condition_api.utils.roles import EpicConditionRole
from condition_api.utils.util import allowedorigins, cors_preflight

from .apihelper import Api as ApiHelper
from ..auth import auth

API = Namespace("attributes", description="Endpoints for Condition Attribute Management")
"""Custom exception messages
"""

condition_model = ApiHelper.convert_ma_schema_to_restx_model(
    API, ConditionAttributesSchema(), "Attribute"
)


@cors_preflight("OPTIONS, PATCH, DELETE")
@API.route("/condition/<int:condition_id>", methods=["PATCH", "DELETE", "OPTIONS"])
class ConditionAttributeaResource(Resource):
    """Resource for updating condition attributes."""

    @staticmethod
    @ApiHelper.swagger_decorators(API, endpoint_description="Edit condition attributes data")
    @API.response(
        code=HTTPStatus.OK, model=condition_model, description="Edit condition attributes"
    )
    @API.response(HTTPStatus.BAD_REQUEST, "Bad Request")
    @cross_origin(origins=allowedorigins())
    @auth.has_one_of_roles([EpicConditionRole.MANAGE_CONDITIONS.value])
    def patch(condition_id):
        """Edit condition attributes data."""
        try:
            requires_management_plan = API.payload.get("requires_management_plan", [])
            condition_attribute = API.payload.get("condition_attribute", [])
            conditions_attributes_data = ConditionAttributesSchema().load(condition_attribute)
            updated_conditions_attributes = ConditionAttributeService.upsert_condition_attribute(
                requires_management_plan, condition_id, conditions_attributes_data)
            return ConditionAttributesSchema().dump(updated_conditions_attributes), HTTPStatus.OK
        except ValidationError as err:
            return {"message": str(err)}, HTTPStatus.BAD_REQUEST

    @staticmethod
    @ApiHelper.swagger_decorators(API, endpoint_description="Delete condition attribute data")
    @API.response(
        code=HTTPStatus.OK, model=condition_model, description="Delete condition attributes"
    )
    @API.response(HTTPStatus.BAD_REQUEST, "Bad Request")
    @cross_origin(origins=allowedorigins())
    @auth.has_one_of_roles([EpicConditionRole.MANAGE_CONDITIONS.value])
    def delete(condition_id):
        """Remove condition attribute data."""
        try:
            requires_management_plan = request.args.get(
                "requires_management_plan", "false").lower() == "true"
            deleted = ConditionAttributeService().delete_condition_attribute(
                condition_id, requires_management_plan)
            if not deleted:
                # No data found to delete, but still OK
                return 'No condition attribute data found to remove', HTTPStatus.OK
            return 'Condition attribute successfully removed', HTTPStatus.OK
        except (KeyError, ValueError) as err:
            return {"message": str(err)}, HTTPStatus.BAD_REQUEST


@cors_preflight("OPTIONS, DELETE")
@API.route("/condition/<int:condition_id>/attribute/<int:attribute_id>", methods=["DELETE", "OPTIONS"])
class ConditionSingleAttributeResource(Resource):
    """Resource for deleting a single condition attribute."""

    @staticmethod
    @ApiHelper.swagger_decorators(API, endpoint_description="Delete a single condition attribute")
    @API.response(code=HTTPStatus.OK, description="Delete a single condition attribute")
    @API.response(HTTPStatus.BAD_REQUEST, "Bad Request")
    @cross_origin(origins=allowedorigins())
    @auth.has_one_of_roles([EpicConditionRole.MANAGE_CONDITIONS.value])
    def delete(condition_id, attribute_id):
        """Delete a single condition attribute by ID."""
        try:
            deleted = ConditionAttributeService.delete_single_condition_attribute(
                condition_id, attribute_id)
            if not deleted:
                return 'No condition attribute found to remove', HTTPStatus.OK
            return 'Condition attribute successfully removed', HTTPStatus.OK
        except (KeyError, ValueError) as err:
            return {"message": str(err)}, HTTPStatus.BAD_REQUEST
