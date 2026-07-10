from utils import convert_to_pg_array, get_document_type_id, get_document_category_id

def insert_project(cur, project_id, project_name, project_type):
    cur.execute("""
        INSERT INTO condition.projects (project_id, project_name, project_type, created_date)
        VALUES (%s, %s, %s, NOW())
        ON CONFLICT (project_id) DO NOTHING
    """, (project_id, project_name, project_type))

def document_exists(cur, document_id):
    cur.execute("SELECT 1 FROM condition.documents WHERE document_id = %s", (document_id,))
    return cur.fetchone() is not None

def insert_document(cur, data, project_id):
    doc_id = data['document_id']
    if document_exists(cur, doc_id):
        print(f"Skipping document {doc_id} as it already exists.")
        return doc_id

    cur.execute("""
        INSERT INTO condition.documents (
            document_id, document_type_id, document_category_id, document_label, document_link,
            document_file_name, date_issued, act, first_nations,
            consultation_records_required, is_latest_amendment_added, project_id, created_date
        ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, NOW())
    """, (
        doc_id,
        get_document_type_id(data['document_type']),
        get_document_category_id(data['document_type']),
        data['display_name'],
        data.get('document_link'),
        data['document_file_name'],
        data['date_issued'],
        data['act'],
        convert_to_pg_array(data.get('first_nations', [])),
        data.get('consultation_records_required', False),
        True,
        project_id
    ))
    return doc_id
