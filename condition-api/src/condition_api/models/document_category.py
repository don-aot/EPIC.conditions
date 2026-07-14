"""Document Category model class.

Manages the Document Category
"""
from sqlalchemy import Column, Integer, String
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import relationship

from .base_model import BaseModel

Base = declarative_base()


class DocumentCategory(BaseModel):
    """Definition of the Document Category entity."""

    __tablename__ = 'document_categories'

    id = Column(Integer, primary_key=True, autoincrement=True)
    category_name = Column(String(255), nullable=False)

    document_type_categories = relationship(
        'DocumentTypeCategory',
        back_populates='document_category',
        lazy='select'
    )

    __table_args__ = (
        {'schema': 'condition'}
    )

    @classmethod
    def get_all(cls):
        """Get all document categories."""
        return cls.query.all()

    @classmethod
    def get_by_id(cls, category_id):
        """Get document by category_id."""
        return cls.query.filter_by(id=category_id).first()
