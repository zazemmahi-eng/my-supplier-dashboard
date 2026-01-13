"""Test the role check endpoint"""
import urllib.request
import json

url = "http://127.0.0.1:8000/api/admin/check-user-role?user_id=6e3943c2-c5b5-40a2-8439-4d72e792e64c"

try:
    with urllib.request.urlopen(url) as response:
        data = json.loads(response.read().decode())
        print("Response from API:")
        print(json.dumps(data, indent=2))
except Exception as e:
    print(f"Error: {e}")
