#!/usr/bin/env python3
"""
Admin User Management CLI
=========================

Command-line utility to manage admin users in the system.

Usage:
------
# Create initial super admin (first admin in the system)
python manage_admin.py create-admin --user-id "your-supabase-user-id" --email "admin@example.com"

# Promote existing user to admin
python manage_admin.py promote --user-id "existing-user-id" --email "user@example.com"

# List all admins
python manage_admin.py list-admins

# Revoke admin privileges
python manage_admin.py revoke --user-id "admin-user-id"

# Check if user is admin
python manage_admin.py check --user-id "user-id"

Notes:
------
- The first admin must be created manually using this script
- After that, admins can promote other users via the admin dashboard
- User ID should be the Supabase auth user UUID
"""

import argparse
import sys
import uuid
from datetime import datetime
from sqlalchemy.orm import Session
from sqlalchemy import text

# Import from backend modules
try:
    from backend.database import engine, get_db, SessionLocal
    from backend.admin_models import UserRole, UserRoleAssignment, AdminAuditLog
except ImportError:
    # If running from backend directory
    from database import engine, get_db, SessionLocal
    from admin_models import UserRole, UserRoleAssignment, AdminAuditLog


def validate_uuid(value: str) -> uuid.UUID:
    """Validate and convert string to UUID."""
    try:
        return uuid.UUID(value)
    except ValueError:
        print(f"Error: '{value}' is not a valid UUID")
        sys.exit(1)


def create_admin(user_id: str, email: str, display_name: str = None):
    """
    Create a new admin user.
    
    This is used to create the initial super admin or
    add admin role to an existing user.
    """
    user_uuid = validate_uuid(user_id)
    
    db = SessionLocal()
    try:
        # Check if user already has a role
        existing = db.query(UserRoleAssignment).filter(
            UserRoleAssignment.user_id == user_uuid
        ).first()
        
        if existing:
            if existing.role == UserRole.ADMIN:
                print(f"User {email} is already an admin.")
                return False
            else:
                # Update to admin
                existing.role = UserRole.ADMIN
                existing.is_active = True
                existing.display_name = display_name or existing.display_name
                db.commit()
                print(f"✓ User {email} has been promoted to ADMIN.")
                return True
        
        # Create new admin role
        new_admin = UserRoleAssignment(
            user_id=user_uuid,
            email=email,
            display_name=display_name or email.split('@')[0],
            role=UserRole.ADMIN,
            assigned_by=None,  # Self-assigned for initial admin
            is_active=True
        )
        db.add(new_admin)
        db.commit()
        
        print(f"✓ Admin user created successfully!")
        print(f"  User ID: {user_id}")
        print(f"  Email: {email}")
        print(f"  Role: ADMIN")
        print(f"\nYou can now login with this account and access /admin")
        return True
        
    except Exception as e:
        db.rollback()
        print(f"Error creating admin: {e}")
        return False
    finally:
        db.close()


def list_admins():
    """List all admin users in the system."""
    db = SessionLocal()
    try:
        admins = db.query(UserRoleAssignment).filter(
            UserRoleAssignment.role == UserRole.ADMIN
        ).all()
        
        if not admins:
            print("No admin users found.")
            print("\nUse 'create-admin' to create the first admin.")
            return
        
        print(f"\n{'='*60}")
        print(f"ADMIN USERS ({len(admins)} total)")
        print(f"{'='*60}\n")
        
        for admin in admins:
            status = "✓ Active" if admin.is_active else "✗ Inactive"
            print(f"User ID: {admin.user_id}")
            print(f"Email: {admin.email}")
            print(f"Display Name: {admin.display_name or 'N/A'}")
            print(f"Status: {status}")
            print(f"Created: {admin.created_at}")
            print("-" * 40)
        
    finally:
        db.close()


def revoke_admin(user_id: str):
    """Revoke admin privileges from a user."""
    user_uuid = validate_uuid(user_id)
    
    db = SessionLocal()
    try:
        user_role = db.query(UserRoleAssignment).filter(
            UserRoleAssignment.user_id == user_uuid
        ).first()
        
        if not user_role:
            print(f"User not found in role system.")
            return False
        
        if user_role.role != UserRole.ADMIN:
            print(f"User is not an admin.")
            return False
        
        # Demote to regular user
        user_role.role = UserRole.USER
        db.commit()
        
        print(f"✓ Admin privileges revoked for {user_role.email}")
        return True
        
    except Exception as e:
        db.rollback()
        print(f"Error revoking admin: {e}")
        return False
    finally:
        db.close()


def check_user(user_id: str):
    """Check if a user has admin role."""
    user_uuid = validate_uuid(user_id)
    
    db = SessionLocal()
    try:
        user_role = db.query(UserRoleAssignment).filter(
            UserRoleAssignment.user_id == user_uuid
        ).first()
        
        if not user_role:
            print(f"User not found in role system.")
            print("Role: USER (default)")
            return
        
        print(f"\nUser ID: {user_role.user_id}")
        print(f"Email: {user_role.email}")
        print(f"Role: {user_role.role.value.upper()}")
        print(f"Active: {'Yes' if user_role.is_active else 'No'}")
        print(f"Is Admin: {'Yes' if user_role.role == UserRole.ADMIN and user_role.is_active else 'No'}")
        
    finally:
        db.close()


def main():
    parser = argparse.ArgumentParser(
        description="Admin User Management CLI",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Create the first admin
  python manage_admin.py create-admin --user-id "550e8400-e29b-41d4-a716-446655440000" --email "admin@company.com"
  
  # Promote existing user
  python manage_admin.py promote --user-id "550e8400-e29b-41d4-a716-446655440000" --email "user@company.com"
  
  # List all admins
  python manage_admin.py list-admins
  
  # Check user role
  python manage_admin.py check --user-id "550e8400-e29b-41d4-a716-446655440000"
        """
    )
    
    subparsers = parser.add_subparsers(dest="command", help="Available commands")
    
    # Create admin command
    create_parser = subparsers.add_parser("create-admin", help="Create a new admin user")
    create_parser.add_argument("--user-id", required=True, help="Supabase auth user UUID")
    create_parser.add_argument("--email", required=True, help="User email address")
    create_parser.add_argument("--name", help="Display name (optional)")
    
    # Promote command (alias for create-admin)
    promote_parser = subparsers.add_parser("promote", help="Promote existing user to admin")
    promote_parser.add_argument("--user-id", required=True, help="Supabase auth user UUID")
    promote_parser.add_argument("--email", required=True, help="User email address")
    promote_parser.add_argument("--name", help="Display name (optional)")
    
    # List admins command
    subparsers.add_parser("list-admins", help="List all admin users")
    
    # Revoke command
    revoke_parser = subparsers.add_parser("revoke", help="Revoke admin privileges")
    revoke_parser.add_argument("--user-id", required=True, help="Admin user UUID to revoke")
    
    # Check command
    check_parser = subparsers.add_parser("check", help="Check if user is admin")
    check_parser.add_argument("--user-id", required=True, help="User UUID to check")
    
    args = parser.parse_args()
    
    if not args.command:
        parser.print_help()
        return
    
    if args.command in ["create-admin", "promote"]:
        create_admin(args.user_id, args.email, getattr(args, 'name', None))
    elif args.command == "list-admins":
        list_admins()
    elif args.command == "revoke":
        revoke_admin(args.user_id)
    elif args.command == "check":
        check_user(args.user_id)


if __name__ == "__main__":
    main()
