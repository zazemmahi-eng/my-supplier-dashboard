"""Check workspaces table structure"""
import sys
sys.path.insert(0, '.')
from database import SessionLocal
from sqlalchemy import text

db = SessionLocal()

print('WORKSPACES TABLE COLUMNS:')
result = db.execute(text("""
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_name = 'workspaces'
    ORDER BY ordinal_position
"""))
for row in result.fetchall():
    print(f'  {row[0]}: {row[1]} (nullable: {row[2]})')

db.close()
