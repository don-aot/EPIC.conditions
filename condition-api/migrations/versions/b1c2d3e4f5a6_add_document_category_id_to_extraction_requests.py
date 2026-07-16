"""add_document_category_id_to_extraction_requests

Revision ID: b1c2d3e4f5a6
Revises: a1b2c3d4e5f6
Create Date: 2026-07-16

Add document_category_id to extraction_requests so the frontend-supplied
category is stored with the request and used during import/manual entry
instead of being derived server-side.
"""
from alembic import op

revision = 'b1c2d3e4f5a6'
down_revision = 'a1b2c3d4e5f6'
branch_labels = None
depends_on = None


def upgrade():
    op.execute("""
        ALTER TABLE condition.extraction_requests
        ADD COLUMN IF NOT EXISTS document_category_id INTEGER
            REFERENCES condition.document_categories(id) ON DELETE RESTRICT;
    """)

    op.execute("""
        GRANT SELECT, INSERT, UPDATE, DELETE
        ON condition.extraction_requests TO condition;
    """)


def downgrade():
    op.execute("""
        ALTER TABLE condition.extraction_requests
        DROP COLUMN IF EXISTS document_category_id;
    """)
