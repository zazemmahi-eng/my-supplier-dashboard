"""
Test script for extended LLM ingestion logic.

Tests two new data import cases:
1. Direct delay provided (no date computation needed)
2. Defects computed from counts (defective_items / total_items)

Run with: python test_extended_ingestion.py
"""

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import pandas as pd
from llm_ingestion import (
    analyze_csv_for_mapping,
    apply_mappings_and_normalize,
    process_csv_with_llm_mapping,
    ColumnRole
)


def test_direct_delay():
    """Test Case 1: Direct delay values provided"""
    print("\n" + "="*60)
    print("TEST 1: Direct Delay Values")
    print("="*60)
    
    # Load test CSV
    df = pd.read_csv("sample_data_direct_delay.csv")
    print(f"\nInput DataFrame:\n{df.head()}")
    print(f"\nColumns: {list(df.columns)}")
    
    # Analyze with LLM (or fallback)
    analysis = analyze_csv_for_mapping(df)
    
    print(f"\n📊 Analysis Results:")
    print(f"  - Detected case: {analysis['detected_case']}")
    print(f"  - LLM used: {analysis['llm_used']}")
    print(f"  - Issues: {analysis['issues']}")
    
    print(f"\n📋 Column Mappings:")
    for m in analysis['mappings']:
        print(f"  - {m['source_column']} -> {m['target_role']} (confidence: {m['confidence']:.2f})")
        print(f"    Reasoning: {m['reasoning']}")
        if m.get('transformation_needed'):
            print(f"    Transformation: {m['transformation_needed']}")
    
    # Apply mappings and normalize
    result = apply_mappings_and_normalize(df, analysis['mappings'], analysis['detected_case'])
    
    print(f"\n✅ Normalization Result:")
    print(f"  - Success: {result.success}")
    print(f"  - Detected case: {result.detected_case}")
    
    if result.dataframe is not None:
        print(f"\n📊 Output DataFrame:")
        print(result.dataframe.to_string())
        
        # Verify delay values
        print(f"\n🔍 Verification:")
        print(f"  - 'delay' column exists: {'delay' in result.dataframe.columns}")
        print(f"  - All delays >= 0: {(result.dataframe['delay'] >= 0).all()}")
        print(f"  - Delay dtype: {result.dataframe['delay'].dtype}")
    
    print(f"\n📝 Transformations Applied:")
    for t in result.transformations:
        print(f"  - {t.action}: {t.details}")
    
    if result.warnings:
        print(f"\n⚠️ Warnings:")
        for w in result.warnings:
            print(f"  - [{w.severity}] {w.message}")
    
    return result.success


def test_defects_from_counts():
    """Test Case 2: Defects computed from item counts"""
    print("\n" + "="*60)
    print("TEST 2: Defects from Counts (defective_items / total_items)")
    print("="*60)
    
    # Load test CSV
    df = pd.read_csv("sample_data_defect_counts.csv")
    print(f"\nInput DataFrame:\n{df.head()}")
    print(f"\nColumns: {list(df.columns)}")
    
    # Analyze with LLM (or fallback)
    analysis = analyze_csv_for_mapping(df)
    
    print(f"\n📊 Analysis Results:")
    print(f"  - Detected case: {analysis['detected_case']}")
    print(f"  - LLM used: {analysis['llm_used']}")
    print(f"  - Issues: {analysis['issues']}")
    
    print(f"\n📋 Column Mappings:")
    for m in analysis['mappings']:
        print(f"  - {m['source_column']} -> {m['target_role']} (confidence: {m['confidence']:.2f})")
        print(f"    Reasoning: {m['reasoning']}")
        if m.get('transformation_needed'):
            print(f"    Transformation: {m['transformation_needed']}")
    
    # Apply mappings and normalize
    result = apply_mappings_and_normalize(df, analysis['mappings'], analysis['detected_case'])
    
    print(f"\n✅ Normalization Result:")
    print(f"  - Success: {result.success}")
    print(f"  - Detected case: {result.detected_case}")
    
    if result.dataframe is not None:
        print(f"\n📊 Output DataFrame:")
        print(result.dataframe.to_string())
        
        # Verify defect calculations
        print(f"\n🔍 Verification:")
        print(f"  - 'defects' column exists: {'defects' in result.dataframe.columns}")
        print(f"  - All defects in [0,1]: {((result.dataframe['defects'] >= 0) & (result.dataframe['defects'] <= 1)).all()}")
        
        # Manual verification of first row: 5/100 = 0.05
        expected_first = 5 / 100
        actual_first = result.dataframe['defects'].iloc[0]
        print(f"  - First row check: expected {expected_first}, got {actual_first}, match: {abs(expected_first - actual_first) < 0.0001}")
    
    print(f"\n📝 Transformations Applied:")
    for t in result.transformations:
        print(f"  - {t.action}: {t.details}")
    
    if result.warnings:
        print(f"\n⚠️ Warnings:")
        for w in result.warnings:
            print(f"  - [{w.severity}] {w.message}")
    
    return result.success


def test_defects_from_non_defective():
    """Test Case 2b: Defects computed from defective + non_defective counts"""
    print("\n" + "="*60)
    print("TEST 3: Defects from Counts (defective / (defective + good))")
    print("="*60)
    
    # Load test CSV
    df = pd.read_csv("sample_data_non_defective.csv")
    print(f"\nInput DataFrame:\n{df.head()}")
    print(f"\nColumns: {list(df.columns)}")
    
    # Analyze with LLM (or fallback)
    analysis = analyze_csv_for_mapping(df)
    
    print(f"\n📊 Analysis Results:")
    print(f"  - Detected case: {analysis['detected_case']}")
    print(f"  - LLM used: {analysis['llm_used']}")
    print(f"  - Issues: {analysis['issues']}")
    
    print(f"\n📋 Column Mappings:")
    for m in analysis['mappings']:
        print(f"  - {m['source_column']} -> {m['target_role']} (confidence: {m['confidence']:.2f})")
        print(f"    Reasoning: {m['reasoning']}")
        if m.get('transformation_needed'):
            print(f"    Transformation: {m['transformation_needed']}")
    
    # Apply mappings and normalize
    result = apply_mappings_and_normalize(df, analysis['mappings'], analysis['detected_case'])
    
    print(f"\n✅ Normalization Result:")
    print(f"  - Success: {result.success}")
    print(f"  - Detected case: {result.detected_case}")
    
    if result.dataframe is not None:
        print(f"\n📊 Output DataFrame:")
        print(result.dataframe.to_string())
        
        # Verify defect calculations
        print(f"\n🔍 Verification:")
        print(f"  - 'defects' column exists: {'defects' in result.dataframe.columns}")
        print(f"  - All defects in [0,1]: {((result.dataframe['defects'] >= 0) & (result.dataframe['defects'] <= 1)).all()}")
        
        # Manual verification of first row: 5/(5+95) = 0.05
        expected_first = 5 / (5 + 95)
        actual_first = result.dataframe['defects'].iloc[0]
        print(f"  - First row check: expected {expected_first}, got {actual_first}, match: {abs(expected_first - actual_first) < 0.0001}")
    
    print(f"\n📝 Transformations Applied:")
    for t in result.transformations:
        print(f"  - {t.action}: {t.details}")
    
    if result.warnings:
        print(f"\n⚠️ Warnings:")
        for w in result.warnings:
            print(f"  - [{w.severity}] {w.message}")
    
    return result.success


def main():
    print("="*60)
    print("EXTENDED LLM INGESTION TEST SUITE")
    print("="*60)
    print("\nThis tests the two new data import cases:")
    print("1. Direct delay values (no date computation)")
    print("2. Defects computed from counts")
    
    results = []
    
    # Test 1: Direct delay
    try:
        results.append(("Direct Delay", test_direct_delay()))
    except Exception as e:
        print(f"\n❌ Test 1 FAILED with error: {e}")
        import traceback
        traceback.print_exc()
        results.append(("Direct Delay", False))
    
    # Test 2: Defects from counts
    try:
        results.append(("Defects from Counts", test_defects_from_counts()))
    except Exception as e:
        print(f"\n❌ Test 2 FAILED with error: {e}")
        import traceback
        traceback.print_exc()
        results.append(("Defects from Counts", False))
    
    # Test 3: Defects from non-defective counts
    try:
        results.append(("Defects from Non-Defective", test_defects_from_non_defective()))
    except Exception as e:
        print(f"\n❌ Test 3 FAILED with error: {e}")
        import traceback
        traceback.print_exc()
        results.append(("Defects from Non-Defective", False))
    
    # Summary
    print("\n" + "="*60)
    print("TEST SUMMARY")
    print("="*60)
    for name, passed in results:
        status = "✅ PASSED" if passed else "❌ FAILED"
        print(f"  {name}: {status}")
    
    all_passed = all(r[1] for r in results)
    print(f"\nOverall: {'✅ ALL TESTS PASSED' if all_passed else '❌ SOME TESTS FAILED'}")
    
    return 0 if all_passed else 1


if __name__ == "__main__":
    sys.exit(main())
