# llm_ingestion.py
"""
LLM-Based CSV Ingestion and Normalization Module

This module provides intelligent CSV column mapping using LLM suggestions
and robust data transformation/validation using Python (Pandas).

Key Features:
- Analyzes arbitrary CSV schemas and suggests column mappings
- Handles multiple date formats automatically
- Normalizes defects to 0-1 range
- Computes delay from dates if missing
- Validates all data constraints
- Returns clean DataFrame with transformation history

The LLM ONLY suggests mappings - all actual data transformations
are performed by deterministic Python code.
"""

import re
import json
import pandas as pd
import numpy as np
from datetime import datetime
from typing import Dict, List, Any, Optional, Tuple
from dataclasses import dataclass, field, asdict
from enum import Enum


# ============================================
# DATA STRUCTURES
# ============================================

class ColumnRole(str, Enum):
    """Standard column roles for supplier analysis"""
    SUPPLIER = "supplier"
    DATE_PROMISED = "date_promised"
    DATE_DELIVERED = "date_delivered"
    ORDER_DATE = "order_date"
    DELAY = "delay"
    DEFECTS = "defects"
    QUALITY_SCORE = "quality_score"
    IGNORE = "ignore"


@dataclass
class ColumnMapping:
    """Represents a suggested mapping for a CSV column"""
    source_column: str           # Original column name in CSV
    target_role: ColumnRole      # Suggested role
    confidence: float            # Confidence score (0-1)
    reasoning: str               # Why this mapping was suggested
    sample_values: List[str]     # Sample values from the column
    detected_type: str           # Detected data type
    transformation_needed: Optional[str] = None  # e.g., "convert_percentage", "parse_date"


@dataclass
class TransformationLog:
    """Records a transformation applied to the data"""
    column: str
    action: str
    details: str
    rows_affected: int
    timestamp: str = field(default_factory=lambda: datetime.now().isoformat())


@dataclass
class ValidationWarning:
    """Represents a data quality warning"""
    severity: str  # "error", "warning", "info"
    message: str
    column: Optional[str] = None
    row_count: int = 0
    sample_values: List[str] = field(default_factory=list)


@dataclass
class IngestionResult:
    """Complete result of the ingestion process"""
    success: bool
    dataframe: Optional[pd.DataFrame]
    column_mappings: List[ColumnMapping]
    transformations: List[TransformationLog]
    warnings: List[ValidationWarning]
    detected_case: str  # "delay_only", "defects_only", "mixed"
    summary: Dict[str, Any]
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for JSON serialization"""
        return {
            "success": self.success,
            "column_mappings": [asdict(m) for m in self.column_mappings],
            "transformations": [asdict(t) for t in self.transformations],
            "warnings": [asdict(w) for w in self.warnings],
            "detected_case": self.detected_case,
            "summary": self.summary
        }


# ============================================
# LLM COLUMN MAPPING ANALYZER
# ============================================

class LLMColumnAnalyzer:
    """
    Analyzes CSV columns and suggests mappings using pattern matching
    and heuristics. In production, this would call an actual LLM API.
    
    The LLM only SUGGESTS mappings - it does NOT transform data.
    All transformations are done by Python code in DataNormalizer.
    """
    
    # Common patterns for column name recognition
    SUPPLIER_PATTERNS = [
        r'supplier', r'vendor', r'fournisseur', r'provider', r'source',
        r'company', r'partner', r'manufacturer', r'distributor'
    ]
    
    DATE_PROMISED_PATTERNS = [
        r'date_promised', r'promised', r'expected', r'due', r'target',
        r'scheduled', r'planned', r'delivery_date', r'date_prevue',
        r'date_attendue', r'echeance'
    ]
    
    DATE_DELIVERED_PATTERNS = [
        r'date_delivered', r'delivered', r'actual', r'received',
        r'arrival', r'completed', r'date_livraison', r'date_reelle',
        r'date_reception'
    ]
    
    ORDER_DATE_PATTERNS = [
        r'order_date', r'order', r'purchase', r'transaction',
        r'date_commande', r'achat'
    ]
    
    DELAY_PATTERNS = [
        r'delay', r'retard', r'late', r'overdue', r'days_late',
        r'jours_retard', r'ecart'
    ]
    
    DEFECTS_PATTERNS = [
        r'defect', r'defaut', r'fault', r'error', r'issue',
        r'problem', r'reject', r'failure', r'taux_defaut'
    ]
    
    QUALITY_PATTERNS = [
        r'quality', r'score', r'rating', r'qualite', r'note',
        r'evaluation', r'grade', r'performance'
    ]
    
    # Date format patterns for detection
    DATE_FORMATS = [
        r'\d{4}-\d{2}-\d{2}',           # 2024-01-15
        r'\d{2}/\d{2}/\d{4}',           # 15/01/2024 or 01/15/2024
        r'\d{2}-\d{2}-\d{4}',           # 15-01-2024
        r'\d{4}/\d{2}/\d{2}',           # 2024/01/15
        r'\d{1,2}\s+\w+\s+\d{4}',       # 15 January 2024
    ]
    
    def __init__(self):
        """Initialize the analyzer"""
        pass
    
    def analyze_csv(self, df: pd.DataFrame) -> Dict[str, Any]:
        """
        Analyze a DataFrame and return column mapping suggestions.
        
        This simulates what an LLM would do: analyze column names and sample data
        to suggest appropriate mappings. The LLM provides SUGGESTIONS ONLY.
        
        Args:
            df: Input DataFrame to analyze
            
        Returns:
            Dictionary with mapping suggestions and analysis metadata
        """
        mappings = []
        column_analysis = []
        
        for col in df.columns:
            # Get sample values (non-null, unique)
            sample_values = df[col].dropna().head(10).astype(str).tolist()
            detected_type = self._detect_column_type(df[col])
            
            # Analyze column name and content
            mapping = self._suggest_mapping(col, sample_values, detected_type)
            mappings.append(mapping)
            
            column_analysis.append({
                "column": col,
                "detected_type": detected_type,
                "sample_values": sample_values[:5],
                "null_count": int(df[col].isna().sum()),
                "unique_count": int(df[col].nunique())
            })
        
        # Determine which case this data supports
        detected_case = self._detect_case(mappings)
        
        # Check for potential issues
        issues = self._check_mapping_issues(mappings, detected_case)
        
        return {
            "mappings": [asdict(m) for m in mappings],
            "column_analysis": column_analysis,
            "detected_case": detected_case,
            "issues": issues,
            "recommendation": self._get_recommendation(detected_case, issues)
        }
    
    def _detect_column_type(self, series: pd.Series) -> str:
        """Detect the data type of a column"""
        # Try numeric
        numeric_series = pd.to_numeric(series, errors='coerce')
        if numeric_series.notna().sum() / len(series) > 0.8:
            if (numeric_series.dropna() % 1 == 0).all():
                return "integer"
            return "float"
        
        # Try date
        for fmt in ['%Y-%m-%d', '%d/%m/%Y', '%m/%d/%Y', '%Y/%m/%d']:
            try:
                pd.to_datetime(series.dropna().head(20), format=fmt, errors='raise')
                return "date"
            except:
                continue
        
        # Try more flexible date parsing
        try:
            pd.to_datetime(series.dropna().head(20), errors='raise')
            return "date"
        except:
            pass
        
        return "string"
    
    def _suggest_mapping(self, column_name: str, sample_values: List[str], 
                         detected_type: str) -> ColumnMapping:
        """
        Suggest a mapping for a single column.
        Uses pattern matching on column name and content analysis.
        """
        col_lower = column_name.lower().strip()
        
        # Check each pattern category
        patterns_to_check = [
            (self.SUPPLIER_PATTERNS, ColumnRole.SUPPLIER, "string"),
            (self.DATE_PROMISED_PATTERNS, ColumnRole.DATE_PROMISED, "date"),
            (self.DATE_DELIVERED_PATTERNS, ColumnRole.DATE_DELIVERED, "date"),
            (self.ORDER_DATE_PATTERNS, ColumnRole.ORDER_DATE, "date"),
            (self.DELAY_PATTERNS, ColumnRole.DELAY, ["integer", "float"]),
            (self.DEFECTS_PATTERNS, ColumnRole.DEFECTS, ["integer", "float"]),
            (self.QUALITY_PATTERNS, ColumnRole.QUALITY_SCORE, ["integer", "float"]),
        ]
        
        best_match = None
        best_confidence = 0.0
        best_reasoning = ""
        transformation = None
        
        for patterns, role, expected_types in patterns_to_check:
            if isinstance(expected_types, str):
                expected_types = [expected_types]
            
            # Check column name against patterns
            for pattern in patterns:
                if re.search(pattern, col_lower):
                    # Calculate confidence based on type match
                    type_match = detected_type in expected_types
                    confidence = 0.9 if type_match else 0.6
                    
                    if confidence > best_confidence:
                        best_confidence = confidence
                        best_match = role
                        best_reasoning = f"Column name matches pattern '{pattern}'"
                        
                        # Determine if transformation is needed
                        if role == ColumnRole.DEFECTS:
                            if self._looks_like_percentage(sample_values):
                                transformation = "convert_percentage_to_decimal"
                        elif role == ColumnRole.QUALITY_SCORE:
                            transformation = "convert_quality_to_defects"
                        elif role in [ColumnRole.DATE_PROMISED, ColumnRole.DATE_DELIVERED, ColumnRole.ORDER_DATE]:
                            if detected_type != "date":
                                transformation = "parse_date"
                    break
        
        # If no pattern matched, try to infer from content
        if best_match is None:
            best_match, best_confidence, best_reasoning, transformation = \
                self._infer_from_content(sample_values, detected_type)
        
        return ColumnMapping(
            source_column=column_name,
            target_role=best_match or ColumnRole.IGNORE,
            confidence=best_confidence,
            reasoning=best_reasoning,
            sample_values=sample_values[:5],
            detected_type=detected_type,
            transformation_needed=transformation
        )
    
    def _looks_like_percentage(self, values: List[str]) -> bool:
        """Check if values look like percentages (0-100 range)"""
        try:
            numeric = [float(v.replace('%', '').strip()) for v in values if v.strip()]
            return all(0 <= n <= 100 for n in numeric) and max(numeric) > 1
        except:
            return False
    
    def _infer_from_content(self, sample_values: List[str], detected_type: str) -> Tuple:
        """Infer column role from content when name doesn't match patterns"""
        
        # If it's a string with few unique values, might be supplier
        if detected_type == "string":
            return (ColumnRole.SUPPLIER, 0.4, "String column - possibly supplier names", None)
        
        # If it's a date, we need more context
        if detected_type == "date":
            return (ColumnRole.IGNORE, 0.3, "Date column - needs manual mapping", "parse_date")
        
        # If numeric, check the range
        try:
            numeric_values = [float(v) for v in sample_values if v.strip()]
            if all(0 <= n <= 1 for n in numeric_values):
                return (ColumnRole.DEFECTS, 0.5, "Values in 0-1 range - possibly defect rate", None)
            elif all(0 <= n <= 100 for n in numeric_values):
                return (ColumnRole.QUALITY_SCORE, 0.4, "Values in 0-100 range - possibly quality score", 
                        "convert_quality_to_defects")
            elif all(n >= 0 for n in numeric_values):
                return (ColumnRole.DELAY, 0.3, "Non-negative values - possibly delay days", None)
        except:
            pass
        
        return (ColumnRole.IGNORE, 0.2, "Could not determine column role", None)
    
    def _detect_case(self, mappings: List[ColumnMapping]) -> str:
        """Determine which data case (A, B, C) this data supports"""
        roles = {m.target_role for m in mappings if m.confidence > 0.5}
        
        has_dates = (ColumnRole.DATE_PROMISED in roles and ColumnRole.DATE_DELIVERED in roles) or \
                    ColumnRole.DELAY in roles
        has_defects = ColumnRole.DEFECTS in roles or ColumnRole.QUALITY_SCORE in roles
        
        if has_dates and has_defects:
            return "mixed"
        elif has_dates:
            return "delay_only"
        elif has_defects:
            return "defects_only"
        else:
            return "unknown"
    
    def _check_mapping_issues(self, mappings: List[ColumnMapping], detected_case: str) -> List[Dict]:
        """Check for potential issues with the mappings"""
        issues = []
        roles_found = {m.target_role: m for m in mappings if m.confidence > 0.5}
        
        # Must have supplier
        if ColumnRole.SUPPLIER not in roles_found:
            issues.append({
                "severity": "error",
                "message": "No supplier column identified. Please map a column to 'supplier'."
            })
        
        # Case-specific checks
        if detected_case == "delay_only":
            if ColumnRole.DATE_PROMISED not in roles_found and ColumnRole.DATE_DELIVERED not in roles_found:
                if ColumnRole.DELAY not in roles_found:
                    issues.append({
                        "severity": "error",
                        "message": "Delay case requires either date columns or a delay column."
                    })
        
        elif detected_case == "defects_only":
            if ColumnRole.DEFECTS not in roles_found and ColumnRole.QUALITY_SCORE not in roles_found:
                issues.append({
                    "severity": "error",
                    "message": "Defects case requires either defects or quality_score column."
                })
        
        # Check for low confidence mappings
        low_confidence = [m for m in mappings if 0.3 < m.confidence < 0.6]
        if low_confidence:
            issues.append({
                "severity": "warning",
                "message": f"{len(low_confidence)} column(s) have uncertain mappings. Please review."
            })
        
        return issues
    
    def _get_recommendation(self, detected_case: str, issues: List[Dict]) -> str:
        """Generate a recommendation message"""
        if any(i["severity"] == "error" for i in issues):
            return "Please resolve the mapping errors before proceeding."
        
        case_names = {
            "delay_only": "Case A (Delay Only)",
            "defects_only": "Case B (Defects Only)",
            "mixed": "Case C (Mixed - Delay + Defects)"
        }
        
        case_name = case_names.get(detected_case, "Unknown")
        
        if issues:
            return f"Data appears to match {case_name}. Please review warnings before proceeding."
        
        return f"Data matches {case_name}. Ready to process."


# ============================================
# DATA NORMALIZER (Python Transformations)
# ============================================

class DataNormalizer:
    """
    Performs all data transformations using Python/Pandas.
    The LLM only suggests mappings - this class executes transformations.
    
    Responsibilities:
    - Parse and normalize dates
    - Compute delay from date differences
    - Normalize defects to 0-1 range
    - Convert quality scores to defect rates
    - Validate all data constraints
    - Log all transformations
    """
    
    # Supported date formats to try
    DATE_FORMATS = [
        '%Y-%m-%d',      # 2024-01-15
        '%d/%m/%Y',      # 15/01/2024
        '%m/%d/%Y',      # 01/15/2024
        '%Y/%m/%d',      # 2024/01/15
        '%d-%m-%Y',      # 15-01-2024
        '%d.%m.%Y',      # 15.01.2024
        '%Y%m%d',        # 20240115
        '%B %d, %Y',     # January 15, 2024
        '%d %B %Y',      # 15 January 2024
    ]
    
    def __init__(self):
        self.transformations: List[TransformationLog] = []
        self.warnings: List[ValidationWarning] = []
    
    def normalize(self, df: pd.DataFrame, mappings: List[Dict[str, Any]], 
                  target_case: str) -> IngestionResult:
        """
        Apply all transformations based on the approved mappings.
        
        Args:
            df: Input DataFrame
            mappings: List of approved column mappings
            target_case: Target case type ("delay_only", "defects_only", "mixed")
            
        Returns:
            IngestionResult with normalized DataFrame and metadata
        """
        self.transformations = []
        self.warnings = []
        
        result_df = pd.DataFrame()
        
        try:
            # Step 1: Apply column mappings
            result_df = self._apply_mappings(df, mappings)
            
            # Step 2: Parse and normalize dates
            result_df = self._normalize_dates(result_df)
            
            # Step 3: Compute delay if needed
            result_df = self._compute_delay(result_df, target_case)
            
            # Step 4: Normalize defects
            result_df = self._normalize_defects(result_df, mappings, target_case)
            
            # Step 5: Clean supplier names
            result_df = self._clean_suppliers(result_df)
            
            # Step 6: Validate final data
            is_valid = self._validate_data(result_df, target_case)
            
            # Step 7: Sort by supplier and date
            result_df = self._sort_data(result_df)
            
            # Generate summary
            summary = self._generate_summary(result_df, target_case)
            
            return IngestionResult(
                success=is_valid,
                dataframe=result_df,
                column_mappings=[ColumnMapping(**m) for m in mappings],
                transformations=self.transformations,
                warnings=self.warnings,
                detected_case=target_case,
                summary=summary
            )
            
        except Exception as e:
            self.warnings.append(ValidationWarning(
                severity="error",
                message=f"Normalization failed: {str(e)}"
            ))
            return IngestionResult(
                success=False,
                dataframe=None,
                column_mappings=[ColumnMapping(**m) for m in mappings],
                transformations=self.transformations,
                warnings=self.warnings,
                detected_case=target_case,
                summary={"error": str(e)}
            )
    
    def _apply_mappings(self, df: pd.DataFrame, mappings: List[Dict]) -> pd.DataFrame:
        """Apply column mappings to create standardized DataFrame"""
        result = pd.DataFrame()
        
        for mapping in mappings:
            source_col = mapping["source_column"]
            target_role = mapping["target_role"]
            
            if target_role == "ignore" or target_role == ColumnRole.IGNORE:
                continue
            
            if source_col not in df.columns:
                self.warnings.append(ValidationWarning(
                    severity="warning",
                    message=f"Source column '{source_col}' not found in data",
                    column=source_col
                ))
                continue
            
            # Map to standard column name
            target_col = target_role if isinstance(target_role, str) else target_role.value
            result[target_col] = df[source_col].copy()
            
            self.transformations.append(TransformationLog(
                column=target_col,
                action="column_mapping",
                details=f"Mapped '{source_col}' to '{target_col}'",
                rows_affected=len(df)
            ))
        
        return result
    
    def _normalize_dates(self, df: pd.DataFrame) -> pd.DataFrame:
        """Parse and normalize date columns"""
        date_columns = ['date_promised', 'date_delivered', 'order_date']
        
        for col in date_columns:
            if col not in df.columns:
                continue
            
            original_count = df[col].notna().sum()
            parsed_dates = None
            
            # Try each date format
            for fmt in self.DATE_FORMATS:
                try:
                    parsed_dates = pd.to_datetime(df[col], format=fmt, errors='coerce')
                    valid_count = parsed_dates.notna().sum()
                    if valid_count >= original_count * 0.8:  # 80% success rate
                        break
                except:
                    continue
            
            # If no format worked, try pandas automatic parsing
            if parsed_dates is None or parsed_dates.notna().sum() < original_count * 0.5:
                parsed_dates = pd.to_datetime(df[col], errors='coerce', infer_datetime_format=True)
            
            # Remove timezone info if present
            if parsed_dates is not None:
                parsed_dates = parsed_dates.dt.tz_localize(None)
            
            df[col] = parsed_dates
            
            # Log invalid dates
            invalid_count = df[col].isna().sum()
            if invalid_count > 0:
                self.warnings.append(ValidationWarning(
                    severity="warning",
                    message=f"{invalid_count} invalid dates in '{col}'",
                    column=col,
                    row_count=invalid_count
                ))
            
            self.transformations.append(TransformationLog(
                column=col,
                action="date_parsing",
                details=f"Parsed dates, {original_count - invalid_count}/{original_count} valid",
                rows_affected=original_count - invalid_count
            ))
        
        return df
    
    def _compute_delay(self, df: pd.DataFrame, target_case: str) -> pd.DataFrame:
        """Compute delay from dates if not present"""
        
        # Skip if delay already exists and is valid
        if 'delay' in df.columns:
            df['delay'] = pd.to_numeric(df['delay'], errors='coerce').fillna(0)
            df['delay'] = df['delay'].apply(lambda x: max(0, x))
            self.transformations.append(TransformationLog(
                column='delay',
                action="delay_validation",
                details="Validated existing delay column, set negatives to 0",
                rows_affected=len(df)
            ))
            return df
        
        # Compute from dates if available
        if 'date_promised' in df.columns and 'date_delivered' in df.columns:
            df['delay'] = (df['date_delivered'] - df['date_promised']).dt.days
            df['delay'] = df['delay'].apply(lambda x: max(0, x) if pd.notna(x) else 0)
            
            self.transformations.append(TransformationLog(
                column='delay',
                action="delay_computation",
                details="Computed delay as (date_delivered - date_promised) in days",
                rows_affected=len(df)
            ))
        
        # For defects_only case, set delay to 0
        elif target_case == "defects_only":
            df['delay'] = 0
            self.transformations.append(TransformationLog(
                column='delay',
                action="delay_default",
                details="Set delay to 0 for defects-only case",
                rows_affected=len(df)
            ))
        
        # Create dummy dates if needed for compatibility
        if 'date_promised' not in df.columns:
            if 'order_date' in df.columns:
                df['date_promised'] = df['order_date']
                df['date_delivered'] = df['order_date']
            else:
                # Create dummy dates
                df['date_promised'] = pd.Timestamp.now()
                df['date_delivered'] = pd.Timestamp.now()
            
            self.transformations.append(TransformationLog(
                column='date_promised',
                action="date_default",
                details="Created default date columns for compatibility",
                rows_affected=len(df)
            ))
        
        return df
    
    def _normalize_defects(self, df: pd.DataFrame, mappings: List[Dict], 
                           target_case: str) -> pd.DataFrame:
        """Normalize defects to 0-1 range"""
        
        # Check if we have quality_score that needs conversion
        has_quality = 'quality_score' in df.columns
        has_defects = 'defects' in df.columns
        
        if has_quality and not has_defects:
            # Convert quality score (0-100) to defects (0-1)
            quality = pd.to_numeric(df['quality_score'], errors='coerce').fillna(100)
            
            # Determine if it's 0-100 or 0-1 scale
            if quality.max() > 1:
                # 0-100 scale: defects = (100 - quality) / 100
                df['defects'] = (100 - quality.clip(0, 100)) / 100
                details = "Converted quality_score (0-100) to defects (0-1)"
            else:
                # Already 0-1 scale: defects = 1 - quality
                df['defects'] = (1 - quality.clip(0, 1))
                details = "Converted quality_score (0-1) to defects"
            
            self.transformations.append(TransformationLog(
                column='defects',
                action="quality_to_defects",
                details=details,
                rows_affected=len(df)
            ))
        
        elif has_defects:
            # Normalize existing defects
            defects = pd.to_numeric(df['defects'], errors='coerce').fillna(0)
            
            # Check if values are percentages (0-100) or rates (0-1)
            if defects.max() > 1:
                # Percentage: convert to rate
                df['defects'] = defects / 100
                details = "Converted defects from percentage to rate (0-1)"
            else:
                df['defects'] = defects.clip(0, 1)
                details = "Validated defects in 0-1 range"
            
            self.transformations.append(TransformationLog(
                column='defects',
                action="defects_normalization",
                details=details,
                rows_affected=len(df)
            ))
        
        # For delay_only case, set defects to 0
        elif target_case == "delay_only":
            df['defects'] = 0.0
            self.transformations.append(TransformationLog(
                column='defects',
                action="defects_default",
                details="Set defects to 0 for delay-only case",
                rows_affected=len(df)
            ))
        
        # Ensure defects column exists
        if 'defects' not in df.columns:
            df['defects'] = 0.0
        
        # Final validation: ensure defects in [0, 1]
        invalid_defects = ((df['defects'] < 0) | (df['defects'] > 1)).sum()
        if invalid_defects > 0:
            df['defects'] = df['defects'].clip(0, 1)
            self.warnings.append(ValidationWarning(
                severity="warning",
                message=f"{invalid_defects} defect values were outside [0,1] and clipped",
                column='defects',
                row_count=invalid_defects
            ))
        
        return df
    
    def _clean_suppliers(self, df: pd.DataFrame) -> pd.DataFrame:
        """Clean and validate supplier names"""
        if 'supplier' not in df.columns:
            self.warnings.append(ValidationWarning(
                severity="error",
                message="No supplier column found",
                column='supplier'
            ))
            return df
        
        # Clean supplier names
        original_unique = df['supplier'].nunique()
        df['supplier'] = df['supplier'].astype(str).str.strip()
        
        # Remove empty suppliers
        empty_count = (df['supplier'] == '').sum() + df['supplier'].isna().sum()
        if empty_count > 0:
            self.warnings.append(ValidationWarning(
                severity="warning",
                message=f"{empty_count} rows with empty supplier names",
                column='supplier',
                row_count=empty_count
            ))
        
        # Log unique suppliers
        self.transformations.append(TransformationLog(
            column='supplier',
            action="supplier_cleaning",
            details=f"Cleaned supplier names, {df['supplier'].nunique()} unique suppliers",
            rows_affected=len(df)
        ))
        
        return df
    
    def _validate_data(self, df: pd.DataFrame, target_case: str) -> bool:
        """Validate the final data meets all constraints"""
        is_valid = True
        
        # Must have supplier
        if 'supplier' not in df.columns:
            self.warnings.append(ValidationWarning(
                severity="error",
                message="Missing required 'supplier' column"
            ))
            is_valid = False
        
        # Must have delay >= 0
        if 'delay' in df.columns:
            invalid_delay = (df['delay'] < 0).sum()
            if invalid_delay > 0:
                self.warnings.append(ValidationWarning(
                    severity="error",
                    message=f"{invalid_delay} rows with negative delay",
                    column='delay',
                    row_count=invalid_delay
                ))
                is_valid = False
        
        # Must have defects in [0, 1]
        if 'defects' in df.columns:
            invalid_defects = ((df['defects'] < 0) | (df['defects'] > 1)).sum()
            if invalid_defects > 0:
                self.warnings.append(ValidationWarning(
                    severity="error",
                    message=f"{invalid_defects} rows with defects outside [0,1]",
                    column='defects',
                    row_count=invalid_defects
                ))
                is_valid = False
        
        # Check minimum data
        if len(df) == 0:
            self.warnings.append(ValidationWarning(
                severity="error",
                message="No data rows after processing"
            ))
            is_valid = False
        
        return is_valid
    
    def _sort_data(self, df: pd.DataFrame) -> pd.DataFrame:
        """Sort data by supplier and date"""
        sort_cols = ['supplier']
        if 'date_promised' in df.columns:
            sort_cols.append('date_promised')
        elif 'order_date' in df.columns:
            sort_cols.append('order_date')
        
        df = df.sort_values(sort_cols).reset_index(drop=True)
        return df
    
    def _generate_summary(self, df: pd.DataFrame, target_case: str) -> Dict[str, Any]:
        """Generate a summary of the processed data"""
        summary = {
            "total_rows": len(df),
            "unique_suppliers": df['supplier'].nunique() if 'supplier' in df.columns else 0,
            "suppliers": df['supplier'].unique().tolist() if 'supplier' in df.columns else [],
            "case_type": target_case,
            "columns": list(df.columns)
        }
        
        if 'delay' in df.columns:
            summary["delay_stats"] = {
                "mean": round(df['delay'].mean(), 2),
                "max": int(df['delay'].max()),
                "pct_delayed": round((df['delay'] > 0).mean() * 100, 2)
            }
        
        if 'defects' in df.columns:
            summary["defects_stats"] = {
                "mean": round(df['defects'].mean() * 100, 2),
                "max": round(df['defects'].max() * 100, 2),
                "pct_defective": round((df['defects'] > 0).mean() * 100, 2)
            }
        
        if 'date_promised' in df.columns:
            date_range = df['date_promised'].dropna()
            if len(date_range) > 0:
                summary["date_range"] = {
                    "start": date_range.min().strftime('%Y-%m-%d'),
                    "end": date_range.max().strftime('%Y-%m-%d')
                }
        
        return summary


# ============================================
# MAIN INGESTION FUNCTION
# ============================================

def analyze_csv_for_mapping(df: pd.DataFrame) -> Dict[str, Any]:
    """
    Analyze a CSV and return LLM-style mapping suggestions.
    
    This is the entry point for the first step of ingestion:
    analyzing the data and suggesting column mappings.
    
    Args:
        df: DataFrame loaded from uploaded CSV
        
    Returns:
        Dictionary with mapping suggestions and analysis
    """
    analyzer = LLMColumnAnalyzer()
    return analyzer.analyze_csv(df)


def apply_mappings_and_normalize(df: pd.DataFrame, approved_mappings: List[Dict], 
                                  target_case: str) -> IngestionResult:
    """
    Apply approved mappings and normalize the data.
    
    This is the second step: after user approves/edits mappings,
    apply them and perform all data transformations.
    
    Args:
        df: Original DataFrame
        approved_mappings: User-approved column mappings
        target_case: Target case type
        
    Returns:
        IngestionResult with normalized data and metadata
    """
    normalizer = DataNormalizer()
    return normalizer.normalize(df, approved_mappings, target_case)


def process_csv_with_llm_mapping(df: pd.DataFrame, user_mappings: Optional[List[Dict]] = None,
                                  target_case: Optional[str] = None) -> IngestionResult:
    """
    Complete CSV processing pipeline with optional LLM mapping.
    
    If user_mappings is provided, uses those directly.
    Otherwise, analyzes the CSV and applies suggested mappings.
    
    Args:
        df: Input DataFrame
        user_mappings: Optional pre-defined mappings
        target_case: Optional target case override
        
    Returns:
        IngestionResult with processed data
    """
    if user_mappings is None:
        # Step 1: Analyze and get suggestions
        analysis = analyze_csv_for_mapping(df)
        mappings = analysis["mappings"]
        detected_case = analysis["detected_case"]
    else:
        mappings = user_mappings
        detected_case = target_case or "mixed"
    
    # Step 2: Apply mappings and normalize
    if target_case:
        detected_case = target_case
    
    return apply_mappings_and_normalize(df, mappings, detected_case)
