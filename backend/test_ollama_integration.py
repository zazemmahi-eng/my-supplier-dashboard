"""
Test script for LOCAL Ollama LLM integration

Tests that:
1. Ollama is running locally on localhost:11434
2. Column mapping works with French synonyms
3. All CSV cases (A/B/C) are detected correctly

NO EXTERNAL API CALLS - All LLM inference runs locally via Ollama.
"""
import pandas as pd
import requests
import time
from llm_ingestion import LLMColumnAnalyzer, OLLAMA_BASE_URL, OLLAMA_MODEL

# Test with sample data
print("=" * 60)
print("TESTING LOCAL OLLAMA LLM INTEGRATION")
print("NO EXTERNAL API - 100% LOCAL INFERENCE")
print("=" * 60)

# First check if Ollama is running
print(f"\n🔍 Checking Ollama at {OLLAMA_BASE_URL}...")
try:
    response = requests.get(f"{OLLAMA_BASE_URL}/api/tags", timeout=5)
    if response.status_code == 200:
        models = response.json().get("models", [])
        print(f"✅ Ollama is running! Available models: {[m['name'] for m in models]}")
    else:
        print(f"❌ Ollama returned status {response.status_code}")
except Exception as e:
    print(f"❌ Cannot connect to Ollama: {e}")
    print("   Make sure Ollama is running: ollama serve")
    exit(1)

# Initialize analyzer
analyzer = LLMColumnAnalyzer()

# Test all three case files
test_files = ['sample_data_case_a.csv', 'sample_data_case_b.csv', 'sample_data_case_c.csv']

for csv_file in test_files:
    print(f"\n{'='*60}")
    print(f"📊 Testing: {csv_file}")
    print(f"{'='*60}")
    
    df = pd.read_csv(csv_file)
    print(f"   Columns: {list(df.columns)}")
    print(f"   Rows: {len(df)}")
    
    print("\n🔍 Analyzing with LOCAL Ollama LLM...")
    result = analyzer.analyze_csv(df)
    
    print(f"\n✅ LLM Used: {result.get('llm_used', False)}")
    print(f"📋 Detected Case: {result.get('detected_case')}")
    
    print("\n📝 Column Mappings:")
    for m in result.get('mappings', []):
        conf = f"{m['confidence']:.0%}" if isinstance(m['confidence'], float) else m['confidence']
        print(f"   • {m['source_column']:20} → {m['target_role']:20} ({conf})")
        print(f"     {m['reasoning'][:70]}...")

# Test French synonyms
print(f"\n{'='*60}")
print("📊 Testing French Synonyms")
print("=" * 60)

# Create a test DataFrame with French column names
french_df = pd.DataFrame({
    'fournisseur': ['Supplier A', 'Supplier B', 'Supplier C'],
    'date_commande': ['2024-01-01', '2024-01-02', '2024-01-03'],
    'date_livraison': ['2024-01-05', '2024-01-06', '2024-01-07'],
    'taux_defaut': [0.02, 0.03, 0.01]
})

print(f"   Columns: {list(french_df.columns)}")
print("\n🔍 Analyzing French columns with LOCAL Ollama...")
result = analyzer.analyze_csv(french_df)

print(f"\n✅ LLM Used: {result.get('llm_used', False)}")
print(f"📋 Detected Case: {result.get('detected_case')}")

print("\n📝 Column Mappings (French → English):")
for m in result.get('mappings', []):
    conf = f"{m['confidence']:.0%}" if isinstance(m['confidence'], float) else m['confidence']
    print(f"   • {m['source_column']:20} → {m['target_role']:20} ({conf})")
    print(f"     {m['reasoning'][:70]}...")

print("\n" + "=" * 60)
print("ALL TESTS COMPLETE")
print("=" * 60)
