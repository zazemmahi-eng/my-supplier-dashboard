# admin_models.py
"""
SQLAlchemy models for Admin functionality.
Implements role-based access control (RBAC) for admin users.

Admin Role Permissions:
- Create/Delete users
- View (read-only) any user dashboard
- View (read-only) any workspace
- CANNOT modify user data, models, KPIs, predictions, or workspaces
"""

import uuid
from datetime import datetime
from enum import Enum
from sqlalchemy import Column, String, Integer, DateTime, ForeignKey, Text, Enum as SQLEnum, Boolean
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from backend.database import Base


# ============================================
# ENUMS FOR USER ROLES
# ============================================

class UserRole(str, Enum):
    """
    User roles for the application:
    - USER: Standard user with full access to their own data
    - ADMIN: Global administrator with read-only access to all data + user management
    """
    USER = "user"
    ADMIN = "admin"


# ============================================
# USER ROLE MODEL
# ============================================

class UserRoleAssignment(Base):
    """
    Maps users to their roles.
    Each user has exactly one role (defaults to USER).
    
    This table links to the Supabase auth.users table via user_id.
    """
    __tablename__ = "user_roles"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    
    # Reference to auth.users (Supabase managed)
    user_id = Column(UUID(as_uuid=True), unique=True, nullable=False, index=True)
    
    # User's email (for display purposes, synced from auth.users)
    email = Column(String(320), nullable=True)
    
    # Display name
    display_name = Column(String(255), nullable=True)
    
    # Role assignment
    role = Column(SQLEnum(UserRole), default=UserRole.USER, nullable=False)
    
    # Is this role active?
    is_active = Column(Boolean, default=True)
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at = Column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Admin who assigned this role (NULL for self-registration)
    assigned_by = Column(UUID(as_uuid=True), nullable=True)
    
    def __repr__(self):
        return f"<UserRoleAssignment(user_id={self.user_id}, role={self.role})>"
    
    def is_admin(self) -> bool:
        """Check if user has admin role"""
        return self.role == UserRole.ADMIN


# ============================================
# ADMIN ACTIVITY LOG (AUDIT TRAIL)
# ============================================

class AdminAuditLog(Base):
    """
    Audit trail for admin actions.
    Records all admin activities for security and compliance.
    """
    __tablename__ = "admin_audit_logs"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    
    # Admin who performed the action
    admin_user_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    
    # Action type
    action = Column(String(100), nullable=False)
    # e.g., "VIEW_USER_DASHBOARD", "VIEW_WORKSPACE", "DELETE_USER", "CREATE_USER"
    
    # Target of the action
    target_type = Column(String(50), nullable=True)  # "user", "workspace", etc.
    target_id = Column(UUID(as_uuid=True), nullable=True)
    
    # Additional details (JSON-safe string)
    details = Column(Text, nullable=True)
    
    # IP address (for security)
    ip_address = Column(String(45), nullable=True)
    
    # Timestamp
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)
    
    def __repr__(self):
        return f"<AdminAuditLog(admin={self.admin_user_id}, action={self.action})>"
