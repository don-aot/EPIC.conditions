"""document_type_many_to_many_categories

Revision ID: a1b2c3d4e5f6
Revises: 9c1f2d3e4a5b
Create Date: 2026-07-08

Replace single document_category_id FK on document_types with a many-to-many
junction table (document_type_categories). Also adds document_category_id
directly onto documents so each document record explicitly owns its category.

Written to be idempotent — safe to re-run if the DB is in a partial state.
"""
from alembic import op

revision = 'a1b2c3d4e5f6'
down_revision = '9c1f2d3e4a5b'
branch_labels = None
depends_on = None


def upgrade():
    # ------------------------------------------------------------------ #
    # Step 1: Add document_category_id to documents (idempotent)         #
    # ------------------------------------------------------------------ #
    op.execute("""
        ALTER TABLE condition.documents
        ADD COLUMN IF NOT EXISTS document_category_id INTEGER;
    """)

    op.execute("""
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint
                WHERE conname = 'fk_documents_document_category_id'
            ) THEN
                ALTER TABLE condition.documents
                ADD CONSTRAINT fk_documents_document_category_id
                FOREIGN KEY (document_category_id)
                REFERENCES condition.document_categories(id)
                ON DELETE RESTRICT;
            END IF;
        END;
        $$;
    """)

    # ------------------------------------------------------------------ #
    # Step 2: Backfill from existing document_types.document_category_id  #
    # Only fills rows that are still NULL (safe to re-run).               #
    # ------------------------------------------------------------------ #
    op.execute("""
        UPDATE condition.documents d
        SET document_category_id = dt.document_category_id
        FROM condition.document_types dt
        WHERE d.document_type_id = dt.id
          AND d.document_category_id IS NULL
          AND EXISTS (
              SELECT 1 FROM information_schema.columns
              WHERE table_schema = 'condition'
                AND table_name   = 'document_types'
                AND column_name  = 'document_category_id'
          );
    """)

    # ------------------------------------------------------------------ #
    # Step 3: Create junction table (idempotent)                          #
    # ------------------------------------------------------------------ #
    op.execute("""
        CREATE TABLE IF NOT EXISTS condition.document_type_categories (
            id                   SERIAL PRIMARY KEY,
            document_type_id     INTEGER NOT NULL
                REFERENCES condition.document_types(id) ON DELETE CASCADE,
            document_category_id INTEGER NOT NULL
                REFERENCES condition.document_categories(id) ON DELETE CASCADE,
            created_date         TIMESTAMP NOT NULL DEFAULT NOW(),
            updated_date         TIMESTAMP,
            created_by           VARCHAR(50),
            updated_by           VARCHAR(50),
            CONSTRAINT uq_document_type_category
                UNIQUE (document_type_id, document_category_id)
        );
    """)

    # ------------------------------------------------------------------ #
    # Step 4: Seed junction table (idempotent via ON CONFLICT DO NOTHING) #
    # ------------------------------------------------------------------ #
    op.execute("""
        INSERT INTO condition.document_type_categories
            (document_type_id, document_category_id, created_date, updated_date)
        VALUES
            (1, 1, NOW(), NOW()),  -- Certificate          → Certificate and Amendments
            (2, 2, NOW(), NOW()),  -- Exemption Order      → Exemption Order and Amendments
            (3, 1, NOW(), NOW()),  -- Amendment            → Certificate and Amendments
            (3, 2, NOW(), NOW()),  -- Amendment            → Exemption Order and Amendments (NEW)
            (4, 3, NOW(), NOW())   -- Other Order          → Other Orders
        ON CONFLICT (document_type_id, document_category_id) DO NOTHING;
    """)

    # Grant table permissions
    op.execute("""
        GRANT SELECT, INSERT, UPDATE, DELETE
        ON condition.document_type_categories TO condition;
    """)
    op.execute("""
        GRANT USAGE, SELECT, UPDATE
        ON SEQUENCE condition.document_type_categories_id_seq TO condition;
    """)

    # ------------------------------------------------------------------ #
    # Step 5: Drop document_category_id from document_types (idempotent) #
    # ------------------------------------------------------------------ #
    op.execute("""
        DO $$
        BEGIN
            IF EXISTS (
                SELECT 1 FROM pg_constraint
                WHERE conname = 'document_types_document_category_id_fkey'
            ) THEN
                ALTER TABLE condition.document_types
                DROP CONSTRAINT document_types_document_category_id_fkey;
            END IF;
        END;
        $$;
    """)

    op.execute("""
        ALTER TABLE condition.document_types
        DROP COLUMN IF EXISTS document_category_id;
    """)


def downgrade():
    op.execute("""
        ALTER TABLE condition.document_types
        ADD COLUMN IF NOT EXISTS document_category_id INTEGER;
    """)

    op.execute("""
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint
                WHERE conname = 'document_types_document_category_id_fkey'
            ) THEN
                ALTER TABLE condition.document_types
                ADD CONSTRAINT document_types_document_category_id_fkey
                FOREIGN KEY (document_category_id)
                REFERENCES condition.document_categories(id)
                ON DELETE CASCADE;
            END IF;
        END;
        $$;
    """)

    # Restore from first junction entry per document type
    op.execute("""
        UPDATE condition.document_types dt
        SET document_category_id = (
            SELECT dtc.document_category_id
            FROM condition.document_type_categories dtc
            WHERE dtc.document_type_id = dt.id
            ORDER BY dtc.id
            LIMIT 1
        );
    """)

    op.execute("DROP TABLE IF EXISTS condition.document_type_categories;")

    op.execute("""
        DO $$
        BEGIN
            IF EXISTS (
                SELECT 1 FROM pg_constraint
                WHERE conname = 'fk_documents_document_category_id'
            ) THEN
                ALTER TABLE condition.documents
                DROP CONSTRAINT fk_documents_document_category_id;
            END IF;
        END;
        $$;
    """)

    op.execute("""
        ALTER TABLE condition.documents
        DROP COLUMN IF EXISTS document_category_id;
    """)
