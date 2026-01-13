# kpi_expression_parser.py
"""
Safe Expression Parser for Custom KPIs

This module provides a secure, AST-based expression parser for evaluating
user-defined KPI formulas. NO EVAL() IS USED.

Key Features:
- Parses mathematical expressions using Python's AST module
- Only allows arithmetic operations: +, -, *, /, (), **
- Only allows predefined variables (KPI metrics)
- Validates syntax before evaluation
- Handles division by zero gracefully
- Returns clear error messages for invalid expressions

Security: This parser ONLY allows mathematical expressions with predefined
variables. No function calls, imports, or arbitrary code execution.
"""

import ast
import operator
import re
from typing import Dict, Any, List, Optional, Tuple, Set
from dataclasses import dataclass


# ============================================
# AVAILABLE VARIABLES (KPI METRICS)
# ============================================

# These are the only variables allowed in custom KPI formulas
# They map to values from the standard KPIs and raw data
AVAILABLE_VARIABLES = {
    # Standard KPIs from dashboard
    "delay": "Retard moyen (jours)",
    "delay_rate": "Taux de retard (%)",
    "defect_rate": "Taux de défaut (%)",
    "defects": "Défauts bruts",
    "risk_score": "Score de risque (0-100)",
    "conformity_rate": "Taux de conformité (%)",
    "perfect_orders": "Commandes parfaites",
    "total_orders": "Nombre total de commandes",
    
    # Raw metrics from data
    "avg_delay": "Délai moyen de livraison",
    "max_delay": "Délai maximum",
    "min_delay": "Délai minimum",
    "avg_defects": "Défauts moyens",
    "max_defects": "Défauts maximum",
    
    # Derived metrics
    "on_time_rate": "Taux de livraison à temps (%)",
    "late_orders": "Commandes en retard",
    "early_orders": "Commandes en avance",
}


# ============================================
# DATA CLASSES
# ============================================

@dataclass
class ValidationResult:
    """Result of formula validation"""
    is_valid: bool
    error_message: Optional[str] = None
    error_position: Optional[int] = None
    variables_used: List[str] = None
    normalized_formula: Optional[str] = None
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "is_valid": self.is_valid,
            "error_message": self.error_message,
            "error_position": self.error_position,
            "variables_used": self.variables_used or [],
            "normalized_formula": self.normalized_formula
        }


@dataclass
class EvaluationResult:
    """Result of formula evaluation"""
    success: bool
    value: Optional[float] = None
    error_message: Optional[str] = None
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "success": self.success,
            "value": self.value,
            "error_message": self.error_message
        }


# ============================================
# SAFE EXPRESSION EVALUATOR
# ============================================

class SafeExpressionEvaluator:
    """
    AST-based expression evaluator for custom KPI formulas.
    
    SECURITY: Uses Python's AST module to parse and evaluate expressions.
    Only allows arithmetic operations and predefined variables.
    NO EVAL() OR EXEC() IS USED.
    """
    
    # Allowed binary operators
    OPERATORS = {
        ast.Add: operator.add,
        ast.Sub: operator.sub,
        ast.Mult: operator.mul,
        ast.Div: operator.truediv,
        ast.Pow: operator.pow,
        ast.Mod: operator.mod,
        ast.FloorDiv: operator.floordiv,
    }
    
    # Allowed unary operators
    UNARY_OPERATORS = {
        ast.UAdd: operator.pos,
        ast.USub: operator.neg,
    }
    
    # Allowed comparison operators (for conditional expressions)
    COMPARE_OPERATORS = {
        ast.Lt: operator.lt,
        ast.LtE: operator.le,
        ast.Gt: operator.gt,
        ast.GtE: operator.ge,
        ast.Eq: operator.eq,
        ast.NotEq: operator.ne,
    }
    
    def __init__(self, allowed_variables: Optional[Dict[str, str]] = None):
        """
        Initialize the evaluator.
        
        Args:
            allowed_variables: Dict mapping variable names to descriptions.
                              If None, uses AVAILABLE_VARIABLES.
        """
        self.allowed_variables = allowed_variables or AVAILABLE_VARIABLES
    
    def validate(self, formula: str) -> ValidationResult:
        """
        Validate a formula without evaluating it.
        
        Args:
            formula: The formula string to validate
            
        Returns:
            ValidationResult with validation status and any errors
        """
        if not formula or not formula.strip():
            return ValidationResult(
                is_valid=False,
                error_message="La formule ne peut pas être vide"
            )
        
        # Normalize the formula
        normalized = self._normalize_formula(formula)
        
        try:
            # Parse the formula into AST
            tree = ast.parse(normalized, mode='eval')
            
            # Validate the AST nodes
            variables_used = []
            self._validate_node(tree.body, variables_used)
            
            # Check for unknown variables
            unknown_vars = set(variables_used) - set(self.allowed_variables.keys())
            if unknown_vars:
                return ValidationResult(
                    is_valid=False,
                    error_message=f"Variables inconnues: {', '.join(sorted(unknown_vars))}",
                    variables_used=variables_used
                )
            
            return ValidationResult(
                is_valid=True,
                variables_used=list(set(variables_used)),
                normalized_formula=normalized
            )
            
        except SyntaxError as e:
            return ValidationResult(
                is_valid=False,
                error_message=f"Erreur de syntaxe: {str(e)}",
                error_position=e.offset
            )
        except ValueError as e:
            return ValidationResult(
                is_valid=False,
                error_message=str(e)
            )
    
    def evaluate(self, formula: str, variables: Dict[str, float]) -> EvaluationResult:
        """
        Evaluate a formula with the given variable values.
        
        Args:
            formula: The formula string to evaluate
            variables: Dict mapping variable names to their values
            
        Returns:
            EvaluationResult with the computed value or error
        """
        # First validate the formula
        validation = self.validate(formula)
        if not validation.is_valid:
            return EvaluationResult(
                success=False,
                error_message=validation.error_message
            )
        
        # Check all required variables are provided
        missing_vars = set(validation.variables_used) - set(variables.keys())
        if missing_vars:
            return EvaluationResult(
                success=False,
                error_message=f"Variables manquantes: {', '.join(sorted(missing_vars))}"
            )
        
        try:
            # Parse and evaluate
            normalized = self._normalize_formula(formula)
            tree = ast.parse(normalized, mode='eval')
            result = self._eval_node(tree.body, variables)
            
            # Handle non-numeric results
            if not isinstance(result, (int, float)):
                return EvaluationResult(
                    success=False,
                    error_message="Le résultat doit être numérique"
                )
            
            # Handle infinity and NaN
            if result != result:  # NaN check
                return EvaluationResult(
                    success=False,
                    error_message="Le résultat est invalide (NaN)"
                )
            if abs(result) == float('inf'):
                return EvaluationResult(
                    success=False,
                    error_message="Le résultat est infini (division par zéro probable)"
                )
            
            return EvaluationResult(
                success=True,
                value=round(result, 4)
            )
            
        except ZeroDivisionError:
            return EvaluationResult(
                success=False,
                error_message="Division par zéro"
            )
        except Exception as e:
            return EvaluationResult(
                success=False,
                error_message=f"Erreur d'évaluation: {str(e)}"
            )
    
    def _normalize_formula(self, formula: str) -> str:
        """Normalize the formula string for parsing."""
        # Remove leading "Y =" or "y =" if present
        formula = re.sub(r'^[Yy]\s*=\s*', '', formula.strip())
        # Replace common symbols
        formula = formula.replace('^', '**')  # Power operator
        formula = formula.replace('×', '*')    # Multiplication
        formula = formula.replace('÷', '/')    # Division
        return formula.strip()
    
    def _validate_node(self, node: ast.AST, variables: List[str]) -> None:
        """
        Recursively validate AST nodes.
        Raises ValueError for disallowed constructs.
        """
        if isinstance(node, ast.Num):  # Python 3.7 compatibility
            return
        
        if isinstance(node, ast.Constant):
            if not isinstance(node.value, (int, float)):
                raise ValueError(f"Seuls les nombres sont autorisés, pas {type(node.value).__name__}")
            return
        
        if isinstance(node, ast.Name):
            variables.append(node.id)
            return
        
        if isinstance(node, ast.BinOp):
            if type(node.op) not in self.OPERATORS:
                raise ValueError(f"Opérateur non autorisé: {type(node.op).__name__}")
            self._validate_node(node.left, variables)
            self._validate_node(node.right, variables)
            return
        
        if isinstance(node, ast.UnaryOp):
            if type(node.op) not in self.UNARY_OPERATORS:
                raise ValueError(f"Opérateur unaire non autorisé: {type(node.op).__name__}")
            self._validate_node(node.operand, variables)
            return
        
        if isinstance(node, ast.Compare):
            # Allow comparisons for conditional logic
            self._validate_node(node.left, variables)
            for comparator in node.comparators:
                self._validate_node(comparator, variables)
            return
        
        if isinstance(node, ast.IfExp):
            # Allow ternary expressions: a if condition else b
            self._validate_node(node.test, variables)
            self._validate_node(node.body, variables)
            self._validate_node(node.orelse, variables)
            return
        
        # Disallow everything else (function calls, attribute access, etc.)
        raise ValueError(f"Construction non autorisée: {type(node).__name__}")
    
    def _eval_node(self, node: ast.AST, variables: Dict[str, float]) -> float:
        """
        Recursively evaluate AST nodes.
        """
        # Handle numeric constants (Python 3.8+)
        if isinstance(node, ast.Constant):
            return float(node.value)
        
        # Handle numeric constants (Python 3.7)
        if isinstance(node, ast.Num):
            return float(node.n)
        
        # Handle variable names
        if isinstance(node, ast.Name):
            return float(variables[node.id])
        
        # Handle binary operations
        if isinstance(node, ast.BinOp):
            left = self._eval_node(node.left, variables)
            right = self._eval_node(node.right, variables)
            op_func = self.OPERATORS[type(node.op)]
            return op_func(left, right)
        
        # Handle unary operations
        if isinstance(node, ast.UnaryOp):
            operand = self._eval_node(node.operand, variables)
            op_func = self.UNARY_OPERATORS[type(node.op)]
            return op_func(operand)
        
        # Handle comparisons
        if isinstance(node, ast.Compare):
            left = self._eval_node(node.left, variables)
            for op, comparator in zip(node.ops, node.comparators):
                right = self._eval_node(comparator, variables)
                if type(op) not in self.COMPARE_OPERATORS:
                    raise ValueError(f"Comparateur non autorisé: {type(op).__name__}")
                if not self.COMPARE_OPERATORS[type(op)](left, right):
                    return 0.0
                left = right
            return 1.0
        
        # Handle ternary expressions
        if isinstance(node, ast.IfExp):
            condition = self._eval_node(node.test, variables)
            if condition:
                return self._eval_node(node.body, variables)
            else:
                return self._eval_node(node.orelse, variables)
        
        raise ValueError(f"Noeud non supporté: {type(node).__name__}")


# ============================================
# HELPER FUNCTIONS
# ============================================

def get_available_variables() -> Dict[str, str]:
    """Get the list of available variables for custom KPIs."""
    return AVAILABLE_VARIABLES.copy()


def validate_formula(formula: str) -> ValidationResult:
    """Validate a KPI formula."""
    evaluator = SafeExpressionEvaluator()
    return evaluator.validate(formula)


def evaluate_formula(formula: str, variables: Dict[str, float]) -> EvaluationResult:
    """Evaluate a KPI formula with given variable values."""
    evaluator = SafeExpressionEvaluator()
    return evaluator.evaluate(formula, variables)


def compute_kpi_variables(df, kpis_globaux: Dict[str, Any]) -> Dict[str, float]:
    """
    Compute all available variables from dataframe and existing KPIs.
    
    Args:
        df: The pandas DataFrame with raw data
        kpis_globaux: Dict of standard KPI values
        
    Returns:
        Dict mapping variable names to their computed values
    """
    import pandas as pd
    
    variables = {}
    
    # From standard KPIs
    variables['delay'] = float(kpis_globaux.get('retard_moyen', 0))
    variables['delay_rate'] = float(kpis_globaux.get('taux_retard', 0))
    variables['defect_rate'] = float(kpis_globaux.get('taux_defaut', 0))
    variables['conformity_rate'] = float(kpis_globaux.get('taux_conformite', 0))
    variables['perfect_orders'] = float(kpis_globaux.get('commandes_parfaites', 0))
    variables['total_orders'] = float(kpis_globaux.get('nb_commandes', 0))
    variables['risk_score'] = float(kpis_globaux.get('score_risque_global', 50))
    
    # Compute derived metrics
    variables['on_time_rate'] = 100.0 - variables['delay_rate']
    variables['late_orders'] = variables['total_orders'] * (variables['delay_rate'] / 100.0)
    variables['early_orders'] = variables['total_orders'] - variables['late_orders']
    
    # From raw data if available
    if df is not None and not df.empty:
        # Defects
        if 'defects' in df.columns:
            variables['defects'] = float(df['defects'].mean())
            variables['avg_defects'] = float(df['defects'].mean())
            variables['max_defects'] = float(df['defects'].max())
        else:
            variables['defects'] = variables['defect_rate'] / 100.0
            variables['avg_defects'] = variables['defect_rate'] / 100.0
            variables['max_defects'] = variables['defect_rate'] / 100.0
        
        # Delays
        if 'delay' in df.columns:
            variables['avg_delay'] = float(df['delay'].mean())
            variables['max_delay'] = float(df['delay'].max())
            variables['min_delay'] = float(df['delay'].min())
        else:
            variables['avg_delay'] = variables['delay']
            variables['max_delay'] = variables['delay']
            variables['min_delay'] = 0.0
    else:
        # Fallback values
        variables['defects'] = variables['defect_rate'] / 100.0
        variables['avg_defects'] = variables['defect_rate'] / 100.0
        variables['max_defects'] = variables['defect_rate'] / 100.0
        variables['avg_delay'] = variables['delay']
        variables['max_delay'] = variables['delay']
        variables['min_delay'] = 0.0
    
    return variables


# ============================================
# TEST FUNCTIONS (for development)
# ============================================

if __name__ == "__main__":
    # Test the evaluator
    evaluator = SafeExpressionEvaluator()
    
    test_formulas = [
        "delay + defect_rate",
        "(delay / defect_rate) * 100",
        "risk_score - (conformity_rate / 2)",
        "delay ** 2 + defect_rate ** 2",
        "-delay + 100",
        "100 if delay > 5 else 50",  # Conditional
        
        # Invalid formulas
        "import os",  # Should fail
        "eval('test')",  # Should fail
        "unknown_var + 1",  # Should fail
        "delay + ",  # Syntax error
    ]
    
    test_vars = {
        "delay": 5.0,
        "defect_rate": 10.0,
        "risk_score": 60.0,
        "conformity_rate": 90.0,
    }
    
    print("=" * 60)
    print("KPI Expression Parser Test")
    print("=" * 60)
    
    for formula in test_formulas:
        print(f"\nFormula: {formula}")
        
        # Validate
        validation = evaluator.validate(formula)
        print(f"  Valid: {validation.is_valid}")
        if not validation.is_valid:
            print(f"  Error: {validation.error_message}")
            continue
        
        print(f"  Variables: {validation.variables_used}")
        
        # Evaluate
        result = evaluator.evaluate(formula, test_vars)
        print(f"  Result: {result.value if result.success else result.error_message}")
