"""
Database migration script for Admin functionality.

This migration creates:
1. user_roles table - Maps users to their roles (USER/ADMIN)
2. admin_audit_logs table - Audit trail for admin actions

Run this script to set up admin infrastructure.
"""

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from sqlalchemy import text
from database import engine, Base

def migrate():
    """Create admin tables in the database."""
    
    print("=" * 60)
    print("Admin System Migration")
    print("=" * 60)
    
    with engine.connect() as conn:
        # ============================================
        # 1. CREATE USER_ROLES TABLE
        # ============================================
        
        # Check if user_roles table exists
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
                CREATE TYPE user_role_enum AS ENUM ('user', 'admin');
            """))
            
            conn.execute(text("""
                CREATE TABLE user_roles (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    user_id UUID UNIQUE NOT NULL,
                    email VARCHAR(320),
                    display_name VARCHAR(255),
                    role user_role_enum DEFAULT 'user' NOT NULL,
                    is_active BOOLEAN DEFAULT TRUE,
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                    assigned_by UUID
                );
                
                CREATE INDEX idx_user_roles_user_id ON user_roles(user_id);
                CREATE INDEX idx_user_roles_role ON user_roles(role);
                
                COMMENT ON TABLE user_roles IS 'User role assignments for RBAC';
                COMMENT ON COLUMN user_roles.user_id IS 'Reference to auth.users';
                COMMENT ON COLUMN user_roles.role IS 'User role: user or admin';
            """))
            conn.commit()
            print("  ✓ Created 'user_roles' table")
        else:
            print("\n✓ 'user_roles' table already exists")
        
        # ============================================
        # 2. CREATE ADMIN_AUDIT_LOGS TABLE
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
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    admin_user_id UUID NOT NULL,
                    action VARCHAR(100) NOT NULL,
                    target_type VARCHAR(50),
                    target_id UUID,
                    details TEXT,
                    ip_address VARCHAR(45),
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
                );
                
                CREATE INDEX idx_audit_admin_id ON admin_audit_logs(admin_user_id);
                CREATE INDEX idx_audit_action ON admin_audit_logs(action);
                CREATE INDEX idx_audit_created_at ON admin_audit_logs(created_at);
                
                COMMENT ON TABLE admin_audit_logs IS 'Audit trail for admin actions';
            """))
            conn.commit()
            print("  ✓ Created 'admin_audit_logs' table")
        else:
            print("\n✓ 'admin_audit_logs' table already exists")
        
        # ============================================
        # 3. CREATE DEFAULT ADMIN USER
        # ============================================
        
        print("\n" + "-" * 40)
        print("ADMIN USER SETUP")
        print("-" * 40)
        print("""
To create an admin user:
1. First, create a regular user account via the app
2. Then run the following SQL to promote them to admin:

UPDATE user_roles 
SET role = 'admin' 
WHERE email = 'your-admin@email.com';

Or insert directly:

INSERT INTO user_roles (user_id, email, display_name, role)
VALUES (
    'user-uuid-from-auth-users',
    'admin@example.com',
    'Admin User',
    'admin'
);
        """)
    
    print("\n" + "=" * 60)
    print("Migration completed successfully!")
    print("=" * 60)


def create_admin_user(email: str, user_id: str):
    """
    Helper function to create an admin user.
    Call this after the user has registered through normal flow.
    
    Usage:
        from migrate_admin import create_admin_user
        create_admin_user('admin@example.com', 'user-uuid')
    """
    with engine.connect() as conn:
        # Check if user role already exists
        result = conn.execute(text("""
            SELECT id FROM user_roles WHERE user_id = :user_id
        """), {"user_id": user_id})
        
        existing = result.fetchone()
        
        if existing:
            # Update existing role to admin
            conn.execute(text("""
                UPDATE user_roles 
                SET role = 'admin', email = :email, updated_at = NOW()
                WHERE user_id = :user_id
            """), {"user_id": user_id, "email": email})
            print(f"✓ Updated user {email} to ADMIN role")
        else:
            # Create new admin role
            conn.execute(text("""
                INSERT INTO user_roles (user_id, email, role)
                VALUES (:user_id, :email, 'admin')
            """), {"user_id": user_id, "email": email})
            print(f"✓ Created ADMIN role for {email}")
        
        conn.commit()


if __name__ == "__main__":
    migrate()
