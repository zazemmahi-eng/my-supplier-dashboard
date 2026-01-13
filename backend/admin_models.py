# admin_models.py
"""
==============================================================================
ADMIN ACCOUNT MODELS & DOCUMENTATION
==============================================================================

This module defines the SQLAlchemy models for the Admin system, including
role-based access control (RBAC) and audit logging.

==============================================================================
ADMIN ACCOUNT INFORMATION
==============================================================================

REQUIRED FIELDS:
----------------
| Field           | Type      | Description                              |
|-----------------|-----------|------------------------------------------|
| user_id         | UUID      | Reference to Supabase auth.users.id      |
| email           | String    | Admin's email address                    |
| role            | Enum      | Must be "ADMIN" for admin access         |
| account_status  | Boolean   | is_active: true=active, false=disabled   |
| created_at      | DateTime  | When the admin account was created       |

OPTIONAL FIELDS:
----------------
| Field           | Type      | Description                              |
|-----------------|-----------|------------------------------------------|
| display_name    | String    | Full name for display purposes           |
| admin_level     | Enum      | Future: SUPER_ADMIN, ADMIN, MODERATOR    |
| assigned_by     | UUID      | Who promoted this user to admin          |
| updated_at      | DateTime  | Last modification timestamp              |

==============================================================================
ACCOUNT STORAGE
==============================================================================

The admin system uses a HYBRID approach:

1. AUTHENTICATION (Supabase Auth):
   - Email/password credentials stored in Supabase auth.users
   - Passwords are hashed by Supabase (bcrypt)
   - JWTs issued by Supabase for authentication
   - We NEVER store passwords in our database

2. AUTHORIZATION (user_roles table):
   - Role assignments stored in PostgreSQL user_roles table
   - Links to auth.users via user_id (UUID)
   - Role field determines access level
   - Server-side verification on every admin request

SECURITY:
- Role CANNOT be modified by client requests
- All role changes require existing admin privileges
- Role is verified server-side on every /api/admin/* endpoint

==============================================================================
EXAMPLE ADMIN USER RECORD
==============================================================================

JSON representation:
{
    "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "user_id": "550e8400-e29b-41d4-a716-446655440000",
    "email": "admin@company.com",
    "display_name": "John Admin",
    "role": "admin",
    "admin_level": "super_admin",
    "is_active": true,
    "created_at": "2025-01-13T10:00:00Z",
    "updated_at": "2025-01-13T10:00:00Z",
    "assigned_by": null
}

SQL INSERT example:
INSERT INTO user_roles (id, user_id, email, display_name, role, admin_level, is_active)
VALUES (
    gen_random_uuid(),
    '550e8400-e29b-41d4-a716-446655440000',  -- From Supabase auth.users
    'admin@company.com',
    'John Admin',
    'admin',
    'super_admin',
    true
);

==============================================================================
INITIAL ADMIN CREATION
==============================================================================

The FIRST admin must be created manually using one of these methods:

METHOD 1: CLI Script (Recommended)
----------------------------------
python backend/manage_admin.py create-admin \\
    --user-id "your-supabase-user-id" \\
    --email "admin@company.com" \\
    --name "Super Admin"

METHOD 2: Direct SQL
--------------------
-- First, create a user account via Supabase Auth (sign-up)
-- Then get the user's UUID from auth.users
-- Finally, insert into user_roles:

INSERT INTO user_roles (user_id, email, display_name, role, admin_level, is_active)
VALUES (
    'uuid-from-supabase-auth-users',
    'admin@company.com',
    'Super Admin',
    'admin',
    'super_admin',
    true
);

METHOD 3: API Endpoint (requires existing admin)
------------------------------------------------
POST /api/admin/promote-to-admin
Headers: X-Admin-User-ID: <existing-admin-uuid>
Body: { "user_id": "uuid", "email": "user@example.com" }

==============================================================================
ADMIN ROLE PERMISSIONS
==============================================================================

ALLOWED:
✓ Create new users
✓ Delete users (except self and other admins)
✓ View (read-only) any user dashboard
✓ View (read-only) any workspace
✓ View global statistics
✓ View audit logs

NOT ALLOWED:
✗ Modify user data
✗ Modify workspaces
✗ Modify KPIs or predictions
✗ Train models
✗ Upload data for users
✗ Self-assign admin role
✗ Delete other admins

==============================================================================
SECURITY REQUIREMENTS
==============================================================================

1. NO HARDCODED CREDENTIALS
   - Admin accounts created via secure methods only
   - No default admin passwords in code
   
2. PASSWORD HASHING
   - Handled by Supabase Auth (bcrypt)
   - We never see or store plaintext passwords
   
3. SERVER-SIDE VERIFICATION
   - Every /api/admin/* endpoint checks role
   - get_current_admin() dependency validates:
     a. User is authenticated (valid session)
     b. User exists in user_roles table
     c. User has role = "admin"
     d. User is_active = true
     
4. PREVENT PRIVILEGE ESCALATION
   - Regular users cannot access role endpoints
   - Only admins can promote other users
   - Self-promotion is blocked
   
5. AUDIT TRAIL
   - All admin actions logged to admin_audit_logs
   - Includes: who, what, when, target, IP address

==============================================================================
"""

import uuid
from datetime import datetime
from enum import Enum
from sqlalchemy import Column, String, Integer, DateTime, ForeignKey, Text, Enum as SQLEnum, Boolean
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

# Handle imports for both module and direct execution contexts
try:
    from backend.database import Base
except ModuleNotFoundError:
    from database import Base


# ============================================
# ENUMS FOR USER ROLES
# ============================================

class UserRole(str, Enum):
    """
    User roles for the application.
    
    Values:
    - USER: Standard user with full access to their own data only
    - ADMIN: Global administrator with read-only access to all data + user management
    
    Note: Role is stored in user_roles table, NOT in Supabase auth metadata.
    This ensures role cannot be modified by client-side requests.
    """
    USER = "user"
    ADMIN = "admin"


class AdminLevel(str, Enum):
    """
    Admin privilege levels (for future granular permissions).
    
    Values:
    - SUPER_ADMIN: Full administrative access, can manage other admins
    - ADMIN: Standard admin, can manage users but not other admins
    - MODERATOR: Limited admin, view-only access (future use)
    
    Currently not enforced, but field exists for future expansion.
    """
    SUPER_ADMIN = "super_admin"
    ADMIN = "admin"
    MODERATOR = "moderator"


# ============================================
# USER ROLE MODEL
# ============================================

class UserRoleAssignment(Base):
    """
    Maps users to their roles and admin privileges.
    
    This is the CENTRAL table for authorization decisions.
    Each user has exactly one role (defaults to USER if no record exists).
    
    RELATIONSHIP TO SUPABASE:
    - user_id references auth.users.id in Supabase
    - Email/password authentication is handled by Supabase
    - This table only handles AUTHORIZATION, not authentication
    
    SECURITY:
    - This table should only be modified via admin API endpoints
    - Direct client access to this table must be blocked via RLS
    - All modifications are logged in admin_audit_logs
    """
    __tablename__ = "user_roles"
    
    # Primary key
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4,
                comment="Unique identifier for this role assignment")
    
    # ==========================================
    # REQUIRED FIELDS
    # ==========================================
    
    # Reference to Supabase auth.users.id
    user_id = Column(
        UUID(as_uuid=True), 
        unique=True, 
        nullable=False, 
        index=True,
        comment="Foreign key to Supabase auth.users.id - the authenticated user"
    )
    
    # User's email address (synced from Supabase for display)
    email = Column(
        String(320), 
        nullable=False,
        comment="User's email address - must match Supabase auth.users.email"
    )
    
    # Role assignment - determines access level
    role = Column(
        SQLEnum(UserRole), 
        default=UserRole.USER, 
        nullable=False,
        comment="User role: 'user' for regular users, 'admin' for administrators"
    )
    
    # Account status - can be disabled without deletion
    is_active = Column(
        Boolean, 
        default=True,
        nullable=False,
        comment="Account status: true=active, false=disabled (cannot login)"
    )
    
    # Creation timestamp
    created_at = Column(
        DateTime(timezone=True), 
        default=datetime.utcnow,
        nullable=False,
        comment="When this role assignment was created"
    )
    
    # ==========================================
    # OPTIONAL FIELDS
    # ==========================================
    
    # Display name (full name)
    display_name = Column(
        String(255), 
        nullable=True,
        comment="User's full name for display purposes"
    )
    
    # Admin level (for future granular permissions)
    admin_level = Column(
        SQLEnum(AdminLevel),
        nullable=True,
        comment="Admin privilege level: super_admin, admin, or moderator"
    )
    
    # Last update timestamp
    updated_at = Column(
        DateTime(timezone=True), 
        default=datetime.utcnow, 
        onupdate=datetime.utcnow,
        comment="When this role assignment was last modified"
    )
    
    # Admin who assigned this role
    assigned_by = Column(
        UUID(as_uuid=True), 
        nullable=True,
        comment="UUID of admin who assigned this role (null for initial admin)"
    )
    
    def __repr__(self):
        return f"<UserRoleAssignment(user_id={self.user_id}, email={self.email}, role={self.role})>"
    
    def is_admin(self) -> bool:
        """Check if user has admin role and is active."""
        return self.role == UserRole.ADMIN and self.is_active
    
    def is_super_admin(self) -> bool:
        """Check if user has super admin privileges."""
        return self.is_admin() and self.admin_level == AdminLevel.SUPER_ADMIN
    
    def to_dict(self) -> dict:
        """Convert to dictionary for API responses."""
        return {
            "id": str(self.id),
            "user_id": str(self.user_id),
            "email": self.email,
            "display_name": self.display_name,
            "role": self.role.value,
            "admin_level": self.admin_level.value if self.admin_level else None,
            "is_active": self.is_active,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }


# ============================================
# ADMIN ACTIVITY LOG (AUDIT TRAIL)
# ============================================

class AdminAuditLog(Base):
    """
    Audit trail for all admin actions.
    
    PURPOSE:
    - Security compliance and monitoring
    - Track who did what and when
    - Investigate security incidents
    - Regulatory compliance (if needed)
    
    LOGGED ACTIONS:
    - VIEW_USER: Admin viewed a user's profile
    - VIEW_DASHBOARD: Admin viewed a user's dashboard
    - VIEW_WORKSPACE: Admin viewed a workspace
    - CREATE_USER: Admin created a new user
    - DELETE_USER: Admin deleted a user
    - PROMOTE_ADMIN: Admin promoted a user to admin
    - REVOKE_ADMIN: Admin revoked admin privileges
    - LOGIN: Admin logged into admin panel
    - EXPORT_DATA: Admin exported data
    
    RETENTION:
    - Logs should be retained for at least 90 days
    - Implement log rotation for production
    """
    __tablename__ = "admin_audit_logs"
    
    id = Column(
        UUID(as_uuid=True), 
        primary_key=True, 
        default=uuid.uuid4,
        comment="Unique identifier for this log entry"
    )
    
    # Admin who performed the action
    admin_user_id = Column(
        UUID(as_uuid=True), 
        nullable=False, 
        index=True,
        comment="UUID of the admin who performed this action"
    )
    
    # Action type (what was done)
    action = Column(
        String(100), 
        nullable=False,
        index=True,
        comment="Type of action: VIEW_USER, DELETE_USER, PROMOTE_ADMIN, etc."
    )
    
    # Target of the action
    target_type = Column(
        String(50), 
        nullable=True,
        comment="Type of target: 'user', 'workspace', 'system', etc."
    )
    
    target_id = Column(
        UUID(as_uuid=True), 
        nullable=True,
        comment="UUID of the target entity (user, workspace, etc.)"
    )
    
    # Additional details (JSON-safe string)
    details = Column(
        Text, 
        nullable=True,
        comment="Additional details about the action (JSON format)"
    )
    
    # Request metadata
    ip_address = Column(
        String(45), 
        nullable=True,
        comment="IP address of the admin (IPv4 or IPv6)"
    )
    
    user_agent = Column(
        String(500),
        nullable=True,
        comment="Browser/client user agent string"
    )
    
    # Timestamp
    created_at = Column(
        DateTime(timezone=True), 
        default=datetime.utcnow,
        nullable=False,
        index=True,
        comment="When this action occurred"
    )
    
    def __repr__(self):
        return f"<AdminAuditLog(admin={self.admin_user_id}, action={self.action}, at={self.created_at})>"
    
    def to_dict(self) -> dict:
        """Convert to dictionary for API responses."""
        return {
            "id": str(self.id),
            "admin_user_id": str(self.admin_user_id),
            "action": self.action,
            "target_type": self.target_type,
            "target_id": str(self.target_id) if self.target_id else None,
            "details": self.details,
            "ip_address": self.ip_address,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
