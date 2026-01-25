"""Add test workspaces for seed users"""
import sys
sys.path.insert(0, '.')
from database import SessionLocal, Base, engine
from sqlalchemy import text
import uuid

db = SessionLocal()

# Add workspaces for test users using raw SQL with proper enum casting
workspaces = [
    {
        'id': '11111111-1111-1111-1111-111111111111',
        'name': 'Analyse Fournisseurs Q1',
        'description': 'Analyse des retards de livraison pour le premier trimestre',
        'data_type': 'CASE_A',
        'user_id': 'a1b2c3d4-e5f6-7890-abcd-111111111111'  # user1
    },
    {
        'id': '22222222-2222-2222-2222-222222222222',
        'name': 'Suivi Qualite 2026',
        'description': 'Evaluation de la qualite et des jours de retard',
        'data_type': 'CASE_B',
        'user_id': 'a1b2c3d4-e5f6-7890-abcd-111111111111'  # user1
    },
    {
        'id': '33333333-3333-3333-3333-333333333333',
        'name': 'Dashboard Production',
        'description': 'Vue combinee des metriques de production',
        'data_type': 'CASE_C',
        'user_id': 'a1b2c3d4-e5f6-7890-abcd-222222222222'  # user2
    },
    {
        'id': '44444444-4444-4444-4444-444444444444',
        'name': 'Audit Fournisseurs',
        'description': 'Audit annuel des performances fournisseurs',
        'data_type': 'CASE_A',
        'user_id': 'a1b2c3d4-e5f6-7890-abcd-222222222222'  # user2
    }
]

print("Creating test workspaces...")

for ws in workspaces:
    try:
        # Check if exists
        result = db.execute(
            text("SELECT id FROM workspaces WHERE id = CAST(:id AS uuid)"),
            {'id': ws['id']}
        ).fetchone()
        
        if result:
            print(f"  [EXISTS] {ws['name']}")
        else:
            db.execute(text("""
                INSERT INTO workspaces (id, name, description, data_type, status, user_id, created_at)
                VALUES (
                    CAST(:id AS uuid), 
                    :name, 
                    :description, 
                    CAST(:data_type AS datatypecase), 
                    CAST('ACTIVE' AS workspacestatus), 
                    CAST(:user_id AS uuid), 
                    NOW()
                )
            """), ws)
            db.commit()
            print(f"  [CREATED] {ws['name']}")
    except Exception as e:
        db.rollback()
        print(f"  [ERROR] {ws['name']}: {e}")

# Show final state
print("\n" + "="*60)
print("WORKSPACES BY USER:")
print("="*60)

result = db.execute(text("""
    SELECT u.email, u.full_name, COUNT(w.id) as ws_count
    FROM users u
    LEFT JOIN workspaces w ON w.user_id = u.id
    GROUP BY u.id, u.email, u.full_name
    ORDER BY u.role DESC, u.email
"""))

for row in result.fetchall():
    print(f"  {row[0]} ({row[1] or 'No name'}) - {row[2]} workspace(s)")

db.close()
print("\nDone!")
