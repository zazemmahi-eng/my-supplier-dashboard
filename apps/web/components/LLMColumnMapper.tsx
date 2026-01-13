'use client';
/**
 * LLMColumnMapper Component
 * 
 * Displays LLM-suggested column mappings and allows users to:
 * - Review suggested mappings with confidence scores
 * - Edit/override suggested mappings
 * - See warnings and issues
 * - Apply mappings to normalize data
 * - Configure defect count columns (Case B variant)
 * 
 * The LLM only SUGGESTS mappings - all transformations are done by Python.
 */

import { useState, useEffect, useMemo } from 'react';
import {
  Check, X, AlertTriangle, Info, ChevronDown, ChevronUp,
  RefreshCw, ArrowRight, Edit2, HelpCircle, Zap, Calculator
} from 'lucide-react';

// ============================================
// TYPE DEFINITIONS
// ============================================

interface ColumnMapping {
  source_column: string;
  target_role: string;
  confidence: number;
  reasoning: string;
  sample_values: string[];
  detected_type: string;
  transformation_needed: string | null;
}

interface ColumnAnalysis {
  column: string;
  detected_type: string;
  sample_values: string[];
  null_count: number;
  unique_count: number;
}

interface Issue {
  severity: 'error' | 'warning' | 'info';
  message: string;
}

interface AnalysisResult {
  mappings: ColumnMapping[];
  column_analysis: ColumnAnalysis[];
  detected_case: string;
  issues: Issue[];
  recommendation: string;
}

interface LLMColumnMapperProps {
  analysis: AnalysisResult;
  originalColumns: string[];
  onApply: (mappings: ColumnMapping[], targetCase: string) => void;
  onCancel: () => void;
  loading?: boolean;
}

// ============================================
// CONSTANTS
// ============================================

// Available target roles with descriptions
const TARGET_ROLES = [
  { value: 'supplier', label: 'Fournisseur', description: 'Nom du fournisseur', icon: '🏭' },
  { value: 'date_promised', label: 'Date Promise', description: 'Date de livraison prévue', icon: '📅' },
  { value: 'date_delivered', label: 'Date Livrée', description: 'Date de livraison effective', icon: '✅' },
  { value: 'order_date', label: 'Date Commande', description: 'Date de la commande', icon: '📦' },
  { value: 'delay', label: 'Retard (jours)', description: 'Nombre de jours de retard', icon: '⏰' },
  { value: 'delay_direct', label: 'Retard Direct', description: 'Valeur de retard déjà calculée', icon: '⏱️' },
  { value: 'defects', label: 'Défauts', description: 'Taux de défauts (0-1 ou 0-100%)', icon: '🔍' },
  { value: 'quality_score', label: 'Score Qualité', description: 'Score de qualité (sera converti)', icon: '⭐' },
  { value: 'defective_count', label: 'Pièces Défectueuses', description: 'Nombre de pièces défectueuses', icon: '❌' },
  { value: 'total_count', label: 'Total Pièces', description: 'Nombre total de pièces', icon: '📊' },
  { value: 'non_defective_count', label: 'Pièces Conformes', description: 'Nombre de pièces non défectueuses', icon: '✔️' },
  { value: 'ignore', label: 'Ignorer', description: 'Ne pas importer cette colonne', icon: '🚫' },
];

// Case types with descriptions
const CASE_TYPES = [
  { value: 'delay_only', label: 'Case A - Retards', description: 'Analyse des retards uniquement', color: 'blue' },
  { value: 'defects_only', label: 'Case B - Défauts', description: 'Analyse des défauts uniquement', color: 'purple' },
  { value: 'mixed', label: 'Case C - Mixte', description: 'Retards ET défauts combinés', color: 'green' },
];

// ============================================
// HELPER FUNCTIONS
// ============================================

function getConfidenceColor(confidence: number): string {
  if (confidence >= 0.8) return 'text-green-600 bg-green-100';
  if (confidence >= 0.5) return 'text-yellow-600 bg-yellow-100';
  return 'text-red-600 bg-red-100';
}

function getConfidenceLabel(confidence: number): string {
  if (confidence >= 0.8) return 'Haute';
  if (confidence >= 0.5) return 'Moyenne';
  return 'Faible';
}

function getSeverityIcon(severity: string) {
  switch (severity) {
    case 'error': return <X className="w-4 h-4 text-red-500" />;
    case 'warning': return <AlertTriangle className="w-4 h-4 text-yellow-500" />;
    default: return <Info className="w-4 h-4 text-blue-500" />;
  }
}

function getSeverityColor(severity: string): string {
  switch (severity) {
    case 'error': return 'bg-red-50 border-red-200 text-red-700';
    case 'warning': return 'bg-yellow-50 border-yellow-200 text-yellow-700';
    default: return 'bg-blue-50 border-blue-200 text-blue-700';
  }
}

// ============================================
// MAIN COMPONENT
// ============================================

export default function LLMColumnMapper({
  analysis,
  originalColumns,
  onApply,
  onCancel,
  loading = false
}: LLMColumnMapperProps) {
  // State for editable mappings
  const [editedMappings, setEditedMappings] = useState<ColumnMapping[]>(analysis.mappings);
  const [selectedCase, setSelectedCase] = useState<string>(analysis.detected_case);
  const [expandedColumns, setExpandedColumns] = useState<Set<string>>(new Set());
  const [showAllColumns, setShowAllColumns] = useState(false);
  
  // State for defect count configuration (Case B variant)
  const [showDefectCountConfig, setShowDefectCountConfig] = useState(false);
  const [defectiveColumn, setDefectiveColumn] = useState<string>('');
  const [denominatorColumn, setDenominatorColumn] = useState<string>('');
  const [denominatorType, setDenominatorType] = useState<'total' | 'non_defective'>('total');

  // Sync with analysis when it changes
  useEffect(() => {
    setEditedMappings(analysis.mappings);
    setSelectedCase(analysis.detected_case);
    
    // Auto-detect defect count columns from mappings
    const defectiveMapping = analysis.mappings.find(m => 
      m.target_role === 'defective_count' || 
      m.target_role === 'ColumnRole.DEFECTIVE_COUNT'
    );
    const totalMapping = analysis.mappings.find(m => 
      m.target_role === 'total_count' || 
      m.target_role === 'ColumnRole.TOTAL_COUNT'
    );
    const nonDefectiveMapping = analysis.mappings.find(m => 
      m.target_role === 'non_defective_count' || 
      m.target_role === 'ColumnRole.NON_DEFECTIVE_COUNT'
    );
    
    if (defectiveMapping) {
      setDefectiveColumn(defectiveMapping.source_column);
    }
    if (totalMapping) {
      setDenominatorColumn(totalMapping.source_column);
      setDenominatorType('total');
    } else if (nonDefectiveMapping) {
      setDenominatorColumn(nonDefectiveMapping.source_column);
      setDenominatorType('non_defective');
    }
  }, [analysis]);
  
  // Detect if we need to show defect count configuration
  const needsDefectCountConfig = useMemo(() => {
    // Check if Case B (defects_only) is detected with defect counts
    if (selectedCase !== 'defects_only') return false;
    
    const hasDefectiveCount = editedMappings.some(m => 
      m.target_role === 'defective_count' || 
      m.target_role === 'ColumnRole.DEFECTIVE_COUNT'
    );
    const hasTotalOrNonDefective = editedMappings.some(m => 
      m.target_role === 'total_count' || 
      m.target_role === 'ColumnRole.TOTAL_COUNT' ||
      m.target_role === 'non_defective_count' ||
      m.target_role === 'ColumnRole.NON_DEFECTIVE_COUNT'
    );
    const hasDirectDefects = editedMappings.some(m => 
      m.target_role === 'defects' || 
      m.target_role === 'ColumnRole.DEFECTS'
    );
    
    // Show config if we have defect counts detected OR if Case B has no direct defects
    return (hasDefectiveCount || hasTotalOrNonDefective) || 
           (!hasDirectDefects && selectedCase === 'defects_only');
  }, [editedMappings, selectedCase]);
  
  // Get available numeric columns for defect count selection
  const numericColumns = useMemo(() => {
    return analysis.column_analysis?.filter(col => 
      col.detected_type === 'integer' || col.detected_type === 'float'
    ).map(col => col.column) || [];
  }, [analysis.column_analysis]);

  // ============================================
  // HANDLERS
  // ============================================

  const handleMappingChange = (sourceColumn: string, newRole: string) => {
    setEditedMappings(prev => prev.map(m => 
      m.source_column === sourceColumn
        ? { ...m, target_role: newRole, confidence: 1.0 }
        : m
    ));
  };
  
  // Handle defect count column selection
  const handleDefectiveColumnChange = (column: string) => {
    setDefectiveColumn(column);
    // Update mappings to reflect this selection
    setEditedMappings(prev => prev.map(m => {
      if (m.source_column === column) {
        return { ...m, target_role: 'defective_count', confidence: 1.0, transformation_needed: 'compute_defect_rate' };
      }
      // Clear previous defective_count mapping
      if (m.target_role === 'defective_count' || m.target_role === 'ColumnRole.DEFECTIVE_COUNT') {
        return { ...m, target_role: 'ignore', confidence: 0.5 };
      }
      return m;
    }));
  };
  
  const handleDenominatorColumnChange = (column: string) => {
    setDenominatorColumn(column);
    const targetRole = denominatorType === 'total' ? 'total_count' : 'non_defective_count';
    // Update mappings to reflect this selection
    setEditedMappings(prev => prev.map(m => {
      if (m.source_column === column) {
        return { ...m, target_role: targetRole, confidence: 1.0, transformation_needed: 'compute_defect_rate' };
      }
      // Clear previous total/non_defective mapping
      if (m.target_role === 'total_count' || m.target_role === 'ColumnRole.TOTAL_COUNT' ||
          m.target_role === 'non_defective_count' || m.target_role === 'ColumnRole.NON_DEFECTIVE_COUNT') {
        return { ...m, target_role: 'ignore', confidence: 0.5 };
      }
      return m;
    }));
  };
  
  const handleDenominatorTypeChange = (type: 'total' | 'non_defective') => {
    setDenominatorType(type);
    // Update the denominator column mapping if one is selected
    if (denominatorColumn) {
      const targetRole = type === 'total' ? 'total_count' : 'non_defective_count';
      setEditedMappings(prev => prev.map(m => {
        if (m.source_column === denominatorColumn) {
          return { ...m, target_role: targetRole, confidence: 1.0 };
        }
        return m;
      }));
    }
  };

  const toggleColumnExpand = (column: string) => {
    setExpandedColumns(prev => {
      const next = new Set(prev);
      if (next.has(column)) {
        next.delete(column);
      } else {
        next.add(column);
      }
      return next;
    });
  };

  const handleApply = () => {
    onApply(editedMappings, selectedCase);
  };

  // ============================================
  // VALIDATION
  // ============================================

  const validationErrors = [];
  const mappedRoles = new Set(editedMappings.filter(m => m.target_role !== 'ignore').map(m => m.target_role));

  // Must have supplier
  if (!mappedRoles.has('supplier') && !mappedRoles.has('ColumnRole.SUPPLIER')) {
    validationErrors.push('Une colonne doit être mappée à "Fournisseur"');
  }

  // Case-specific validation
  if (selectedCase === 'delay_only') {
    const hasDatePromised = mappedRoles.has('date_promised') || mappedRoles.has('ColumnRole.DATE_PROMISED');
    const hasDateDelivered = mappedRoles.has('date_delivered') || mappedRoles.has('ColumnRole.DATE_DELIVERED');
    const hasDelay = mappedRoles.has('delay') || mappedRoles.has('ColumnRole.DELAY');
    const hasDelayDirect = mappedRoles.has('delay_direct') || mappedRoles.has('ColumnRole.DELAY_DIRECT');
    
    if (!hasDatePromised || !hasDateDelivered) {
      if (!hasDelay && !hasDelayDirect) {
        validationErrors.push('Case A nécessite des colonnes de dates ou une colonne de retard');
      }
    }
  } else if (selectedCase === 'defects_only') {
    const hasDefects = mappedRoles.has('defects') || mappedRoles.has('ColumnRole.DEFECTS');
    const hasQuality = mappedRoles.has('quality_score') || mappedRoles.has('ColumnRole.QUALITY_SCORE');
    const hasDefectiveCount = mappedRoles.has('defective_count') || mappedRoles.has('ColumnRole.DEFECTIVE_COUNT');
    const hasTotalCount = mappedRoles.has('total_count') || mappedRoles.has('ColumnRole.TOTAL_COUNT');
    const hasNonDefective = mappedRoles.has('non_defective_count') || mappedRoles.has('ColumnRole.NON_DEFECTIVE_COUNT');
    
    // Valid if: has direct defects, OR has quality score, OR has defective counts with denominator
    const hasDefectCounts = hasDefectiveCount && (hasTotalCount || hasNonDefective);
    
    if (!hasDefects && !hasQuality && !hasDefectCounts) {
      if (needsDefectCountConfig) {
        // Specific validation for defect count configuration
        if (!defectiveColumn) {
          validationErrors.push('Veuillez sélectionner la colonne des pièces défectueuses');
        }
        if (!denominatorColumn) {
          validationErrors.push('Veuillez sélectionner la colonne du total ou des pièces conformes');
        }
      } else {
        validationErrors.push('Case B nécessite une colonne de défauts, de qualité, ou des comptages de pièces');
      }
    }
  } else if (selectedCase === 'mixed') {
    const hasDelayInfo = mappedRoles.has('delay') || mappedRoles.has('delay_direct') ||
      mappedRoles.has('ColumnRole.DELAY') || mappedRoles.has('ColumnRole.DELAY_DIRECT') ||
      (mappedRoles.has('date_promised') && mappedRoles.has('date_delivered')) ||
      (mappedRoles.has('ColumnRole.DATE_PROMISED') && mappedRoles.has('ColumnRole.DATE_DELIVERED'));
    
    const hasDefectInfo = mappedRoles.has('defects') || mappedRoles.has('quality_score') ||
      mappedRoles.has('ColumnRole.DEFECTS') || mappedRoles.has('ColumnRole.QUALITY_SCORE') ||
      (mappedRoles.has('defective_count') && (mappedRoles.has('total_count') || mappedRoles.has('non_defective_count'))) ||
      (mappedRoles.has('ColumnRole.DEFECTIVE_COUNT') && (mappedRoles.has('ColumnRole.TOTAL_COUNT') || mappedRoles.has('ColumnRole.NON_DEFECTIVE_COUNT')));
    
    if (!hasDelayInfo || !hasDefectInfo) {
      validationErrors.push('Case C nécessite des données de retard ET de défauts');
    }
  }

  const canApply = validationErrors.length === 0;

  // ============================================
  // RENDER
  // ============================================

  // Filter to show important mappings first
  const importantMappings = editedMappings.filter(m => m.target_role !== 'ignore' || m.confidence < 0.5);
  const otherMappings = editedMappings.filter(m => m.target_role === 'ignore' && m.confidence >= 0.5);
  const displayMappings = showAllColumns ? editedMappings : importantMappings;

  return (
    <div className="bg-white rounded-lg shadow-lg max-w-4xl mx-auto">
      {/* Header */}
      <div className="p-6 border-b border-gray-200">
        <div className="flex items-center gap-3 mb-2">
          <Zap className="w-6 h-6 text-yellow-500" />
          <h2 className="text-xl font-bold text-gray-900">Mapping Intelligent des Colonnes</h2>
        </div>
        <p className="text-gray-600">
          L'IA a analysé votre fichier et suggère les mappings ci-dessous. Vous pouvez les modifier avant d'importer.
        </p>
      </div>

      {/* Issues Section */}
      {analysis.issues.length > 0 && (
        <div className="p-4 border-b border-gray-200">
          <h3 className="text-sm font-medium text-gray-700 mb-2">Avertissements</h3>
          <div className="space-y-2">
            {analysis.issues.map((issue, idx) => (
              <div 
                key={idx} 
                className={`flex items-start gap-2 p-2 rounded border ${getSeverityColor(issue.severity)}`}
              >
                {getSeverityIcon(issue.severity)}
                <span className="text-sm">{issue.message}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Case Selection */}
      <div className="p-4 border-b border-gray-200 bg-gray-50">
        <h3 className="text-sm font-medium text-gray-700 mb-3">Type de Données Détecté</h3>
        <div className="grid grid-cols-3 gap-3">
          {CASE_TYPES.map(caseType => (
            <button
              key={caseType.value}
              onClick={() => setSelectedCase(caseType.value)}
              className={`p-3 rounded-lg border-2 text-left transition-all ${
                selectedCase === caseType.value
                  ? `border-${caseType.color}-500 bg-${caseType.color}-50`
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <div className="font-medium text-gray-900">{caseType.label}</div>
              <div className="text-xs text-gray-500">{caseType.description}</div>
            </button>
          ))}
        </div>
        {analysis.detected_case && selectedCase !== analysis.detected_case && (
          <div className="mt-2 text-sm text-yellow-600 flex items-center gap-1">
            <AlertTriangle className="w-4 h-4" />
            Le cas sélectionné diffère du cas détecté automatiquement
          </div>
        )}
      </div>

      {/* Recommendation */}
      <div className="p-4 bg-blue-50 border-b border-blue-100">
        <div className="flex items-center gap-2 text-blue-700">
          <Info className="w-5 h-5" />
          <span className="font-medium">{analysis.recommendation}</span>
        </div>
      </div>

      {/* Defect Count Configuration - Case B Variant */}
      {needsDefectCountConfig && selectedCase === 'defects_only' && (
        <div className="p-4 border-b border-gray-200 bg-purple-50">
          <div className="flex items-center gap-3 mb-4">
            <Calculator className="w-6 h-6 text-purple-600" />
            <div>
              <h3 className="text-lg font-semibold text-purple-900">Configuration du Calcul des Défauts</h3>
              <p className="text-sm text-purple-700">
                L'IA a détecté des colonnes de comptage. Le taux de défauts sera calculé automatiquement.
              </p>
            </div>
          </div>
          
          {/* Explanation Banner */}
          <div className="mb-4 p-3 bg-white rounded-lg border border-purple-200">
            <div className="flex items-start gap-2">
              <Info className="w-5 h-5 text-purple-500 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-purple-800">
                <p className="font-medium mb-1">Comment ça fonctionne :</p>
                <ul className="list-disc list-inside space-y-1 text-purple-700">
                  <li>L'IA identifie les colonnes contenant des comptages</li>
                  <li>Vous confirmez la sélection des colonnes ci-dessous</li>
                  <li><strong>Le calcul est effectué par le backend Python</strong> (pas par l'IA)</li>
                  <li>Formule : <code className="bg-purple-100 px-1 rounded">défauts = pièces défectueuses / total</code></li>
                  <li>Le résultat sera normalisé entre 0 et 1</li>
                </ul>
              </div>
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Defective Items Column */}
            <div className="bg-white p-4 rounded-lg border border-purple-200">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <span className="flex items-center gap-2">
                  <span className="text-xl">❌</span>
                  Colonne des pièces défectueuses
                </span>
              </label>
              <select
                value={defectiveColumn}
                onChange={(e) => handleDefectiveColumnChange(e.target.value)}
                className={`w-full px-3 py-2 border rounded-lg ${
                  defectiveColumn ? 'border-green-500 bg-green-50' : 'border-gray-300'
                }`}
              >
                <option value="">-- Sélectionner une colonne --</option>
                {numericColumns.map(col => (
                  <option key={col} value={col} disabled={col === denominatorColumn}>
                    {col}
                  </option>
                ))}
              </select>
              {defectiveColumn && (
                <p className="mt-1 text-xs text-green-600 flex items-center gap-1">
                  <Check className="w-3 h-3" /> Sélectionné
                </p>
              )}
            </div>
            
            {/* Total/Non-Defective Column */}
            <div className="bg-white p-4 rounded-lg border border-purple-200">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <span className="flex items-center gap-2">
                  <span className="text-xl">📊</span>
                  Colonne de référence (dénominateur)
                </span>
              </label>
              
              {/* Denominator Type Toggle */}
              <div className="flex gap-2 mb-2">
                <button
                  type="button"
                  onClick={() => handleDenominatorTypeChange('total')}
                  className={`flex-1 px-3 py-1.5 text-xs rounded border transition-colors ${
                    denominatorType === 'total'
                      ? 'bg-purple-600 text-white border-purple-600'
                      : 'bg-white text-gray-600 border-gray-300 hover:border-purple-300'
                  }`}
                >
                  Total pièces
                </button>
                <button
                  type="button"
                  onClick={() => handleDenominatorTypeChange('non_defective')}
                  className={`flex-1 px-3 py-1.5 text-xs rounded border transition-colors ${
                    denominatorType === 'non_defective'
                      ? 'bg-purple-600 text-white border-purple-600'
                      : 'bg-white text-gray-600 border-gray-300 hover:border-purple-300'
                  }`}
                >
                  Pièces conformes
                </button>
              </div>
              
              <select
                value={denominatorColumn}
                onChange={(e) => handleDenominatorColumnChange(e.target.value)}
                className={`w-full px-3 py-2 border rounded-lg ${
                  denominatorColumn ? 'border-green-500 bg-green-50' : 'border-gray-300'
                }`}
              >
                <option value="">-- Sélectionner une colonne --</option>
                {numericColumns.map(col => (
                  <option key={col} value={col} disabled={col === defectiveColumn}>
                    {col}
                  </option>
                ))}
              </select>
              {denominatorColumn && (
                <p className="mt-1 text-xs text-green-600 flex items-center gap-1">
                  <Check className="w-3 h-3" /> Sélectionné ({denominatorType === 'total' ? 'Total' : 'Conformes'})
                </p>
              )}
            </div>
          </div>
          
          {/* Formula Preview */}
          {defectiveColumn && denominatorColumn && (
            <div className="mt-4 p-3 bg-green-50 rounded-lg border border-green-200">
              <div className="flex items-center gap-2 text-green-800">
                <Check className="w-5 h-5" />
                <span className="font-medium">Formule appliquée :</span>
                <code className="bg-white px-2 py-1 rounded text-sm">
                  défauts = {defectiveColumn} / {denominatorType === 'total' ? denominatorColumn : `(${defectiveColumn} + ${denominatorColumn})`}
                </code>
              </div>
              <p className="mt-1 text-xs text-green-600">
                Le calcul sera effectué par le backend Python de manière déterministe et reproductible.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Column Mappings */}
      <div className="p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-medium text-gray-700">
            Mappings des Colonnes ({editedMappings.length} colonnes)
          </h3>
          <button
            onClick={() => setShowAllColumns(!showAllColumns)}
            className="text-sm text-blue-600 hover:text-blue-800"
          >
            {showAllColumns ? 'Masquer les colonnes ignorées' : `Afficher toutes (${otherMappings.length} ignorées)`}
          </button>
        </div>

        <div className="space-y-3">
          {displayMappings.map(mapping => (
            <div 
              key={mapping.source_column}
              className="border rounded-lg overflow-hidden"
            >
              {/* Mapping Row */}
              <div className="flex items-center gap-4 p-3 bg-white">
                {/* Source Column */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-medium text-gray-900 truncate">
                      {mapping.source_column}
                    </span>
                    <span className="text-xs text-gray-500 px-1.5 py-0.5 bg-gray-100 rounded">
                      {mapping.detected_type}
                    </span>
                  </div>
                  <div className="text-xs text-gray-500 truncate">
                    Ex: {mapping.sample_values.slice(0, 3).join(', ')}
                  </div>
                </div>

                {/* Arrow */}
                <ArrowRight className="w-5 h-5 text-gray-400 flex-shrink-0" />

                {/* Target Role Selector */}
                <div className="flex-1 min-w-0">
                  <select
                    value={mapping.target_role}
                    onChange={(e) => handleMappingChange(mapping.source_column, e.target.value)}
                    className={`w-full px-3 py-2 border rounded-lg text-sm ${
                      mapping.target_role === 'ignore' 
                        ? 'bg-gray-50 text-gray-500' 
                        : 'bg-white text-gray-900'
                    }`}
                  >
                    {TARGET_ROLES.map(role => (
                      <option key={role.value} value={role.value}>
                        {role.icon} {role.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Confidence Badge */}
                <div className="flex-shrink-0">
                  <span className={`text-xs px-2 py-1 rounded-full font-medium ${getConfidenceColor(mapping.confidence)}`}>
                    {getConfidenceLabel(mapping.confidence)} ({Math.round(mapping.confidence * 100)}%)
                  </span>
                </div>

                {/* Expand Button */}
                <button
                  onClick={() => toggleColumnExpand(mapping.source_column)}
                  className="p-1 text-gray-400 hover:text-gray-600"
                >
                  {expandedColumns.has(mapping.source_column) 
                    ? <ChevronUp className="w-5 h-5" />
                    : <ChevronDown className="w-5 h-5" />
                  }
                </button>
              </div>

              {/* Expanded Details */}
              {expandedColumns.has(mapping.source_column) && (
                <div className="p-3 bg-gray-50 border-t text-sm">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <span className="text-gray-500">Raison du mapping:</span>
                      <p className="text-gray-700">{mapping.reasoning}</p>
                    </div>
                    {mapping.transformation_needed && (
                      <div>
                        <span className="text-gray-500">Transformation requise:</span>
                        <p className="text-blue-600">{mapping.transformation_needed}</p>
                      </div>
                    )}
                    <div>
                      <span className="text-gray-500">Valeurs exemple:</span>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {mapping.sample_values.slice(0, 5).map((v, i) => (
                          <span key={i} className="px-2 py-0.5 bg-gray-200 rounded text-xs">
                            {v}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Validation Errors */}
      {validationErrors.length > 0 && (
        <div className="p-4 border-t border-red-100 bg-red-50">
          <h4 className="text-sm font-medium text-red-700 mb-2">Erreurs de validation</h4>
          <ul className="list-disc list-inside text-sm text-red-600 space-y-1">
            {validationErrors.map((error, idx) => (
              <li key={idx}>{error}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Footer Actions */}
      <div className="p-4 border-t border-gray-200 bg-gray-50 flex items-center justify-between">
        <button
          onClick={onCancel}
          className="px-4 py-2 text-gray-700 hover:text-gray-900"
          disabled={loading}
        >
          Annuler
        </button>

        <div className="flex items-center gap-3">
          <div className="text-sm text-gray-500">
            {editedMappings.filter(m => m.target_role !== 'ignore').length} colonnes mappées
          </div>
          <button
            onClick={handleApply}
            disabled={!canApply || loading}
            className={`flex items-center gap-2 px-6 py-2 rounded-lg font-medium transition-colors ${
              canApply && !loading
                ? 'bg-blue-600 text-white hover:bg-blue-700'
                : 'bg-gray-300 text-gray-500 cursor-not-allowed'
            }`}
          >
            {loading ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                Traitement...
              </>
            ) : (
              <>
                <Check className="w-4 h-4" />
                Appliquer et Importer
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
