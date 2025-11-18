from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, Text, text, Date
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import uuid

# Import avec préfixe backend.
from backend.database import Base

# ============================================
# MODÈLE SUPPLIER (Fournisseurs)
# ============================================

class Supplier(Base):
    """Table des fournisseurs"""
    __tablename__ = "suppliers"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(Text, unique=True, nullable=False, index=True)
    email = Column(Text)
    phone = Column(Text)
    address = Column(Text)
    notes = Column(Text)
    quality_rating = Column(Integer, default=5)  # Note de 1 à 10
    delivery_rating = Column(Integer, default=5)  # Note de 1 à 10
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    # Relations
    orders = relationship("Order", back_populates="supplier", cascade="all, delete-orphan")

    def __repr__(self):
        return f"<Supplier(id={self.id}, name='{self.name}')>"

# ============================================
# MODÈLE ORDER (Commandes)
# ============================================

class Order(Base):
    """Table des commandes"""
    __tablename__ = "orders"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    supplier_id = Column(UUID(as_uuid=True), ForeignKey("suppliers.id", ondelete="CASCADE"), nullable=False)
    
    # Utiliser Date au lieu de DateTime pour les dates de livraison
    date_promised = Column(Date, nullable=False)
    date_delivered = Column(Date)
    
    defects = Column(Float, default=0.0)  # Taux de défauts (0.0 = 0%, 1.0 = 100%)
    
    # Champs optionnels
    order_reference = Column(String(100))
    quantity = Column(Integer)
    amount = Column(Float)
    notes = Column(Text)
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relations
    supplier = relationship("Supplier", back_populates="orders")

    def __repr__(self):
        return f"<Order(id={self.id}, supplier_id={self.supplier_id}, date_promised={self.date_promised})>"

# ============================================
# MODÈLE ACCOUNT (Profils utilisateurs)
# ============================================

class Account(Base):
    """
    Table des comptes utilisateurs
    Liée à la table auth.users de Supabase pour l'authentification
    """
    __tablename__ = "accounts"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(255), nullable=False)
    email = Column(String(255), unique=True, index=True)
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    # Clés étrangères vers auth.users (Supabase)
    created_by = Column(UUID(as_uuid=True))
    updated_by = Column(UUID(as_uuid=True))
    
    # Photo de profil
    picture_url = Column(String(500))
    
    # Données publiques (JSON)
    public_data = Column(JSONB, nullable=False, server_default=text("'{}'::jsonb"))

    def __repr__(self):
        return f"<Account(id={self.id}, name='{self.name}', email='{self.email}')>"