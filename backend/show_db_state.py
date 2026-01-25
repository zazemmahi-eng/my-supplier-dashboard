"""Show database state"""
import sys
sys.path.insert(0, '.')
from database import SessionLocal
from sqlalchemy import text

db = SessionLocal()

print('='*60)
print('FINAL DATABASE STATE')
print('='*60)

# Users
print('\nUSERS:')
result = db.execute(text('SELECT id, email, full_name, role FROM users ORDER BY role DESC, email'))
for row in result.fetchall():
    role_icon = 'ADMIN' if row[3] == 'ADMIN' else 'USER '
    name = row[2] if row[2] else 'No name'
    print(f'  [{role_icon}] {row[1]} - {name}')
    print(f'           ID: {row[0]}')

# Workspaces
print('\nWORKSPACES:')
result = db.execute(text('''
    SELECT w.id, w.name, w.data_type, u.email 
    FROM workspaces w 
    LEFT JOIN users u ON w.user_id = u.id
    ORDER BY u.email, w.name
'''))
for row in result.fetchall():
    owner = row[3] if row[3] else 'No owner'
    print(f'  {row[1]} ({row[2]})')
    print(f'       Owner: {owner}')
    print(f'       ID: {row[0]}')

# Stats
print('\nSTATISTICS:')
result = db.execute(text('SELECT COUNT(*) FROM users'))
print(f'  Total Users: {result.fetchone()[0]}')
result = db.execute(text("SELECT COUNT(*) FROM users WHERE role = 'ADMIN'"))
print(f'  Admin Users: {result.fetchone()[0]}')
result = db.execute(text('SELECT COUNT(*) FROM workspaces'))
print(f'  Total Workspaces: {result.fetchone()[0]}')
result = db.execute(text('SELECT COUNT(*) FROM workspaces WHERE user_id IS NOT NULL'))
print(f'  Assigned Workspaces: {result.fetchone()[0]}')

print('\n' + '='*60)
db.close()
