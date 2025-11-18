import sys
import os
from pathlib import Path
from datetime import datetime
import uuid

# Configuration du chemin du projet
PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from sqlalchemy import Column, String, Integer, Float, DateTime, ForeignKey, Text, Date, func  # ✅ Ajoutez func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from backend.database import Base

# ============================================
# MODÈLES SQLAlchemy
# ============================================

class Supplier(Base):
    __tablename__ = "suppliers"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(200), nullable=False, unique=True, index=True)
    email = Column(String(200))
    phone = Column(String(50))
    address = Column(Text)
    quality_rating = Column(Integer, default=5)
    delivery_rating = Column(Integer, default=5)
    notes = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())  # ✅ Maintenant func est défini
    
    # Relation avec les commandes
    orders = relationship("Order", back_populates="supplier", cascade="all, delete-orphan")
    
    def __repr__(self):
        return f"<Supplier(id={self.id}, name='{self.name}')>"


class Order(Base):
    __tablename__ = "orders"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    supplier_id = Column(UUID(as_uuid=True), ForeignKey("suppliers.id"), nullable=False)
    date_promised = Column(DateTime(timezone=True), nullable=False)
    date_delivered = Column(DateTime(timezone=True))
    defects = Column(Float, default=0.0)
    order_reference = Column(String(100))
    quantity = Column(Integer)
    amount = Column(Float)
    notes = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())  # ✅ Et ici aussi
    
    # Relation avec le fournisseur
    supplier = relationship("Supplier", back_populates="orders")
    
    def __repr__(self):
        return f"<Order(id={self.id}, supplier_id={self.supplier_id})>"


class Account(Base):
    __tablename__ = "accounts"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email = Column(String(200), nullable=False, unique=True, index=True)
    name = Column(String(200))
    created_at = Column(DateTime(timezone=True), server_default=func.now())  # ✅ Et ici
    
    def __repr__(self):
        return f"<Account(id={self.id}, email='{self.email}')>"