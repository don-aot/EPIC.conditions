"""Document model class.

Manages the document
"""
from sqlalchemy import ARRAY, Boolean, Column, Date, ForeignKey, Integer, String, Text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import relationship
from sqlalchemy.schema import UniqueConstraint

from .base_model import BaseModel

Base = declarative_base()


class Document(BaseModel):
    """Definition of the Documents entity."""

    __tablename__ = 'documents'

    id = Column(Integer, primary_key=True, autoincrement=True)
    document_id = Column(String(255), nullable=False)
    amended_id = Column(Integer, ForeignKey('condition.documents.id', ondelete='CASCADE'), nullable=True)
    document_type_id = Column(Integer, ForeignKey('condition.document_types.id', ondelete='CASCADE'), nullable=True)
    document_category_id = Column(Integer, ForeignKey('condition.document_categories.id', ondelete='RESTRICT'), nullable=True)
    document_label = Column(Text)
    document_link = Column(Text)
    document_file_name = Column(Text)
    date_issued = Column(Date)
    act = Column(Integer)
    first_nations = Column(ARRAY(Text))
    consultation_records_required = Column(Boolean)
    is_latest_amendment_added = Column(Boolean)
    is_active = Column(Boolean, default=False, nullable=False, server_default='false')

    # Foreign key to link to the project
    project_id = Column(String(255), ForeignKey('condition.projects.project_id', ondelete='RESTRICT'))

    # Establish the relationship back to the Project table
    project = relationship('Project', back_populates='documents')

    __table_args__ = (
        UniqueConstraint('document_id', name='uq_document'),
        {'schema': 'condition'},
    )

    @classmethod
    def get_all(cls):
        """Get all documents."""
        return cls.query.all()

    @classmethod
    def get_by_id(cls, document_id):
        """Get document by document_id."""
        return cls.query.filter_by(id=document_id).first()
