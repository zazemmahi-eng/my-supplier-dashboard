"""
Database Migration Script for Users and Workspaces
==================================================

This script sets up the proper database structure for managing
users and their workspaces in Supabase/PostgreSQL.

Usage:
    python migrate_users_workspaces.py [--seed]

Options:
    --seed    Also insert test seed data after migration
"""

import os
import sys
from pathlib import Path

# Add backend to path
sys.path.insert(0, str(Path(__file__).parent))

from database import SessionLocal, engine
from sqlalchemy import text
from sqlalchemy.orm import Session


def run_migration(db: Session, sql_file: str) -> bool:
    """Run a SQL migration file"""
    migration_path = Path(__file__).parent / "migrations" / sql_file
    
    if not migration_path.exists():
        print(f"❌ Migration file not found: {migration_path}")
        return False
    
    print(f"\n{'='*60}")
    print(f"Running migration: {sql_file}")
    print(f"{'='*60}")
    
    try:
        with open(migration_path, 'r', encoding='utf-8') as f:
            sql = f.read()
        
        # Split by semicolons but be careful with functions
        # For complex SQL, execute as a whole
        db.execute(text(sql))
        db.commit()
        
        print(f"✅ Migration {sql_file} completed successfully!")
        return True
        
    except Exception as e:
        print(f"❌ Error running migration: {e}")
        db.rollback()
        return False


def create_users_table(db: Session):
    """Create the users table with proper structure"""
    print("\n📋 Creating users table...")
    
    sql = """
    -- Create users table if not exists
    CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email VARCHAR(255) UNIQUE NOT NULL,
        full_name VARCHAR(255),
        role VARCHAR(20) NOT NULL DEFAULT 'USER' 
            CHECK (role IN ('USER', 'ADMIN')),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );
    
    -- Create indexes
    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
    CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
    """
    
    try:
        db.execute(text(sql))
        db.commit()
        print("✅ Users table created/verified")
        return True
    except Exception as e:
        print(f"❌ Error creating users table: {e}")
        db.rollback()
        return False


def update_workspaces_table(db: Session):
    """Add user_id foreign key to workspaces table"""
    print("\n📋 Updating workspaces table with user_id...")
    
    # Check if user_id column exists
    check_sql = """
    SELECT column_name 
    FROM information_schema.columns 
    WHERE table_name = 'workspaces' AND column_name = 'user_id'
    """
    
    result = db.execute(text(check_sql)).fetchone()
    
    if result:
        print("   user_id column already exists")
    else:
        print("   Adding user_id column...")
        try:
            db.execute(text("""
                ALTER TABLE workspaces 
                ADD COLUMN user_id UUID REFERENCES users(id) ON DELETE CASCADE
            """))
            db.commit()
            print("✅ user_id column added")
        except Exception as e:
            print(f"⚠️  Could not add foreign key (users table may not exist yet): {e}")
            # Try without FK constraint
            try:
                db.execute(text("ALTER TABLE workspaces ADD COLUMN user_id UUID"))
                db.commit()
                print("✅ user_id column added (without FK)")
            except:
                db.rollback()
    
    # Create index
    try:
        db.execute(text("CREATE INDEX IF NOT EXISTS idx_workspaces_user_id ON workspaces(user_id)"))
        db.commit()
        print("✅ Index created on workspaces.user_id")
    except Exception as e:
        db.rollback()
    
    return True


def sync_existing_admin(db: Session):
    """Sync existing admin from user_roles to users table"""
    print("\n📋 Syncing existing admin to users table...")
    
    # Get admin from user_roles
    result = db.execute(text("""
        SELECT user_id, email, display_name, role 
        FROM user_roles 
        WHERE role = 'admin' AND is_active = true
        LIMIT 1
    """)).fetchone()
    
    if result:
        user_id, email, display_name, role = result
        print(f"   Found admin: {email}")
        
        # Insert into users table
        db.execute(text("""
            INSERT INTO users (id, email, full_name, role, created_at)
            VALUES (:id, :email, :name, 'ADMIN', NOW())
            ON CONFLICT (id) DO UPDATE SET
                email = EXCLUDED.email,
                full_name = EXCLUDED.full_name,
                role = 'ADMIN',
                updated_at = NOW()
        """), {"id": str(user_id), "email": email, "name": display_name})
        db.commit()
        print(f"✅ Admin synced to users table: {email}")
        return str(user_id)
    else:
        print("   No admin found in user_roles")
        return None


def assign_orphan_workspaces(db: Session, admin_id: str = None):
    """Assign workspaces with no owner to admin"""
    print("\n📋 Checking for orphan workspaces...")
    
    # Count orphan workspaces
    result = db.execute(text("""
        SELECT COUNT(*) FROM workspaces 
        WHERE user_id IS NULL OR owner_id IS NULL
    """)).fetchone()
    
    orphan_count = result[0] if result else 0
    print(f"   Found {orphan_count} orphan workspace(s)")
    
    if orphan_count > 0 and admin_id:
        db.execute(text("""
            UPDATE workspaces 
            SET user_id = :admin_id
            WHERE user_id IS NULL
        """), {"admin_id": admin_id})
        db.commit()
        print(f"✅ Assigned {orphan_count} workspace(s) to admin")
    
    return orphan_count


def insert_seed_data(db: Session):
    """Insert test seed data"""
    print("\n📋 Inserting seed data...")
    
    # Test users
    test_users = [
        {
            "id": "a1b2c3d4-e5f6-7890-abcd-111111111111",
            "email": "user1@example.com",
            "full_name": "Jean Dupont",
            "role": "USER"
        },
        {
            "id": "a1b2c3d4-e5f6-7890-abcd-222222222222",
            "email": "user2@example.com", 
            "full_name": "Marie Martin",
            "role": "USER"
        }
    ]
    
    for user in test_users:
        try:
            db.execute(text("""
                INSERT INTO users (id, email, full_name, role, created_at)
                VALUES (:id, :email, :full_name, :role, NOW())
                ON CONFLICT (id) DO UPDATE SET
                    full_name = EXCLUDED.full_name,
                    updated_at = NOW()
            """), user)
            print(f"   ✅ User: {user['email']}")
        except Exception as e:
            print(f"   ⚠️  User {user['email']}: {e}")
    
    db.commit()
    
    # Test workspaces
    test_workspaces = [
        {
            "id": "11111111-1111-1111-1111-111111111111",
            "name": "Analyse Fournisseurs Q1",
            "description": "Analyse des retards de livraison pour le premier trimestre",
            "data_type": "delays",
            "user_id": "a1b2c3d4-e5f6-7890-abcd-111111111111"
        },
        {
            "id": "22222222-2222-2222-2222-222222222222",
            "name": "Suivi Qualité 2026",
            "description": "Évaluation de la qualité et des jours de retard",
            "data_type": "late_days",
            "user_id": "a1b2c3d4-e5f6-7890-abcd-111111111111"
        },
        {
            "id": "33333333-3333-3333-3333-333333333333",
            "name": "Dashboard Production",
            "description": "Vue combinée des métriques de production",
            "data_type": "mixed",
            "user_id": "a1b2c3d4-e5f6-7890-abcd-222222222222"
        },
        {
            "id": "44444444-4444-4444-4444-444444444444",
            "name": "Audit Fournisseurs",
            "description": "Audit annuel des performances fournisseurs",
            "data_type": "delays",
            "user_id": "a1b2c3d4-e5f6-7890-abcd-222222222222"
        }
    ]
    
    for ws in test_workspaces:
        try:
            db.execute(text("""
                INSERT INTO workspaces (id, name, description, data_type, status, user_id, created_at)
                VALUES (:id, :name, :description, :data_type, 'active', :user_id, NOW())
                ON CONFLICT (id) DO NOTHING
            """), ws)
            print(f"   ✅ Workspace: {ws['name']}")
        except Exception as e:
            print(f"   ⚠️  Workspace {ws['name']}: {e}")
    
    db.commit()
    print("✅ Seed data inserted")


def show_summary(db: Session):
    """Display database summary"""
    print("\n" + "="*60)
    print("DATABASE SUMMARY")
    print("="*60)
    
    # Count users
    result = db.execute(text("SELECT COUNT(*) FROM users")).fetchone()
    user_count = result[0] if result else 0
    
    # Count admins
    result = db.execute(text("SELECT COUNT(*) FROM users WHERE role = 'ADMIN'")).fetchone()
    admin_count = result[0] if result else 0
    
    # Count workspaces
    result = db.execute(text("SELECT COUNT(*) FROM workspaces")).fetchone()
    ws_count = result[0] if result else 0
    
    # Count assigned workspaces
    result = db.execute(text("SELECT COUNT(*) FROM workspaces WHERE user_id IS NOT NULL")).fetchone()
    assigned_ws = result[0] if result else 0
    
    print(f"\n📊 Statistics:")
    print(f"   Total Users:       {user_count}")
    print(f"   Admin Users:       {admin_count}")
    print(f"   Regular Users:     {user_count - admin_count}")
    print(f"   Total Workspaces:  {ws_count}")
    print(f"   Assigned:          {assigned_ws}")
    print(f"   Orphan:            {ws_count - assigned_ws}")
    
    # Show users with their workspaces
    print(f"\n👥 Users and Workspaces:")
    results = db.execute(text("""
        SELECT u.email, u.full_name, u.role, COUNT(w.id) as ws_count
        FROM users u
        LEFT JOIN workspaces w ON w.user_id = u.id
        GROUP BY u.id, u.email, u.full_name, u.role
        ORDER BY u.role DESC, u.email
    """)).fetchall()
    
    for row in results:
        email, name, role, count = row
        role_badge = "👑" if role == "ADMIN" else "👤"
        print(f"   {role_badge} {email} ({name or 'No name'}) - {count} workspace(s)")
    
    print("\n" + "="*60)


def main():
    """Main migration function"""
    print("\n" + "="*60)
    print("🚀 DATABASE MIGRATION: Users & Workspaces")
    print("="*60)
    
    # Check for seed flag
    seed_data = "--seed" in sys.argv
    
    db = SessionLocal()
    
    try:
        # Step 1: Create users table
        if not create_users_table(db):
            print("❌ Failed to create users table")
            return False
        
        # Step 2: Update workspaces table
        if not update_workspaces_table(db):
            print("❌ Failed to update workspaces table")
            return False
        
        # Step 3: Sync existing admin
        admin_id = sync_existing_admin(db)
        
        # Step 4: Assign orphan workspaces
        assign_orphan_workspaces(db, admin_id)
        
        # Step 5: Insert seed data (optional)
        if seed_data:
            insert_seed_data(db)
        
        # Show summary
        show_summary(db)
        
        print("\n✅ Migration completed successfully!")
        return True
        
    except Exception as e:
        print(f"\n❌ Migration failed: {e}")
        db.rollback()
        return False
        
    finally:
        db.close()


if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)
