"""Extraction Request schema."""
from marshmallow import Schema, fields


class ExtractionRequestSchema(Schema):
    """Schema for extraction requests."""

    id = fields.Int(dump_only=True)
    project_id = fields.Str(required=True)
    document_id = fields.Str(allow_none=True)
    document_type_id = fields.Int(allow_none=True)
    document_category_id = fields.Int(allow_none=True)
    document_label = fields.Str(allow_none=True)
    date_issued = fields.Str(allow_none=True)
    act = fields.Int(allow_none=True)
    original_file_name = fields.Str(allow_none=True)
    s3_url = fields.Str(required=True)
    file_size_bytes = fields.Int(allow_none=True)
    status = fields.Str(dump_only=True)
    error_message = fields.Str(dump_only=True, allow_none=True)
    extracted_data = fields.Dict(dump_only=True, allow_none=True)
    created_date = fields.Str(dump_only=True)
    updated_date = fields.Str(dump_only=True, allow_none=True)
    uploaded_by_name = fields.Str(attribute="uploaded_by_name", dump_only=True, allow_none=True)
    imported_by_name = fields.Str(attribute="imported_by_name", dump_only=True, allow_none=True)
    queue_position = fields.Int(dump_only=True, allow_none=True)
    estimated_wait_minutes = fields.Int(dump_only=True, allow_none=True)
    estimated_ready_minutes = fields.Int(dump_only=True, allow_none=True)
