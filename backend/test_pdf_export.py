"""Test PDF export endpoint"""
import sys
sys.path.insert(0, '..')

from database import SessionLocal
from sqlalchemy import text
import requests

# Get a workspace ID with dataset
db = SessionLocal()
result = db.execute(text('''
    SELECT w.id, w.name, COUNT(wd.id) as dataset_count
    FROM workspaces w
    LEFT JOIN workspace_datasets wd ON w.id = wd.workspace_id
    GROUP BY w.id, w.name
    HAVING COUNT(wd.id) > 0
    LIMIT 1
'''))
row = result.fetchone()
db.close()

if not row:
    print("No workspace with dataset found")
    exit(1)

workspace_id = str(row[0])
print(f"Testing workspace: {row[1]}")
print(f"ID: {workspace_id}")
print(f"dataset_count: {row[2]}")
print()

# Test the PDF endpoint
url = f"http://127.0.0.1:8000/api/reports/{workspace_id}/export/pdf"
print(f"Calling: {url}")

try:
    response = requests.get(url, timeout=30)
    print(f"Status Code: {response.status_code}")
    
    if response.status_code == 200:
        print(f"Content-Type: {response.headers.get('Content-Type')}")
        print(f"Content-Length: {len(response.content)} bytes")
        print("✅ PDF Export SUCCESS!")
    else:
        print(f"Error response: {response.text[:1000]}")
except requests.exceptions.ConnectionError:
    print("❌ Connection Error - is the server running?")
except Exception as e:
    print(f"❌ Error: {e}")
