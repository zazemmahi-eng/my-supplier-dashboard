"""Test workspace endpoint"""
import sys
sys.path.insert(0, '.')
from fastapi.testclient import TestClient
from backend.main import app

client = TestClient(app)
response = client.get('/api/workspaces')
print(f'Status: {response.status_code}')
if response.status_code == 200:
    data = response.json()
    print(f'Workspaces: {len(data)}')
    for ws in data:
        print(f"  - {ws['name']} ({ws['data_type']})")
else:
    print(f'Error: {response.text}')
