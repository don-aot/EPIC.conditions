import json

def convert_to_pg_array(json_array):
    """Convert JSON array to PostgreSQL array format."""
    return '{' + ','.join(json.dumps(item) for item in json_array) + '}'

def get_document_type_id(document_type):
    """Return document_type_id based on type string."""
    mapping = {
        "Exemption Order": 2,
        "Other Order": 4,
        "Amendment": 3,
        "Schedule B/Certificate": 1
    }
    return mapping.get(document_type)


def get_document_category_id(document_type):
    """Return document_category_id based on type string.

    Certificate/Amendment → category 1 (Certificate and Amendments)
    Exemption Order       → category 2 (Exemption Order and Amendments)
    Other Order           → category 3 (Other Orders)
    Amendment loaded via the loader is always under Certificate and Amendments
    because the loader pre-dates multi-category support. Override at load time if needed.
    """
    mapping = {
        "Exemption Order": 2,
        "Other Order": 3,
        "Amendment": 1,
        "Schedule B/Certificate": 1
    }
    return mapping.get(document_type)
