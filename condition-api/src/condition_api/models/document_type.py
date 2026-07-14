"""Document Type model class.

Manages the Document Type
"""
from sqlalchemy import Column, Integer, String
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import joinedload, relationship

from .base_model import BaseModel
from .document_type_category import DocumentTypeCategory

Base = declarative_base()


class DocumentType(BaseModel):
    """Definition of the Document Type entity."""

    __tablename__ = 'document_types'

    id = Column(Integer, primary_key=True, autoincrement=True)
    document_type = Column(String(255), nullable=False)

    document_type_categories = relationship(
        'DocumentTypeCategory',
        back_populates='document_type',
        lazy='select'
    )

    __table_args__ = (
        {'schema': 'condition'}
    )

    @property
    def categories(self):
        """Return the list of DocumentCategory objects for this type."""
        return [dtc.document_category for dtc in self.document_type_categories]

    @classmethod
    def get_all(cls):
        """Get all document types with their categories eagerly loaded."""
        return (
            cls.query
            .options(
                joinedload(cls.document_type_categories)
                .joinedload(DocumentTypeCategory.document_category)
            )
            .all()
        )

    @classmethod
    def get_by_id(cls, document_id):
        """Get document type by id."""
        return cls.query.filter_by(id=document_id).first()
