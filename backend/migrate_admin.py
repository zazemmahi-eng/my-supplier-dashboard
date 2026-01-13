"""
==============================================================================
Database Migration Script for Admin System
==============================================================================

This migration creates the necessary database tables for the admin system:

1. user_roles table:
   - Maps Supabase auth users to application roles
   - Stores admin privileges and account status
   - Links to auth.users via user_id (UUID)

2. admin_audit_logs table:
   - Comprehensive audit trail for all admin actions
   - Security compliance and monitoring
   - Tracks who, what, when, and target of actions

USAGE:
------
# Run migration
python migrate_admin.py

# Or from backend directory
cd backend && python migrate_admin.py

AFTER MIGRATION:
----------------
Use manage_admin.py to create the first admin:
python manage_admin.py create-admin --user-id "UUID" --email "admin@example.com"

==============================================================================
"""

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from sqlalchemy import text
from database import engine, Base

def migrate():
    """
    Create admin tables in the database.
    
    Tables created:
    - user_roles: User role assignments (USER/ADMIN)
    - admin_audit_logs: Audit trail for admin actions
    """
    
    print("=" * 60)
    print("ADMIN SYSTEM DATABASE MIGRATION")
    print("=" * 60)
    
    with engine.connect() as conn:
        # ============================================
        # 1. CREATE ENUM TYPES
        # ============================================
        
        # Check if user_role_enum exists
        result = conn.execute(text("""
            SELECT EXISTS (
                SELECT 1 FROM pg_type WHERE typname = 'user_role_enum'
            )
        """))
        if not result.scalar():
            print("\nCreating 'user_role_enum' type...")
            conn.execute(text("""
                CREATE TYPE user_role_enum AS ENUM ('user', 'admin');
            """))
            conn.commit()
            print("  ✓ Created 'user_role_enum'")
        
        # Check if admin_level_enum exists
        result = conn.execute(text("""
            SELECT EXISTS (
                SELECT 1 FROM pg_type WHERE typname = 'admin_level_enum'
            )
        """))
        if not result.scalar():
            print("\nCreating 'admin_level_enum' type...")
            conn.execute(text("""
                CREATE TYPE admin_level_enum AS ENUM ('super_admin', 'admin', 'moderator');
            """))
            conn.commit()
            print("  ✓ Created 'admin_level_enum'")
        
        # ============================================
        # 2. CREATE USER_ROLES TABLE
        # ============================================
        
        result = conn.execute(text("""
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_schema = 'public' 
                AND table_name = 'user_roles'
            )
        """))
        table_exists = result.scalar()
        
        if not table_exists:
            print("\nCreating 'user_roles' table...")
            conn.execute(text("""
                CREATE TABLE user_roles (
                    -- Primary key
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    
                    -- Required fields
                    user_id UUID UNIQUE NOT NULL,
                    email VARCHAR(320) NOT NULL,
                    role user_role_enum DEFAULT 'user' NOT NULL,
                    is_active BOOLEAN DEFAULT TRUE NOT NULL,
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
                    
                    -- Optional fields
                    display_name VARCHAR(255),
                    admin_level admin_level_enum,
                    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                    assigned_by UUID,
                    
                    -- Constraints
                    CONSTRAINT fk_assigned_by FOREIGN KEY (assigned_by) 
                        REFERENCES user_roles(user_id) ON DELETE SET NULL
                );
                
                -- Indexes for performance
                CREATE INDEX idx_user_roles_user_id ON user_roles(user_id);
                CREATE INDEX idx_user_roles_role ON user_roles(role);
                CREATE INDEX idx_user_roles_email ON user_roles(email);
                CREATE INDEX idx_user_roles_is_active ON user_roles(is_active);
                
                -- Table comments
                COMMENT ON TABLE user_roles IS 
                    'User role assignments for RBAC - links Supabase auth.users to app roles';
                COMMENT ON COLUMN user_roles.user_id IS 
                    'Reference to Supabase auth.users.id - the authenticated user UUID';
                COMMENT ON COLUMN user_roles.email IS 
                    'User email address - must match Supabase auth.users.email';
                COMMENT ON COLUMN user_roles.role IS 
                    'User role: user (default) or admin';
                COMMENT ON COLUMN user_roles.admin_level IS 
                    'Admin privilege level: super_admin, admin, or moderator';
                COMMENT ON COLUMN user_roles.is_active IS 
                    'Account status: true=active, false=disabled';
                COMMENT ON COLUMN user_roles.assigned_by IS 
                    'UUID of admin who assigned this role (null for initial admin)';
            """))
            conn.commit()
            print("  ✓ Created 'user_roles' table with all fields")
        else:
            print("\n✓ 'user_roles' table already exists")
            
            # Check if admin_level column exists
            result = conn.execute(text("""
                SELECT EXISTS (
                    SELECT 1 FROM information_schema.columns 
                    WHERE table_name = 'user_roles' AND column_name = 'admin_level'
                )
            """))
            if not result.scalar():
                print("  Adding 'admin_level' column...")
                conn.execute(text("""
                    ALTER TABLE user_roles 
                    ADD COLUMN admin_level admin_level_enum;
                """))
                conn.commit()
                print("  ✓ Added 'admin_level' column")
        
        # ============================================
        # 3. CREATE ADMIN_AUDIT_LOGS TABLE
        # ============================================
        
        result = conn.execute(text("""
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_schema = 'public' 
                AND table_name = 'admin_audit_logs'
            )
        """))
        table_exists = result.scalar()
        
        if not table_exists:
            print("\nCreating 'admin_audit_logs' table...")
            conn.execute(text("""
                CREATE TABLE admin_audit_logs (
                    -- Primary key
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    
                    -- Required fields
                    admin_user_id UUID NOT NULL,
                    action VARCHAR(100) NOT NULL,
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
                    
                    -- Target information
                    target_type VARCHAR(50),
                    target_id UUID,
                    
                    -- Additional metadata
                    details TEXT,
                    ip_address VARCHAR(45),
                    user_agent VARCHAR(500)
                );
                
                -- Indexes for querying
                CREATE INDEX idx_audit_admin_id ON admin_audit_logs(admin_user_id);
                CREATE INDEX idx_audit_action ON admin_audit_logs(action);
                CREATE INDEX idx_audit_created_at ON admin_audit_logs(created_at DESC);
                CREATE INDEX idx_audit_target ON admin_audit_logs(target_type, target_id);
                
                -- Table comments
                COMMENT ON TABLE admin_audit_logs IS 
                    'Audit trail for all admin actions - security compliance';
                COMMENT ON COLUMN admin_audit_logs.action IS 
                    'Action type: VIEW_USER, DELETE_USER, PROMOTE_ADMIN, etc.';
                COMMENT ON COLUMN admin_audit_logs.target_type IS 
                    'Type of target: user, workspace, system';
                COMMENT ON COLUMN admin_audit_logs.details IS 
                    'Additional action details in JSON format';
            """))
            conn.commit()
            print("  ✓ Created 'admin_audit_logs' table")
        else:
            print("\n✓ 'admin_audit_logs' table already exists")
            
            # Check if user_agent column exists
            result = conn.execute(text("""
                SELECT EXISTS (
                    SELECT 1 FROM information_schema.columns 
                    WHERE table_name = 'admin_audit_logs' AND column_name = 'user_agent'
                )
            """))
            if not result.scalar():
                print("  Adding 'user_agent' column...")
                conn.execute(text("""
                    ALTER TABLE admin_audit_logs 
                    ADD COLUMN user_agent VARCHAR(500);
                """))
                conn.commit()
                print("  ✓ Added 'user_agent' column")
    
    # ============================================
    # 4. PRINT NEXT STEPS
    # ============================================
    
    print("\n" + "=" * 60)
    print("MIGRATION COMPLETED SUCCESSFULLY!")
    print("=" * 60)
    
    print("""
╔══════════════════════════════════════════════════════════════╗
║                    NEXT STEPS                                ║
╠══════════════════════════════════════════════════════════════╣
║                                                              ║
║  1. CREATE YOUR FIRST ADMIN ACCOUNT                          ║
║                                                              ║
║     First, sign up a user through the normal app flow.       ║
║     Then promote them to admin using the CLI:                ║
║                                                              ║
║     python manage_admin.py create-admin \\                    ║
║         --user-id "YOUR-SUPABASE-USER-UUID" \\                ║
║         --email "admin@yourcompany.com" \\                    ║
║         --name "Admin Name"                                  ║
║                                                              ║
║  2. VERIFY ADMIN ACCESS                                      ║
║                                                              ║
║     Login with the admin account.                            ║
║     You should be redirected to /admin automatically.        ║
║                                                              ║
║  3. ADMIN CAPABILITIES                                       ║
║                                                              ║
║     ✓ View global statistics                                 ║
║     ✓ View all users and their workspaces                    ║
║     ✓ View any dashboard (read-only)                         ║
║     ✓ Delete users                                           ║
║     ✓ Promote users to admin                                 ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
    """)


def create_admin_user(email: str, user_id: str, display_name: str = None, 
                      admin_level: str = "super_admin"):
    """
    Helper function to create or promote an admin user.
    
    This function should be called AFTER the user has registered
    through the normal Supabase auth flow.
    
    Args:
        email: User's email address
        user_id: Supabase auth.users UUID
        display_name: Optional display name
        admin_level: Admin privilege level (super_admin, admin, moderator)
    
    Usage:
        from migrate_admin import create_admin_user
        create_admin_user('admin@example.com', 'user-uuid', 'John Admin', 'super_admin')
    """
    with engine.connect() as conn:
        # Check if user role already exists
        result = conn.execute(text("""
            SELECT id, role FROM user_roles WHERE user_id = :user_id
        """), {"user_id": user_id})
        
        existing = result.fetchone()
        
        if existing:
            if existing[1] == 'admin':
                print(f"✓ User {email} is already an ADMIN")
                return
            
            # Update existing role to admin
            conn.execute(text("""
                UPDATE user_roles 
                SET role = 'admin', 
                    admin_level = :admin_level,
                    email = :email, 
                    display_name = COALESCE(:display_name, display_name),
                    updated_at = NOW()
                WHERE user_id = :user_id
            """), {
                "user_id": user_id, 
                "email": email,
                "display_name": display_name,
                "admin_level": admin_level
            })
            print(f"✓ Promoted user {email} to ADMIN ({admin_level})")
        else:
            # Create new admin role
            conn.execute(text("""
                INSERT INTO user_roles (user_id, email, display_name, role, admin_level)
                VALUES (:user_id, :email, :display_name, 'admin', :admin_level)
            """), {
                "user_id": user_id, 
                "email": email,
                "display_name": display_name or email.split('@')[0],
                "admin_level": admin_level
            })
            print(f"✓ Created ADMIN account for {email} ({admin_level})")
        
        conn.commit()


if __name__ == "__main__":
    migrate()
