"""
Database migration script for Custom KPI formula support.

This migration adds two new columns to the custom_kpis table:
- formula: TEXT - stores the custom formula expression
- formula_variables: JSON - stores the list of variables used in the formula

Run this script to update the database schema.
"""

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from sqlalchemy import text
from database import engine

def migrate():
    """Add formula columns to custom_kpis table."""
    
    print("=" * 60)
    print("Custom KPI Formula Migration")
    print("=" * 60)
    
    # Check if columns already exist (PostgreSQL)
    with engine.connect() as conn:
        # PostgreSQL: check column information from information_schema
        result = conn.execute(text("""
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'custom_kpis'
        """))
        columns = [row[0] for row in result.fetchall()]
        
        print(f"Existing columns: {columns}")
        
        # Add formula column if not exists
        if 'formula' not in columns:
            print("\nAdding 'formula' column...")
            conn.execute(text("ALTER TABLE custom_kpis ADD COLUMN formula TEXT"))
            conn.commit()
            print("  ✓ Added 'formula' column")
        else:
            print("\n✓ 'formula' column already exists")
        
        # Add formula_variables column if not exists
        if 'formula_variables' not in columns:
            print("\nAdding 'formula_variables' column...")
            conn.execute(text("ALTER TABLE custom_kpis ADD COLUMN formula_variables JSONB DEFAULT '[]'"))
            conn.commit()
            print("  ✓ Added 'formula_variables' column")
        else:
            print("\n✓ 'formula_variables' column already exists")
        
        # Make target_field nullable if needed
        # Check current constraint
        result = conn.execute(text("""
            SELECT is_nullable 
            FROM information_schema.columns 
            WHERE table_name = 'custom_kpis' AND column_name = 'target_field'
        """))
        row = result.fetchone()
        if row and row[0] == 'NO':
            print("\nMaking 'target_field' nullable...")
            conn.execute(text("ALTER TABLE custom_kpis ALTER COLUMN target_field DROP NOT NULL"))
            conn.commit()
            print("  ✓ Made 'target_field' nullable")
        else:
            print("\n✓ 'target_field' is already nullable (or doesn't exist)")
        
    print("\n" + "=" * 60)
    print("Migration completed successfully!")
    print("=" * 60)

if __name__ == "__main__":
    migrate()
