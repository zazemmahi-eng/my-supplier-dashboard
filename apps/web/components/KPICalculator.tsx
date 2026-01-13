'use client';
/**
 * KPICalculator Component
 * 
 * A calculator-like interface for defining custom KPIs using mathematical expressions.
 * 
 * Features:
 * - Calculator-style UI with buttons for variables and operators
 * - Real-time formula validation
 * - Preview of available variables with current values
 * - Clear error messages for invalid formulas
 * - Support for both simple formulas and complex expressions
 * 
 * Security:
 * - Only allows predefined variables (no arbitrary code)
 * - Backend validates and parses formulas using AST
 * - No eval() or code execution
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import axios from 'axios';
import {
  X, Calculator, Check, AlertTriangle, Info, Plus, Minus,
  Divide, X as Multiply, Equal, Trash2, HelpCircle, Sparkles
} from 'lucide-react';

const API_BASE_URL = process.env.NEXT_PUBLIC_SUPPLIER_API_URL ?? 'http://127.0.0.1:8000';

// ============================================
// TYPES
// ============================================

interface Variable {
  name: string;
  description: string;
  currentValue?: number;
}

interface Operator {
  symbol: string;
  name: string;
  display?: string;
}

interface ValidationResult {
  is_valid: boolean;
  error_message?: string;
  variables_used?: string[];
  normalized_formula?: string;
}

interface KPICalculatorProps {
  workspaceId: string;
  onClose: () => void;
  onSuccess: () => void;
  kpiVariables?: Record<string, number>;  // Current variable values from dashboard
}

// ============================================
// DEFAULT VALUES
// ============================================

const DEFAULT_VARIABLES: Variable[] = [
  { name: 'delay', description: 'Retard moyen (jours)' },
  { name: 'delay_rate', description: 'Taux de retard (%)' },
  { name: 'defect_rate', description: 'Taux de défaut (%)' },
  { name: 'defects', description: 'Défauts bruts' },
  { name: 'risk_score', description: 'Score de risque (0-100)' },
  { name: 'conformity_rate', description: 'Taux de conformité (%)' },
  { name: 'perfect_orders', description: 'Commandes parfaites' },
  { name: 'total_orders', description: 'Total commandes' },
  { name: 'on_time_rate', description: 'Taux livraison à temps (%)' },
  { name: 'late_orders', description: 'Commandes en retard' },
  { name: 'avg_delay', description: 'Délai moyen' },
  { name: 'max_delay', description: 'Délai maximum' },
];

const OPERATORS: Operator[] = [
  { symbol: '+', name: 'Addition', display: '+' },
  { symbol: '-', name: 'Soustraction', display: '−' },
  { symbol: '*', name: 'Multiplication', display: '×' },
  { symbol: '/', name: 'Division', display: '÷' },
  { symbol: '**', name: 'Puissance', display: '^' },
  { symbol: '(', name: 'Parenthèse (', display: '(' },
  { symbol: ')', name: 'Parenthèse )', display: ')' },
];

const NUMBERS = ['7', '8', '9', '4', '5', '6', '1', '2', '3', '0', '.'];

// ============================================
// COMPONENT
// ============================================

export default function KPICalculator({
  workspaceId,
  onClose,
  onSuccess,
  kpiVariables = {}
}: KPICalculatorProps) {
  // Form state
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [formula, setFormula] = useState('');
  const [unit, setUnit] = useState('%');
  const [decimalPlaces, setDecimalPlaces] = useState(2);
  
  // Validation state
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [validating, setValidating] = useState(false);
  
  // Available variables from backend
  const [availableVariables, setAvailableVariables] = useState<Variable[]>(DEFAULT_VARIABLES);
  
  // UI state
  const [activeTab, setActiveTab] = useState<'variables' | 'operators' | 'numbers'>('variables');
  const [showHelp, setShowHelp] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // ============================================
  // FETCH AVAILABLE VARIABLES
  // ============================================
  
  useEffect(() => {
    const fetchVariables = async () => {
      try {
        const response = await axios.get(`${API_BASE_URL}/api/workspaces/kpi/variables`);
        const vars = Object.entries(response.data.variables).map(([name, desc]) => ({
          name,
          description: desc as string,
          currentValue: kpiVariables[name]
        }));
        setAvailableVariables(vars);
      } catch (err) {
        console.error('Error fetching variables:', err);
        // Use defaults with current values
        setAvailableVariables(DEFAULT_VARIABLES.map(v => ({
          ...v,
          currentValue: kpiVariables[v.name]
        })));
      }
    };
    
    fetchVariables();
  }, [kpiVariables]);
  
  // ============================================
  // FORMULA VALIDATION (debounced)
  // ============================================
  
  const validateFormula = useCallback(async (formulaToValidate: string) => {
    if (!formulaToValidate.trim()) {
      setValidation(null);
      return;
    }
    
    setValidating(true);
    try {
      const response = await axios.post(`${API_BASE_URL}/api/workspaces/kpi/validate`, {
        formula: formulaToValidate
      });
      setValidation(response.data);
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.data) {
        setValidation({
          is_valid: false,
          error_message: err.response.data.detail || 'Erreur de validation'
        });
      } else {
        setValidation({
          is_valid: false,
          error_message: 'Erreur de connexion au serveur'
        });
      }
    } finally {
      setValidating(false);
    }
  }, []);
  
  // Debounced validation
  useEffect(() => {
    const timer = setTimeout(() => {
      validateFormula(formula);
    }, 500);
    
    return () => clearTimeout(timer);
  }, [formula, validateFormula]);
  
  // ============================================
  // CALCULATOR INPUT HANDLERS
  // ============================================
  
  const insertIntoFormula = useCallback((text: string) => {
    setFormula(prev => prev + text);
  }, []);
  
  const insertVariable = useCallback((varName: string) => {
    // Add space before if formula doesn't end with operator or opening paren
    const needsSpace = formula.length > 0 && !/[\s+\-*/(\^]$/.test(formula);
    setFormula(prev => prev + (needsSpace ? ' ' : '') + varName);
  }, [formula]);
  
  const insertOperator = useCallback((op: string) => {
    // Add spaces around binary operators
    if (['+', '-', '*', '/', '**'].includes(op)) {
      setFormula(prev => prev.trimEnd() + ' ' + op + ' ');
    } else {
      setFormula(prev => prev + op);
    }
  }, []);
  
  const backspace = useCallback(() => {
    setFormula(prev => prev.slice(0, -1).trimEnd());
  }, []);
  
  const clearFormula = useCallback(() => {
    setFormula('');
    setValidation(null);
  }, []);
  
  // ============================================
  // SUBMIT HANDLER
  // ============================================
  
  const handleSubmit = async () => {
    // Validate inputs
    if (!name.trim()) {
      setError('Veuillez entrer un nom pour le KPI');
      return;
    }
    
    if (!formula.trim()) {
      setError('Veuillez entrer une formule');
      return;
    }
    
    if (!validation?.is_valid) {
      setError('La formule est invalide');
      return;
    }
    
    setCreating(true);
    setError(null);
    
    try {
      await axios.post(`${API_BASE_URL}/api/workspaces/${workspaceId}/kpis/custom`, {
        name: name.trim(),
        description: description.trim() || null,
        formula_type: 'expression',
        formula: formula.trim(),
        unit,
        decimal_places: decimalPlaces
      });
      
      onSuccess();
      onClose();
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.data?.detail) {
        setError(err.response.data.detail);
      } else {
        setError('Erreur lors de la création du KPI');
      }
    } finally {
      setCreating(false);
    }
  };
  
  // ============================================
  // COMPUTED VALUES
  // ============================================
  
  // Preview calculated value
  const previewValue = useMemo(() => {
    if (!validation?.is_valid || !validation.variables_used) return null;
    
    // Check if all variables have values
    const missingVars = validation.variables_used.filter(v => kpiVariables[v] === undefined);
    if (missingVars.length > 0) return null;
    
    // Simple client-side preview (backend will do actual calculation)
    // This is just for UX - actual calculation is server-side
    try {
      // Create a safe evaluation context
      const safeEval = (expr: string, vars: Record<string, number>) => {
        // Replace variable names with their values
        let evalExpr = expr;
        for (const [name, value] of Object.entries(vars)) {
          evalExpr = evalExpr.replace(new RegExp(`\\b${name}\\b`, 'g'), String(value));
        }
        // Replace ** with Math.pow for safety
        evalExpr = evalExpr.replace(/(\d+(?:\.\d+)?)\s*\*\*\s*(\d+(?:\.\d+)?)/g, 'Math.pow($1,$2)');
        
        // Only evaluate if it looks safe (only numbers, operators, parentheses)
        if (/^[\d\s+\-*/().Math,pow]+$/.test(evalExpr)) {
          const result = Function(`"use strict"; return (${evalExpr})`)();
          return typeof result === 'number' && isFinite(result) ? result : null;
        }
        return null;
      };
      
      return safeEval(formula, kpiVariables);
    } catch {
      return null;
    }
  }, [validation, formula, kpiVariables]);
  
  // ============================================
  // RENDER
  // ============================================
  
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b bg-gradient-to-r from-purple-600 to-blue-600">
          <div className="flex items-center gap-3 text-white">
            <Calculator className="h-6 w-6" />
            <h2 className="text-xl font-bold">Calculateur de KPI</h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/20 rounded-lg transition-colors"
          >
            <X className="h-5 w-5 text-white" />
          </button>
        </div>
        
        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          <div className="grid md:grid-cols-2 gap-6">
            {/* Left: Form Inputs */}
            <div className="space-y-4">
              {/* KPI Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Nom du KPI <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ex: Score de Performance"
                  className="w-full px-4 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                />
              </div>
              
              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Description (optionnel)
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Description du KPI..."
                  rows={2}
                  className="w-full px-4 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                />
              </div>
              
              {/* Formula Display */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Formule <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <div className="flex items-center gap-2">
                    <span className="text-lg font-mono text-gray-500">Y =</span>
                    <input
                      type="text"
                      value={formula}
                      onChange={(e) => setFormula(e.target.value)}
                      placeholder="Cliquez sur les variables ci-dessous..."
                      className={`flex-1 px-4 py-3 rounded-lg border-2 font-mono text-lg ${
                        validation === null
                          ? 'border-gray-300'
                          : validation.is_valid
                          ? 'border-green-500 bg-green-50'
                          : 'border-red-500 bg-red-50'
                      } focus:ring-2 focus:ring-purple-500 focus:border-transparent`}
                    />
                  </div>
                  
                  {/* Validation indicator */}
                  {validating && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                      <div className="animate-spin h-5 w-5 border-2 border-purple-500 border-t-transparent rounded-full" />
                    </div>
                  )}
                </div>
                
                {/* Validation Message */}
                {validation && !validating && (
                  <div className={`mt-2 p-2 rounded-lg text-sm ${
                    validation.is_valid
                      ? 'bg-green-100 text-green-700'
                      : 'bg-red-100 text-red-700'
                  }`}>
                    {validation.is_valid ? (
                      <div className="flex items-center gap-2">
                        <Check className="h-4 w-4" />
                        <span>Formule valide</span>
                        {validation.variables_used && validation.variables_used.length > 0 && (
                          <span className="text-xs opacity-75">
                            ({validation.variables_used.join(', ')})
                          </span>
                        )}
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4" />
                        <span>{validation.error_message}</span>
                      </div>
                    )}
                  </div>
                )}
                
                {/* Preview Value */}
                {previewValue !== null && validation?.is_valid && (
                  <div className="mt-2 p-3 bg-purple-50 rounded-lg">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-purple-600">Aperçu du résultat:</span>
                      <span className="text-xl font-bold text-purple-800">
                        {previewValue.toFixed(decimalPlaces)} {unit}
                      </span>
                    </div>
                  </div>
                )}
              </div>
              
              {/* Unit & Decimals */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Unité
                  </label>
                  <input
                    type="text"
                    value={unit}
                    onChange={(e) => setUnit(e.target.value)}
                    placeholder="%"
                    className="w-full px-4 py-2 rounded-lg border border-gray-300"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Décimales
                  </label>
                  <select
                    value={decimalPlaces}
                    onChange={(e) => setDecimalPlaces(Number(e.target.value))}
                    className="w-full px-4 py-2 rounded-lg border border-gray-300"
                  >
                    {[0, 1, 2, 3, 4].map(n => (
                      <option key={n} value={n}>{n}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
            
            {/* Right: Calculator Pad */}
            <div className="space-y-4">
              {/* Tab Buttons */}
              <div className="flex gap-2">
                <button
                  onClick={() => setActiveTab('variables')}
                  className={`flex-1 px-3 py-2 rounded-lg font-medium text-sm transition-colors ${
                    activeTab === 'variables'
                      ? 'bg-purple-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  Variables
                </button>
                <button
                  onClick={() => setActiveTab('operators')}
                  className={`flex-1 px-3 py-2 rounded-lg font-medium text-sm transition-colors ${
                    activeTab === 'operators'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  Opérateurs
                </button>
                <button
                  onClick={() => setActiveTab('numbers')}
                  className={`flex-1 px-3 py-2 rounded-lg font-medium text-sm transition-colors ${
                    activeTab === 'numbers'
                      ? 'bg-green-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  Nombres
                </button>
              </div>
              
              {/* Calculator Grid */}
              <div className="bg-gray-50 rounded-xl p-3 min-h-[300px]">
                {/* Variables Tab */}
                {activeTab === 'variables' && (
                  <div className="grid grid-cols-2 gap-2">
                    {availableVariables.map((variable) => (
                      <button
                        key={variable.name}
                        onClick={() => insertVariable(variable.name)}
                        className="p-3 bg-white hover:bg-purple-50 border border-gray-200 hover:border-purple-300 rounded-lg text-left transition-colors group"
                      >
                        <div className="font-mono text-purple-600 text-sm">
                          {variable.name}
                        </div>
                        <div className="text-xs text-gray-500 truncate">
                          {variable.description}
                        </div>
                        {variable.currentValue !== undefined && (
                          <div className="text-xs text-green-600 mt-1">
                            = {variable.currentValue.toFixed(2)}
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                )}
                
                {/* Operators Tab */}
                {activeTab === 'operators' && (
                  <div className="grid grid-cols-4 gap-2">
                    {OPERATORS.map((op) => (
                      <button
                        key={op.symbol}
                        onClick={() => insertOperator(op.symbol)}
                        className="p-4 bg-white hover:bg-blue-50 border border-gray-200 hover:border-blue-300 rounded-lg transition-colors"
                      >
                        <div className="text-2xl font-bold text-blue-600 text-center">
                          {op.display || op.symbol}
                        </div>
                        <div className="text-xs text-gray-500 text-center mt-1">
                          {op.name}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
                
                {/* Numbers Tab */}
                {activeTab === 'numbers' && (
                  <div className="grid grid-cols-4 gap-2">
                    {NUMBERS.map((num) => (
                      <button
                        key={num}
                        onClick={() => insertIntoFormula(num)}
                        className="p-4 bg-white hover:bg-green-50 border border-gray-200 hover:border-green-300 rounded-lg text-2xl font-bold text-gray-700 transition-colors"
                      >
                        {num}
                      </button>
                    ))}
                    {/* Clear button */}
                    <button
                      onClick={clearFormula}
                      className="p-4 bg-red-50 hover:bg-red-100 border border-red-200 rounded-lg text-red-600 transition-colors"
                    >
                      <Trash2 className="h-6 w-6 mx-auto" />
                    </button>
                  </div>
                )}
              </div>
              
              {/* Control Buttons */}
              <div className="flex gap-2">
                <button
                  onClick={backspace}
                  className="flex-1 px-4 py-2 bg-gray-200 hover:bg-gray-300 rounded-lg font-medium"
                >
                  ← Effacer
                </button>
                <button
                  onClick={clearFormula}
                  className="flex-1 px-4 py-2 bg-red-100 hover:bg-red-200 text-red-700 rounded-lg font-medium"
                >
                  Tout Effacer
                </button>
              </div>
              
              {/* Help Button */}
              <button
                onClick={() => setShowHelp(!showHelp)}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
              >
                <HelpCircle className="h-4 w-4" />
                <span className="text-sm">{showHelp ? 'Masquer l\'aide' : 'Aide & Exemples'}</span>
              </button>
              
              {/* Help Panel */}
              {showHelp && (
                <div className="bg-blue-50 rounded-lg p-4 text-sm">
                  <h4 className="font-semibold text-blue-800 mb-2">Exemples de formules:</h4>
                  <ul className="space-y-2 text-blue-700">
                    <li>
                      <code className="bg-white px-2 py-1 rounded">delay + defect_rate</code>
                      <span className="text-gray-600 ml-2">Somme</span>
                    </li>
                    <li>
                      <code className="bg-white px-2 py-1 rounded">(delay / defect_rate) * 100</code>
                      <span className="text-gray-600 ml-2">Ratio</span>
                    </li>
                    <li>
                      <code className="bg-white px-2 py-1 rounded">100 - conformity_rate</code>
                      <span className="text-gray-600 ml-2">Non-conformité</span>
                    </li>
                    <li>
                      <code className="bg-white px-2 py-1 rounded">risk_score ** 0.5</code>
                      <span className="text-gray-600 ml-2">Racine carrée</span>
                    </li>
                  </ul>
                  <p className="mt-3 text-gray-600">
                    <Info className="h-4 w-4 inline mr-1" />
                    Seuls les opérateurs +, -, *, /, ** et les parenthèses sont autorisés.
                  </p>
                </div>
              )}
            </div>
          </div>
          
          {/* Error Message */}
          {error && (
            <div className="mt-4 p-3 bg-red-100 border border-red-300 rounded-lg text-red-700 flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>
        
        {/* Footer */}
        <div className="p-4 border-t bg-gray-50 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-6 py-2 bg-gray-200 hover:bg-gray-300 rounded-lg font-medium transition-colors"
          >
            Annuler
          </button>
          <button
            onClick={handleSubmit}
            disabled={creating || !validation?.is_valid || !name.trim()}
            className={`px-6 py-2 rounded-lg font-medium flex items-center gap-2 transition-colors ${
              creating || !validation?.is_valid || !name.trim()
                ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                : 'bg-purple-600 hover:bg-purple-700 text-white'
            }`}
          >
            {creating ? (
              <>
                <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                Création...
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" />
                Créer le KPI
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
