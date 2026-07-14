"""DocumentTypeCategory junction model.

Many-to-many link between document_types and document_categories.
"""
from sqlalchemy import Column, ForeignKey, Integer, UniqueConstraint
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import relationship

from .base_model import BaseModel

Base = declarative_base()


class DocumentTypeCategory(BaseModel):
    """Junction table linking a document type to one or more categories."""

    __tablename__ = 'document_type_categories'

    id = Column(Integer, primary_key=True, autoincrement=True)
    document_type_id = Column(
        Integer,
        ForeignKey('condition.document_types.id', ondelete='CASCADE'),
        nullable=False
    )
    document_category_id = Column(
        Integer,
        ForeignKey('condition.document_categories.id', ondelete='CASCADE'),
        nullable=False
    )

    document_type = relationship('DocumentType', back_populates='document_type_categories')
    document_category = relationship('DocumentCategory', back_populates='document_type_categories')

    __table_args__ = (
        UniqueConstraint('document_type_id', 'document_category_id',
                         name='uq_document_type_category'),
        {'schema': 'condition'}
    )
