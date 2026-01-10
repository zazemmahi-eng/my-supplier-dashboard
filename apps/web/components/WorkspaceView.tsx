'use client';
/**
 * WorkspaceView Component
 * 
 * Main view for a single workspace.
 * Handles data upload, model selection, KPI management,
 * visualization, and report export.
 */

import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell
} from 'recharts';
import {
  Upload, ArrowLeft, Database, Settings, FileText, Download,
  AlertCircle, CheckCircle, TrendingUp, TrendingDown, Activity,
  BarChart3, PieChart as PieChartIcon, Filter, Plus, X, Trash2,
  Zap, RefreshCw, FileSpreadsheet, Table
} from 'lucide-react';
import LLMColumnMapper from './LLMColumnMapper';

const API_BASE_URL = process.env.NEXT_PUBLIC_SUPPLIER_API_URL ?? 'http://127.0.0.1:8000';

// ============================================
// TYPE DEFINITIONS
// ============================================

interface WorkspaceInfo {
  workspace: {
    id: string;
    name: string;
    description: string | null;
    data_type: string;
    status: string;
  };
  dataset: {
    has_data: boolean;
    filename: string | null;
    row_count: number;
    suppliers: string[];
    date_range: { start: string; end: string } | null;
  };
  model_selection: {
    selected_model: string;
    parameters: Record<string, any>;
  };
  schema: {
    required: string[];
    types: Record<string, string>;
  };
  custom_kpis: Array<{
    id: string;
    name: string;
    formula_type: string;
    target_field: string;
    unit: string;
  }>;
}

interface DashboardData {
  kpis_globaux: Record<string, number>;
  custom_kpis: Record<string, number>;
  suppliers: Array<Record<string, any>>;
  predictions: Array<{
    supplier: string;
    predicted_defect: number | null;  // null for Case A (delay only)
    predicted_delay: number | null;   // null for Case B (defects only)
    // Individual model predictions for comparison
    method_ma_defect?: number;
    method_ma_delay?: number;
    method_lr_defect?: number;
    method_lr_delay?: number;
    method_exp_defect?: number;
    method_exp_delay?: number;
    confiance: string;
    nb_commandes_historique?: number;
  }>;
  // Recommended actions computed by backend based on supplier risk analysis
  // Each action includes supplier, priority (high/medium/low), action description, etc.
  actions: Array<{
    supplier: string;
    action: string;
    priority: 'high' | 'medium' | 'low';
    raison: string;
    delai: string;
    impact: string;
  }>;
  distribution: Record<string, any>;
  selected_model: string;
  // Case-specific metadata
  data_type: string;           // "delays" | "late_days" | "mixed"
  case_type: string;           // "delay_only" | "defects_only" | "mixed"
  case_description: string;    // Human-readable description of the case
}

interface Model {
  id: string;
  name: string;
  description: string;
  parameters: Array<{
    name: string;
    type: string;
    default: number;
    min?: number;
    max?: number;
  }>;
}

// ============================================
// PROPS
// ============================================

interface WorkspaceViewProps {
  workspaceId: string;
  workspaceName: string;
  onBack: () => void;
}

// Colors for charts
const COLORS = {
  faible: '#10b981',
  modere: '#f59e0b',
  eleve: '#ef4444',
  good: '#10b981',
  warning: '#f59e0b',
  alert: '#ef4444'
};

// ============================================
// MAIN COMPONENT
// ============================================

export default function WorkspaceView({ workspaceId, workspaceName, onBack }: WorkspaceViewProps) {
  // Core state
  const [workspaceInfo, setWorkspaceInfo] = useState<WorkspaceInfo | null>(null);
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [availableModels, setAvailableModels] = useState<Model[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Dashboard activation state - controls when visualizations are loaded
  // Dashboard is NOT loaded until user explicitly activates it
  const [dashboardActivated, setDashboardActivated] = useState(false);
  const [loadingDashboard, setLoadingDashboard] = useState(false);
  const [dashboardError, setDashboardError] = useState<string | null>(null);

  // UI state - default to 'setup' tab (metadata view) instead of 'overview'
  const [activeTab, setActiveTab] = useState<'setup' | 'overview' | 'predictions' | 'models' | 'kpis' | 'export'>('setup');
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  
  // Filter state
  const [selectedSupplier, setSelectedSupplier] = useState<string>('all');
  
  // Model selection state
  const [selectedModel, setSelectedModel] = useState<string>('combined');
  const [modelParams, setModelParams] = useState<Record<string, any>>({ fenetre: 3 });
  
  // Multi-model comparison mode state
  // When enabled, all 3 models run simultaneously for side-by-side comparison
  const [multiModelMode, setMultiModelMode] = useState<boolean>(false);
  // Track which models are visible in comparison view (user can toggle each)
  const [visibleModels, setVisibleModels] = useState<{
    moving_average: boolean;
    linear_regression: boolean;
    exponential: boolean;
  }>({
    moving_average: true,
    linear_regression: true,
    exponential: true
  });

  // Custom KPI state
  const [showKPIModal, setShowKPIModal] = useState(false);
  const [newKPI, setNewKPI] = useState({
    name: '',
    description: '',
    formula_type: 'average',
    target_field: 'defects',
    unit: '%'
  });

  // LLM Column Mapping state - for intelligent CSV ingestion
  const [showLLMMapper, setShowLLMMapper] = useState(false);
  const [llmAnalysis, setLLMAnalysis] = useState<any>(null);
  const [llmCsvContent, setLLMCsvContent] = useState<string>('');
  const [llmFilename, setLLMFilename] = useState<string>('');
  const [applyingMappings, setApplyingMappings] = useState(false);

  // Export state
  const [exportLoading, setExportLoading] = useState(false);
  const [showExportOptions, setShowExportOptions] = useState(false);

  // Multi-model comparison data state
  const [multiModelData, setMultiModelData] = useState<any>(null);
  const [loadingMultiModel, setLoadingMultiModel] = useState(false);

  // ============================================
  // DATA FETCHING
  // ============================================

  const fetchWorkspaceInfo = useCallback(async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/api/workspaces/${workspaceId}`);
      setWorkspaceInfo(response.data);
      setSelectedModel(response.data.model_selection?.selected_model || 'combined');
      setModelParams(response.data.model_selection?.parameters || { fenetre: 3 });
    } catch (err) {
      console.error('Error fetching workspace info:', err);
      setError('Impossible de charger les informations du workspace');
    }
  }, [workspaceId]);

  // Fetch dashboard data - only called when user explicitly activates dashboard
  // Returns true if successful, false if failed (for proper state handling)
  const fetchDashboardData = useCallback(async (): Promise<boolean> => {
    setLoadingDashboard(true);
    setDashboardError(null); // Clear any previous error
    try {
      const response = await axios.get(`${API_BASE_URL}/api/workspaces/${workspaceId}/analysis/dashboard`);
      setDashboardData(response.data);
      setDashboardActivated(true); // Mark dashboard as activated after successful load
      return true; // Success
    } catch (err) {
      // Extract error message from response
      let errorMsg = 'Erreur lors du chargement du dashboard';
      if (axios.isAxiosError(err) && err.response?.data?.detail) {
        errorMsg = err.response.data.detail;
      }
      console.error('Dashboard fetch error:', errorMsg);
      setDashboardError(errorMsg);
      setDashboardActivated(false); // Ensure dashboard is not marked as activated on error
      return false; // Failed
    } finally {
      setLoadingDashboard(false);
    }
  }, [workspaceId]);

  const fetchAvailableModels = useCallback(async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/api/workspaces/${workspaceId}/models`);
      setAvailableModels(response.data.models);
    } catch (err) {
      console.error('Error fetching models:', err);
    }
  }, [workspaceId]);

  // Initial load: only fetch workspace metadata and models
  // Dashboard data is NOT fetched until user explicitly activates it
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      await Promise.all([
        fetchWorkspaceInfo(),
        fetchAvailableModels()
      ]);
      // Note: fetchDashboardData() is NOT called here - user must explicitly activate dashboard
      setLoading(false);
    };
    loadData();
  }, [fetchWorkspaceInfo, fetchAvailableModels]);

  // ============================================
  // ACTIONS
  // ============================================

  // Standard file upload (original method)
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.csv')) {
      setUploadError('Format invalide. Veuillez uploader un fichier CSV.');
      return;
    }

    setUploading(true);
    setUploadError(null);

    try {
      const formData = new FormData();
      formData.append('file', file);

      await axios.post(`${API_BASE_URL}/api/workspaces/${workspaceId}/upload`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      // Refresh data
      await fetchWorkspaceInfo();
      await fetchDashboardData();
    } catch (err) {
      if (axios.isAxiosError(err)) {
        const detail = err.response?.data?.detail;
        if (typeof detail === 'object' && detail.errors) {
          setUploadError(detail.errors.join('\n'));
        } else {
          setUploadError(detail || 'Erreur lors du téléchargement');
        }
      } else {
        setUploadError('Erreur inconnue');
      }
    } finally {
      setUploading(false);
    }
  };

  // Smart upload with LLM-based column mapping
  // Step 1: Analyze the CSV and show mapping suggestions
  const handleSmartUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.csv')) {
      setUploadError('Format invalide. Veuillez uploader un fichier CSV.');
      return;
    }

    setUploading(true);
    setUploadError(null);

    try {
      const formData = new FormData();
      formData.append('file', file);

      // Call the analyze endpoint
      const response = await axios.post(
        `${API_BASE_URL}/api/workspaces/${workspaceId}/upload/analyze`, 
        formData,
        { headers: { 'Content-Type': 'multipart/form-data' } }
      );

      // Store analysis results and show mapper
      setLLMAnalysis(response.data.analysis);
      setLLMCsvContent(response.data.csv_content);
      setLLMFilename(response.data.filename || file.name);
      setShowLLMMapper(true);
    } catch (err) {
      if (axios.isAxiosError(err)) {
        const detail = err.response?.data?.detail;
        setUploadError(typeof detail === 'string' ? detail : 'Erreur lors de l\'analyse');
      } else {
        setUploadError('Erreur inconnue');
      }
    } finally {
      setUploading(false);
    }
  };

  // Step 2: Apply user-approved mappings and import data
  const handleApplyMappings = async (mappings: any[], targetCase: string) => {
    setApplyingMappings(true);
    setUploadError(null);

    try {
      // Build query parameters
      const params = new URLSearchParams({
        csv_content: llmCsvContent,
        mappings: JSON.stringify(mappings),
        target_case: targetCase,
        filename: llmFilename
      });

      const response = await axios.post(
        `${API_BASE_URL}/api/workspaces/${workspaceId}/upload/apply-mappings?${params.toString()}`
      );

      if (response.data.success) {
        // Close mapper and refresh
        setShowLLMMapper(false);
        setLLMAnalysis(null);
        await fetchWorkspaceInfo();
        await fetchDashboardData();
        
        // Show success message with transformations
        if (response.data.warnings?.length > 0) {
          alert(`Import réussi avec avertissements:\n${response.data.warnings.join('\n')}`);
        }
      } else {
        setUploadError(response.data.errors?.join('\n') || 'Erreur de normalisation');
      }
    } catch (err) {
      if (axios.isAxiosError(err)) {
        const detail = err.response?.data?.detail;
        setUploadError(typeof detail === 'string' ? detail : 'Erreur lors de l\'import');
      } else {
        setUploadError('Erreur inconnue');
      }
    } finally {
      setApplyingMappings(false);
    }
  };

  // Fetch multi-model comparison data
  const fetchMultiModelData = async () => {
    setLoadingMultiModel(true);
    try {
      const supplierParam = selectedSupplier !== 'all' ? `&supplier=${encodeURIComponent(selectedSupplier)}` : '';
      const response = await axios.get(
        `${API_BASE_URL}/api/workspaces/${workspaceId}/analysis/multi-model?models=all${supplierParam}`
      );
      setMultiModelData(response.data);
    } catch (err) {
      console.error('Error fetching multi-model data:', err);
    } finally {
      setLoadingMultiModel(false);
    }
  };

  // Export handlers
  const handleExportExcel = async (includeAll: boolean = true) => {
    setExportLoading(true);
    try {
      const supplierParam = selectedSupplier !== 'all' ? `&supplier=${encodeURIComponent(selectedSupplier)}` : '';
      const response = await axios.get(
        `${API_BASE_URL}/api/workspaces/${workspaceId}/export/excel?include_dashboard=${includeAll}&include_predictions=${includeAll}&include_actions=${includeAll}${supplierParam}`,
        { responseType: 'blob' }
      );

      // Create download link
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      const timestamp = new Date().toISOString().slice(0, 10);
      const supplierSuffix = selectedSupplier !== 'all' ? `_${selectedSupplier}` : '';
      link.setAttribute('download', `workspace_${workspaceName}${supplierSuffix}_${timestamp}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Excel export error:', err);
      alert('Erreur lors de l\'export Excel');
    } finally {
      setExportLoading(false);
    }
  };

  const handleExportCSV = async (dataType: string) => {
    setExportLoading(true);
    try {
      const supplierParam = selectedSupplier !== 'all' ? `&supplier=${encodeURIComponent(selectedSupplier)}` : '';
      const response = await axios.get(
        `${API_BASE_URL}/api/workspaces/${workspaceId}/export/csv?data_type=${dataType}${supplierParam}`,
        { responseType: 'blob' }
      );

      // Create download link
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      const timestamp = new Date().toISOString().slice(0, 10);
      const supplierSuffix = selectedSupplier !== 'all' ? `_${selectedSupplier}` : '';
      link.setAttribute('download', `${dataType}_${workspaceName}${supplierSuffix}_${timestamp}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('CSV export error:', err);
      alert('Erreur lors de l\'export CSV');
    } finally {
      setExportLoading(false);
    }
  };

  const handleExportReport = async () => {
    setExportLoading(true);
    try {
      const supplierParam = selectedSupplier !== 'all' ? `?supplier=${encodeURIComponent(selectedSupplier)}` : '';
      const response = await axios.get(
        `${API_BASE_URL}/api/workspaces/${workspaceId}/export/report${supplierParam}`
      );

      // Download as JSON
      const dataStr = JSON.stringify(response.data, null, 2);
      const blob = new Blob([dataStr], { type: 'application/json' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const timestamp = new Date().toISOString().slice(0, 10);
      const supplierSuffix = selectedSupplier !== 'all' ? `_${selectedSupplier}` : '';
      link.setAttribute('download', `report_${workspaceName}${supplierSuffix}_${timestamp}.json`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Report export error:', err);
      alert('Erreur lors de l\'export du rapport');
    } finally {
      setExportLoading(false);
    }
  };

  const handleModelChange = async (modelId: string) => {
    try {
      await axios.put(`${API_BASE_URL}/api/workspaces/${workspaceId}/model-selection`, {
        selected_model: modelId,
        parameters: modelParams
      });
      setSelectedModel(modelId);
      // Only refresh dashboard if it was already activated by user
      if (dashboardActivated) {
        await fetchDashboardData();
      }
    } catch (err) {
      console.error('Error updating model:', err);
    }
  };

  // Explicit action to activate and load the dashboard
  // Called when user clicks "Load Dashboard" or selects visualization tabs
  // Returns true if dashboard was successfully loaded
  const handleActivateDashboard = useCallback(async (): Promise<boolean> => {
    // Check if data exists before attempting to load
    if (!workspaceInfo?.dataset?.has_data) {
      setDashboardError('Aucune donnée disponible. Veuillez d\'abord uploader un dataset.');
      return false;
    }
    
    // If already activated and data exists, return success
    if (dashboardActivated && dashboardData) {
      return true;
    }
    
    // Fetch dashboard data and return result
    const success = await fetchDashboardData();
    return success;
  }, [workspaceInfo?.dataset?.has_data, dashboardActivated, dashboardData, fetchDashboardData]);

  const handleAddCustomKPI = async () => {
    if (!newKPI.name.trim()) {
      alert('Veuillez entrer un nom pour le KPI');
      return;
    }

    try {
      await axios.post(`${API_BASE_URL}/api/workspaces/${workspaceId}/kpis/custom`, newKPI);
      setShowKPIModal(false);
      setNewKPI({ name: '', description: '', formula_type: 'average', target_field: 'defects', unit: '%' });
      await fetchWorkspaceInfo();
      // Only refresh dashboard if already activated by user
      if (dashboardActivated) {
        await fetchDashboardData();
      }
    } catch (err) {
      console.error('Error adding KPI:', err);
      alert('Erreur lors de l\'ajout du KPI');
    }
  };

  const handleDeleteKPI = async (kpiId: string) => {
    try {
      await axios.delete(`${API_BASE_URL}/api/workspaces/${workspaceId}/kpis/custom/${kpiId}`);
      await fetchWorkspaceInfo();
      // Only refresh dashboard if already activated by user
      if (dashboardActivated) {
        await fetchDashboardData();
      }
    } catch (err) {
      console.error('Error deleting KPI:', err);
    }
  };

  // Handle report export with proper error handling
  // Supports both Excel (.xlsx) and PDF formats
  const handleExport = async (format: 'excel' | 'pdf') => {
    try {
      // Build the query parameter for supplier filter
      // Only add supplier param if a specific supplier is selected (not 'all')
      const supplierParam = selectedSupplier !== 'all' ? `?supplier=${encodeURIComponent(selectedSupplier)}` : '';
      
      // Make the API request with blob response type for file download
      const response = await axios.get(
        `${API_BASE_URL}/api/reports/${workspaceId}/export/${format}${supplierParam}`,
        { 
          responseType: 'blob',
          // Set timeout for large exports
          timeout: 60000,
          // Validate status to handle errors properly
          validateStatus: (status) => status < 500
        }
      );

      // Check if the response is an error (4xx status with JSON body)
      if (response.status >= 400) {
        // Try to parse error message from blob response
        const errorText = await response.data.text();
        try {
          const errorJson = JSON.parse(errorText);
          throw new Error(errorJson.detail || 'Erreur lors de l\'export');
        } catch {
          throw new Error(errorText || 'Erreur lors de l\'export');
        }
      }

      // Create download link for successful response
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      
      // Generate filename with workspace name and timestamp
      const extension = format === 'excel' ? 'xlsx' : 'pdf';
      const timestamp = new Date().toISOString().slice(0, 10); // YYYY-MM-DD format
      const supplierSuffix = selectedSupplier !== 'all' ? `_${selectedSupplier}` : '';
      link.setAttribute('download', `rapport_${workspaceName}${supplierSuffix}_${timestamp}.${extension}`);
      
      document.body.appendChild(link);
      link.click();
      link.remove();
      
      // Clean up the blob URL
      window.URL.revokeObjectURL(url);
      
    } catch (err) {
      console.error('Error exporting:', err);
      
      // Provide specific error messages based on error type
      let errorMessage = 'Erreur lors de l\'export';
      
      if (axios.isAxiosError(err)) {
        // Handle Axios errors with response data
        if (err.response?.data) {
          // If response is a blob, try to parse it
          if (err.response.data instanceof Blob) {
            try {
              const text = await err.response.data.text();
              const json = JSON.parse(text);
              errorMessage = json.detail || errorMessage;
            } catch {
              errorMessage = `Erreur serveur (${err.response.status})`;
            }
          } else if (typeof err.response.data === 'object' && err.response.data.detail) {
            errorMessage = err.response.data.detail;
          }
        } else if (err.code === 'ECONNABORTED') {
          errorMessage = 'Le téléchargement a pris trop de temps. Réessayez avec un filtre de fournisseur.';
        } else if (err.code === 'ERR_NETWORK') {
          errorMessage = 'Erreur réseau. Vérifiez votre connexion et que le serveur est actif.';
        }
      } else if (err instanceof Error) {
        errorMessage = err.message;
      }
      
      alert(errorMessage);
    }
  };

  // ============================================
  // CHART DATA PREPARATION
  // ============================================

  const pieData = dashboardData?.distribution ? [
    { name: 'Faible', value: dashboardData.distribution.faible?.count || 0, color: COLORS.faible },
    { name: 'Modéré', value: dashboardData.distribution.modere?.count || 0, color: COLORS.modere },
    { name: 'Élevé', value: dashboardData.distribution.eleve?.count || 0, color: COLORS.eleve }
  ].filter(d => d.value > 0) : [];

  const barData = dashboardData?.suppliers?.map(s => ({
    name: s.supplier?.substring(0, 12),
    score: s.score_risque,
    fill: COLORS[s.status as keyof typeof COLORS] || '#6b7280'
  })) || [];

  // ============================================
  // CASE-SPECIFIC PREDICTION DATA PREPARATION
  // Case A: Only delay predictions (defects = null)
  // Case B: Only defect predictions (delay = null)
  // Case C: Both predictions
  // ============================================
  const predictionData = dashboardData?.predictions?.map(p => ({
    name: p.supplier?.substring(0, 10),
    // Only include non-null values based on case type
    defauts: p.predicted_defect,
    retards: p.predicted_delay
  })) || [];

  // Multi-model comparison data - includes all 3 model predictions for each supplier
  // Used when multiModelMode is enabled for side-by-side comparison
  const multiModelPredictionData = dashboardData?.predictions?.map(p => ({
    name: p.supplier?.substring(0, 10),
    supplier: p.supplier,
    // Combined (average of all 3) - only include non-null values
    defauts_combined: p.predicted_defect,
    retards_combined: p.predicted_delay,
    // Moving Average predictions
    defauts_ma: p.method_ma_defect ?? p.predicted_defect,
    retards_ma: p.method_ma_delay ?? p.predicted_delay,
    // Linear Regression predictions
    defauts_lr: p.method_lr_defect ?? p.predicted_defect,
    retards_lr: p.method_lr_delay ?? p.predicted_delay,
    // Exponential Smoothing predictions
    defauts_exp: p.method_exp_defect ?? p.predicted_defect,
    retards_exp: p.method_exp_delay ?? p.predicted_delay,
    confiance: p.confiance,
    nb_commandes: p.nb_commandes_historique
  })) || [];

  // Helper to check if current case shows delays
  const showDelays = dashboardData?.case_type !== 'defects_only';
  // Helper to check if current case shows defects
  const showDefects = dashboardData?.case_type !== 'delay_only';

  // ============================================
  // LOADING STATE
  // ============================================

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900">
        <div className="text-center">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-blue-500 border-t-transparent mx-auto"></div>
          <p className="mt-4 text-white">Chargement du workspace...</p>
        </div>
      </div>
    );
  }

  // ============================================
  // NO DATA STATE - Show Upload UI
  // ============================================

  if (!workspaceInfo?.dataset?.has_data) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 p-6">
        <div className="max-w-4xl mx-auto">
          {/* Header */}
          <div className="flex items-center gap-4 mb-8">
            <button
              onClick={onBack}
              className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div>
              <h1 className="text-2xl font-bold text-white">{workspaceName}</h1>
              <p className="text-blue-200">Type: {workspaceInfo?.workspace?.data_type}</p>
            </div>
          </div>

          {/* Upload Card */}
          <div className="bg-white/10 backdrop-blur-sm rounded-2xl border border-white/20 p-8">
            <div className="text-center mb-8">
              <Database className="mx-auto h-16 w-16 text-blue-400 mb-4" />
              <h2 className="text-xl font-semibold text-white mb-2">
                Importer vos données
              </h2>
              <p className="text-gray-300">
                Uploadez un fichier CSV pour commencer l'analyse
              </p>
            </div>

            {/* Schema Info */}
            {workspaceInfo?.schema && (
              <div className="mb-8 p-4 bg-white/5 rounded-lg">
                <h3 className="font-medium text-white mb-3">Format attendu</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-gray-400">
                        <th className="pb-2">Colonne</th>
                        <th className="pb-2">Type</th>
                      </tr>
                    </thead>
                    <tbody className="text-gray-300">
                      {Object.entries(workspaceInfo.schema.types).map(([col, type]) => (
                        <tr key={col}>
                          <td className="py-1 font-mono text-green-400">{col}</td>
                          <td className="py-1">{type}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Upload Zone */}
            <div className="relative">
              <input
                type="file"
                accept=".csv"
                onChange={handleFileUpload}
                disabled={uploading}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              />
              <div className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors ${
                uploading ? 'border-blue-500 bg-blue-500/10' : 'border-white/30 hover:border-blue-400'
              }`}>
                {uploading ? (
                  <div className="flex flex-col items-center">
                    <div className="h-10 w-10 animate-spin rounded-full border-4 border-blue-500 border-t-transparent mb-4" />
                    <p className="text-white">Traitement en cours...</p>
                  </div>
                ) : (
                  <>
                    <Upload className="mx-auto h-10 w-10 text-blue-400 mb-3" />
                    <p className="text-white font-medium">Glissez-déposez ou cliquez pour uploader</p>
                    <p className="text-gray-400 text-sm mt-1">Fichier CSV uniquement</p>
                  </>
                )}
              </div>
            </div>

            {/* Upload Error */}
            {uploadError && (
              <div className="mt-4 p-4 bg-red-500/10 border border-red-500/30 rounded-lg">
                <div className="flex items-start gap-3">
                  <AlertCircle className="h-5 w-5 text-red-400 flex-shrink-0" />
                  <div>
                    <p className="font-medium text-red-300">Erreur de validation</p>
                    <pre className="mt-1 text-sm text-red-200 whitespace-pre-wrap">{uploadError}</pre>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ============================================
  // MAIN DASHBOARD VIEW
  // ============================================

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-blue-50 p-6">
      <div className="max-w-7xl mx-auto">
        
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <button
              onClick={onBack}
              className="p-2 rounded-lg bg-white hover:bg-gray-100 shadow transition-colors"
            >
              <ArrowLeft className="h-5 w-5 text-gray-600" />
            </button>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{workspaceName}</h1>
              <p className="text-gray-500">
                {workspaceInfo?.dataset?.row_count} lignes · {workspaceInfo?.dataset?.suppliers?.length} fournisseurs
              </p>
            </div>
          </div>

          {/* Supplier Filter */}
          <div className="flex items-center gap-3">
            <Filter className="h-5 w-5 text-gray-400" />
            <select
              value={selectedSupplier}
              onChange={(e) => setSelectedSupplier(e.target.value)}
              className="px-4 py-2 rounded-lg border border-gray-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">Tous les fournisseurs</option>
              {workspaceInfo?.dataset?.suppliers?.map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Tab Navigation - Setup tab is always first, visualization tabs require dashboard activation */}
        <div className="flex gap-2 mb-6 flex-wrap">
          {[
            { key: 'setup', icon: Database, label: 'Configuration', requiresDashboard: false },
            { key: 'models', icon: Settings, label: 'Modèles', requiresDashboard: false },
            { key: 'kpis', icon: Activity, label: 'KPIs', requiresDashboard: false },
            { key: 'overview', icon: BarChart3, label: 'Vue générale', requiresDashboard: true },
            { key: 'predictions', icon: TrendingUp, label: 'Prédictions', requiresDashboard: true },
            { key: 'export', icon: Download, label: 'Export', requiresDashboard: true }
          ].map(({ key, icon: Icon, label, requiresDashboard }) => {
            // Calculate high priority actions count for the overview tab badge
            // Respects the selected supplier filter for accurate action count
            const highPriorityActionsCount = key === 'overview' && dashboardData?.actions 
              ? dashboardData.actions.filter(a => 
                  a.priority === 'high' && 
                  (selectedSupplier === 'all' || a.supplier === selectedSupplier)
                ).length 
              : 0;
            
            return (
            <button
              key={key}
              onClick={async () => {
                // If tab requires dashboard and it's not activated, activate it first
                if (requiresDashboard && !dashboardActivated) {
                  await handleActivateDashboard();
                }
                setActiveTab(key as typeof activeTab);
              }}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
                activeTab === key
                  ? 'bg-blue-600 text-white'
                  : requiresDashboard && !dashboardActivated
                    ? 'bg-gray-100 text-gray-400 hover:bg-gray-200' // Dimmed style for unactivated dashboard tabs
                    : 'bg-white text-gray-700 hover:bg-gray-100'
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
              {/* Show high priority actions badge on overview tab */}
              {key === 'overview' && highPriorityActionsCount > 0 && (
                <span className="ml-1 px-1.5 py-0.5 text-xs font-bold bg-red-500 text-white rounded-full">
                  {highPriorityActionsCount}
                </span>
              )}
              {/* Indicator for tabs that will load dashboard */}
              {requiresDashboard && !dashboardActivated && (
                <span className="ml-1 text-xs text-gray-400">•</span>
              )}
            </button>
          )})}
        </div>

        {/* Setup Tab - Shows workspace metadata without loading dashboard */}
        {activeTab === 'setup' && (
          <div className="space-y-6">
            {/* Workspace Metadata Card */}
            <div className="bg-white rounded-xl p-6 shadow">
              <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <Database className="h-5 w-5 text-blue-600" />
                Informations du Workspace
              </h3>
              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <p className="text-sm text-gray-500">Nom</p>
                  <p className="text-lg font-medium text-gray-900">{workspaceInfo?.workspace?.name}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Type de données</p>
                  <p className="text-lg font-medium text-gray-900">{workspaceInfo?.workspace?.data_type}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Statut</p>
                  <span className={`inline-flex px-3 py-1 rounded-full text-sm font-medium ${
                    workspaceInfo?.workspace?.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                  }`}>
                    {workspaceInfo?.workspace?.status}
                  </span>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Modèle sélectionné</p>
                  <p className="text-lg font-medium text-gray-900">{selectedModel}</p>
                </div>
              </div>
            </div>

            {/* Dataset Info Card */}
            <div className="bg-white rounded-xl p-6 shadow">
              <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <FileText className="h-5 w-5 text-green-600" />
                Dataset Actuel
              </h3>
              {workspaceInfo?.dataset?.has_data ? (
                <div className="grid md:grid-cols-3 gap-6">
                  <div>
                    <p className="text-sm text-gray-500">Fichier</p>
                    <p className="font-medium text-gray-900">{workspaceInfo.dataset.filename}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Lignes</p>
                    <p className="text-2xl font-bold text-blue-600">{workspaceInfo.dataset.row_count}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Fournisseurs</p>
                    <p className="text-2xl font-bold text-green-600">{workspaceInfo.dataset.suppliers?.length || 0}</p>
                  </div>
                  <div className="md:col-span-3">
                    <p className="text-sm text-gray-500 mb-2">Période</p>
                    <p className="font-medium text-gray-900">
                      {workspaceInfo.dataset.date_range?.start} → {workspaceInfo.dataset.date_range?.end}
                    </p>
                  </div>
                  <div className="md:col-span-3">
                    <p className="text-sm text-gray-500 mb-2">Fournisseurs</p>
                    <div className="flex flex-wrap gap-2">
                      {workspaceInfo.dataset.suppliers?.map(s => (
                        <span key={s} className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm">{s}</span>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-gray-500">Aucun dataset uploadé</p>
              )}
            </div>

            {/* Upload New Dataset */}
            <div className="bg-white rounded-xl p-6 shadow">
              <h3 className="font-semibold text-gray-900 mb-4">Uploader un nouveau dataset</h3>
              
              {/* Two upload options */}
              <div className="grid md:grid-cols-2 gap-4 mb-4">
                {/* Standard Upload */}
                <div className="relative">
                  <input
                    type="file"
                    accept=".csv"
                    onChange={handleFileUpload}
                    disabled={uploading}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                  />
                  <div className={`border-2 border-dashed rounded-xl p-6 text-center transition-colors h-full ${
                    uploading ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-blue-400'
                  }`}>
                    {uploading ? (
                      <div className="flex flex-col items-center justify-center gap-3">
                        <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
                        <span className="text-blue-600">Traitement en cours...</span>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center gap-3">
                        <Upload className="h-8 w-8 text-gray-400" />
                        <span className="text-gray-700 font-medium">Upload Standard</span>
                        <span className="text-gray-500 text-sm">Format attendu uniquement</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Smart Upload with LLM Mapping */}
                <div className="relative">
                  <input
                    type="file"
                    accept=".csv"
                    onChange={handleSmartUpload}
                    disabled={uploading}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                  />
                  <div className={`border-2 border-dashed rounded-xl p-6 text-center transition-colors h-full ${
                    uploading ? 'border-yellow-500 bg-yellow-50' : 'border-yellow-300 hover:border-yellow-500 bg-gradient-to-br from-yellow-50 to-orange-50'
                  }`}>
                    <div className="flex flex-col items-center justify-center gap-3">
                      <Zap className="h-8 w-8 text-yellow-500" />
                      <span className="text-gray-700 font-medium">Upload Intelligent</span>
                      <span className="text-gray-500 text-sm">L'IA suggère les mappings</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Schema hint */}
              {workspaceInfo?.schema && (
                <div className="mt-4 p-3 bg-gray-50 rounded-lg text-sm">
                  <p className="text-gray-600">
                    <strong>Format attendu:</strong>{' '}
                    {workspaceInfo.schema.required?.join(', ')}
                  </p>
                </div>
              )}

              {uploadError && (
                <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0" />
                    <pre className="text-sm text-red-700 whitespace-pre-wrap">{uploadError}</pre>
                  </div>
                </div>
              )}
            </div>

            {/* Action: Load Dashboard */}
            <div className="bg-gradient-to-r from-blue-600 to-purple-600 rounded-xl p-6 shadow">
              <div className="flex items-center justify-between flex-wrap gap-4">
                <div>
                  <h3 className="font-semibold text-white mb-1">
                    {dashboardActivated ? '✓ Dashboard chargé' : 'Prêt à visualiser ?'}
                  </h3>
                  <p className="text-blue-100 text-sm">
                    {dashboardActivated 
                      ? 'Les données sont prêtes. Utilisez les onglets pour explorer.'
                      : 'Sélectionnez un modèle et chargez le tableau de bord pour voir les analyses et prédictions.'}
                  </p>
                  {/* Show error message if any */}
                  {dashboardError && (
                    <p className="text-red-200 text-sm mt-2">
                      ⚠ {dashboardError}
                    </p>
                  )}
                </div>
                <button
                  onClick={async () => {
                    // Clear error and load dashboard
                    setDashboardError(null);
                    const success = await handleActivateDashboard();
                    // Only switch tab if successful
                    if (success) {
                      setActiveTab('overview');
                    }
                  }}
                  disabled={!workspaceInfo?.dataset?.has_data || loadingDashboard}
                  className={`flex items-center gap-2 px-6 py-3 rounded-lg font-medium transition-colors ${
                    workspaceInfo?.dataset?.has_data
                      ? dashboardActivated 
                        ? 'bg-green-500 text-white hover:bg-green-600'
                        : 'bg-white text-blue-600 hover:bg-blue-50'
                      : 'bg-white/50 text-blue-300 cursor-not-allowed'
                  }`}
                >
                  {loadingDashboard ? (
                    <>
                      <div className="h-5 w-5 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
                      Chargement...
                    </>
                  ) : dashboardActivated ? (
                    <>
                      <CheckCircle className="h-5 w-5" />
                      Voir le Dashboard
                    </>
                  ) : (
                    <>
                      <BarChart3 className="h-5 w-5" />
                      Charger le Dashboard
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Tab Content */}
        {activeTab === 'overview' && dashboardActivated && dashboardData && (
          <div className="space-y-6">
            {/* ============================================
                CASE INDICATOR BANNER
                Shows which case is active and what metrics are displayed
            ============================================ */}
            <div className={`rounded-xl p-4 ${
              dashboardData.case_type === 'delay_only' ? 'bg-blue-50 border border-blue-200' :
              dashboardData.case_type === 'defects_only' ? 'bg-purple-50 border border-purple-200' :
              'bg-green-50 border border-green-200'
            }`}>
              <div className="flex items-center gap-3">
                <span className="text-2xl">
                  {dashboardData.case_type === 'delay_only' ? '📅' :
                   dashboardData.case_type === 'defects_only' ? '🔍' : '📊'}
                </span>
                <div>
                  <h3 className={`font-semibold ${
                    dashboardData.case_type === 'delay_only' ? 'text-blue-800' :
                    dashboardData.case_type === 'defects_only' ? 'text-purple-800' :
                    'text-green-800'
                  }`}>
                    {dashboardData.case_type === 'delay_only' ? 'Case A - Retards Uniquement' :
                     dashboardData.case_type === 'defects_only' ? 'Case B - Défauts Uniquement' :
                     'Case C - Mixte (Retards + Défauts)'}
                  </h3>
                  <p className="text-sm text-gray-600">{dashboardData.case_description}</p>
                </div>
              </div>
            </div>

            {/* ============================================
                CASE-SPECIFIC KPIs GRID
                Case A: Only delay KPIs
                Case B: Only defect KPIs  
                Case C: All KPIs (delay + defects)
            ============================================ */}
            <div className={`grid gap-4 ${
              dashboardData.case_type === 'mixed' ? 'grid-cols-2 md:grid-cols-4' : 'grid-cols-2 md:grid-cols-3'
            }`}>
              {/* CASE A: Delay-only KPIs */}
              {dashboardData.case_type === 'delay_only' && (
                <>
                  <div className="bg-white rounded-xl p-6 shadow border-l-4 border-l-red-500">
                    <p className="text-sm text-gray-500 mb-1">Taux de Retard</p>
                    <p className="text-3xl font-bold text-red-600">{dashboardData.kpis_globaux?.taux_retard || 0}%</p>
                  </div>
                  <div className="bg-white rounded-xl p-6 shadow border-l-4 border-l-blue-500">
                    <p className="text-sm text-gray-500 mb-1">Retard Moyen</p>
                    <p className="text-3xl font-bold text-blue-600">{dashboardData.kpis_globaux?.retard_moyen || 0}j</p>
                  </div>
                  <div className="bg-white rounded-xl p-6 shadow border-l-4 border-l-green-500">
                    <p className="text-sm text-gray-500 mb-1">Taux de Ponctualité</p>
                    <p className="text-3xl font-bold text-green-600">{dashboardData.kpis_globaux?.taux_ponctualite || 0}%</p>
                  </div>
                  <div className="bg-white rounded-xl p-6 shadow">
                    <p className="text-sm text-gray-500 mb-1">Commandes à Temps</p>
                    <p className="text-3xl font-bold text-gray-800">{dashboardData.kpis_globaux?.commandes_a_temps || 0}</p>
                  </div>
                  <div className="bg-white rounded-xl p-6 shadow">
                    <p className="text-sm text-gray-500 mb-1">Commandes en Retard</p>
                    <p className="text-3xl font-bold text-red-500">{dashboardData.kpis_globaux?.nb_retards || 0}</p>
                  </div>
                  <div className="bg-white rounded-xl p-6 shadow">
                    <p className="text-sm text-gray-500 mb-1">Total Commandes</p>
                    <p className="text-3xl font-bold text-gray-600">{dashboardData.kpis_globaux?.nb_commandes || 0}</p>
                  </div>
                </>
              )}

              {/* CASE B: Defects-only KPIs */}
              {dashboardData.case_type === 'defects_only' && (
                <>
                  <div className="bg-white rounded-xl p-6 shadow border-l-4 border-l-orange-500">
                    <p className="text-sm text-gray-500 mb-1">Taux de Défaut</p>
                    <p className="text-3xl font-bold text-orange-600">{dashboardData.kpis_globaux?.taux_defaut || 0}%</p>
                  </div>
                  <div className="bg-white rounded-xl p-6 shadow border-l-4 border-l-purple-500">
                    <p className="text-sm text-gray-500 mb-1">Défaut Moyen</p>
                    <p className="text-3xl font-bold text-purple-600">{dashboardData.kpis_globaux?.defaut_moyen || 0}%</p>
                  </div>
                  <div className="bg-white rounded-xl p-6 shadow border-l-4 border-l-green-500">
                    <p className="text-sm text-gray-500 mb-1">Taux de Conformité</p>
                    <p className="text-3xl font-bold text-green-600">{dashboardData.kpis_globaux?.taux_conformite || 0}%</p>
                  </div>
                  <div className="bg-white rounded-xl p-6 shadow">
                    <p className="text-sm text-gray-500 mb-1">Commandes Conformes</p>
                    <p className="text-3xl font-bold text-gray-800">{dashboardData.kpis_globaux?.commandes_conformes || 0}</p>
                  </div>
                  <div className="bg-white rounded-xl p-6 shadow">
                    <p className="text-sm text-gray-500 mb-1">Commandes Défectueuses</p>
                    <p className="text-3xl font-bold text-orange-500">{dashboardData.kpis_globaux?.nb_defectueux || 0}</p>
                  </div>
                  <div className="bg-white rounded-xl p-6 shadow">
                    <p className="text-sm text-gray-500 mb-1">Total Commandes</p>
                    <p className="text-3xl font-bold text-gray-600">{dashboardData.kpis_globaux?.nb_commandes || 0}</p>
                  </div>
                </>
              )}

              {/* CASE C: Mixed KPIs (both delay and defects) */}
              {dashboardData.case_type === 'mixed' && (
                <>
                  <div className="bg-white rounded-xl p-6 shadow border-l-4 border-l-red-500">
                    <p className="text-sm text-gray-500 mb-1">Taux de Retard</p>
                    <p className="text-3xl font-bold text-red-600">{dashboardData.kpis_globaux?.taux_retard || 0}%</p>
                  </div>
                  <div className="bg-white rounded-xl p-6 shadow border-l-4 border-l-orange-500">
                    <p className="text-sm text-gray-500 mb-1">Taux de Défaut</p>
                    <p className="text-3xl font-bold text-orange-600">{dashboardData.kpis_globaux?.taux_defaut || 0}%</p>
                  </div>
                  <div className="bg-white rounded-xl p-6 shadow border-l-4 border-l-blue-500">
                    <p className="text-sm text-gray-500 mb-1">Retard Moyen</p>
                    <p className="text-3xl font-bold text-blue-600">{dashboardData.kpis_globaux?.retard_moyen || 0}j</p>
                  </div>
                  <div className="bg-white rounded-xl p-6 shadow border-l-4 border-l-green-500">
                    <p className="text-sm text-gray-500 mb-1">Commandes Parfaites</p>
                    <p className="text-3xl font-bold text-green-600">{dashboardData.kpis_globaux?.commandes_parfaites || 0}</p>
                  </div>
                </>
              )}
            </div>

            {/* Custom KPIs */}
            {Object.keys(dashboardData.custom_kpis || {}).length > 0 && (
              <div className="bg-white rounded-xl p-6 shadow">
                <h3 className="font-semibold text-gray-900 mb-4">KPIs Personnalisés</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {Object.entries(dashboardData.custom_kpis).map(([name, value]) => (
                    <div key={name} className="p-4 bg-purple-50 rounded-lg">
                      <p className="text-sm text-purple-600 mb-1">{name}</p>
                      <p className="text-2xl font-bold text-purple-800">{value}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Charts Row */}
            <div className="grid md:grid-cols-2 gap-6">
              {/* Risk Distribution Pie */}
              <div className="bg-white rounded-xl p-6 shadow">
                <h3 className="font-semibold text-gray-900 mb-4">Distribution des Risques</h3>
                <ResponsiveContainer width="100%" height={250}>
                  <PieChart>
                    <Pie
                      data={pieData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius={80}
                      label={({ name, value }) => `${name}: ${value}`}
                    >
                      {pieData.map((entry, index) => (
                        <Cell key={index} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              {/* Risk Scores Bar */}
              <div className="bg-white rounded-xl p-6 shadow">
                <h3 className="font-semibold text-gray-900 mb-4">Scores de Risque</h3>
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={barData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis domain={[0, 100]} />
                    <Tooltip />
                    <Bar dataKey="score" name="Score">
                      {barData.map((entry, index) => (
                        <Cell key={index} fill={entry.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* ============================================
                CASE-SPECIFIC SUPPLIERS TABLE
                Case A: Shows delay metrics only
                Case B: Shows defects metrics only
                Case C: Shows all metrics
            ============================================ */}
            <div className="bg-white rounded-xl shadow overflow-hidden">
              <div className="p-6 border-b">
                <h3 className="font-semibold text-gray-900">
                  Analyse des Fournisseurs
                  <span className="ml-2 text-sm font-normal text-gray-500">
                    ({dashboardData.case_type === 'delay_only' ? 'Retards' :
                      dashboardData.case_type === 'defects_only' ? 'Défauts' : 'Mixte'})
                  </span>
                </h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Fournisseur</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Score</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Niveau</th>
                      {/* Case A: Delay columns only */}
                      {dashboardData.case_type === 'delay_only' && (
                        <>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Retard Moy.</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Taux Retard</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tendance</th>
                        </>
                      )}
                      {/* Case B: Defects columns only */}
                      {dashboardData.case_type === 'defects_only' && (
                        <>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Défaut Moy.</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Taux Défaut</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tendance</th>
                        </>
                      )}
                      {/* Case C: All columns */}
                      {dashboardData.case_type === 'mixed' && (
                        <>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Retard Moy.</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Défauts</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tendance</th>
                        </>
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {dashboardData.suppliers?.slice(0, 10).map((s, i) => (
                      <tr key={i} className="hover:bg-gray-50">
                        <td className="px-6 py-4 font-medium text-gray-900">{s.supplier}</td>
                        <td className="px-6 py-4">
                          <span className={`font-semibold ${
                            s.score_risque > 55 ? 'text-red-600' : s.score_risque > 25 ? 'text-yellow-600' : 'text-green-600'
                          }`}>
                            {s.score_risque}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`px-2 py-1 text-xs rounded-full ${
                            s.niveau_risque === 'Élevé' ? 'bg-red-100 text-red-800' :
                            s.niveau_risque === 'Modéré' ? 'bg-yellow-100 text-yellow-800' :
                            'bg-green-100 text-green-800'
                          }`}>
                            {s.niveau_risque}
                          </span>
                        </td>
                        {/* Case A: Delay data */}
                        {dashboardData.case_type === 'delay_only' && (
                          <>
                            <td className="px-6 py-4">{s.retard_moyen}j</td>
                            <td className="px-6 py-4">{s.taux_retard}%</td>
                            <td className="px-6 py-4">
                              {s.tendance_retards === 'hausse' ? (
                                <TrendingUp className="h-4 w-4 text-red-500" />
                              ) : s.tendance_retards === 'baisse' ? (
                                <TrendingDown className="h-4 w-4 text-green-500" />
                              ) : (
                                <span className="text-gray-400">→</span>
                              )}
                            </td>
                          </>
                        )}
                        {/* Case B: Defects data */}
                        {dashboardData.case_type === 'defects_only' && (
                          <>
                            <td className="px-6 py-4">{s.defaut_moyen}%</td>
                            <td className="px-6 py-4">{s.taux_defaut}%</td>
                            <td className="px-6 py-4">
                              {s.tendance_defauts === 'hausse' ? (
                                <TrendingUp className="h-4 w-4 text-red-500" />
                              ) : s.tendance_defauts === 'baisse' ? (
                                <TrendingDown className="h-4 w-4 text-green-500" />
                              ) : (
                                <span className="text-gray-400">→</span>
                              )}
                            </td>
                          </>
                        )}
                        {/* Case C: All data */}
                        {dashboardData.case_type === 'mixed' && (
                          <>
                            <td className="px-6 py-4">{s.retard_moyen}j</td>
                            <td className="px-6 py-4">{s.taux_defaut}%</td>
                            <td className="px-6 py-4">
                              {(s.tendance_defauts === 'hausse' || s.tendance_retards === 'hausse') ? (
                                <TrendingUp className="h-4 w-4 text-red-500" />
                              ) : (s.tendance_defauts === 'baisse' && s.tendance_retards === 'baisse') ? (
                                <TrendingDown className="h-4 w-4 text-green-500" />
                              ) : (
                                <span className="text-gray-400">→</span>
                              )}
                            </td>
                          </>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* ============================================
                RECOMMENDED ACTIONS SECTION
                Displays actions computed by the backend based on supplier risk analysis.
                Actions are color-coded by priority: high (red), medium (orange), low (blue).
                Updates dynamically when dataset or supplier selection changes.
            ============================================ */}
            {(() => {
              // Filter actions based on selected supplier
              // If 'all' is selected, show all actions; otherwise filter by supplier name
              const filteredActions = dashboardData.actions?.filter(
                action => selectedSupplier === 'all' || action.supplier === selectedSupplier
              ) || [];
              
              return filteredActions.length > 0 ? (
              <div className="bg-white rounded-xl shadow overflow-hidden">
                <div className="p-6 border-b bg-gradient-to-r from-amber-50 to-orange-50">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-amber-100 rounded-lg">
                        <AlertCircle className="h-6 w-6 text-amber-600" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-gray-900">Actions Recommandées</h3>
                        <p className="text-sm text-gray-500">
                          {filteredActions.length} action{filteredActions.length > 1 ? 's' : ''} identifiée{filteredActions.length > 1 ? 's' : ''} 
                          {selectedSupplier !== 'all' && ` pour ${selectedSupplier}`}
                        </p>
                      </div>
                    </div>
                    {/* Priority Legend */}
                    <div className="hidden md:flex items-center gap-4 text-xs">
                      <span className="flex items-center gap-1">
                        <span className="w-3 h-3 rounded-full bg-red-500"></span> Haute
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="w-3 h-3 rounded-full bg-orange-500"></span> Moyenne
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="w-3 h-3 rounded-full bg-blue-500"></span> Basse
                      </span>
                    </div>
                  </div>
                </div>
                
                {/* Actions Grid - Responsive cards layout */}
                <div className="p-6">
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {filteredActions.map((action, index) => {
                      // Determine styling based on priority level
                      const priorityStyles = {
                        high: {
                          border: 'border-l-4 border-l-red-500',
                          bg: 'bg-red-50',
                          badge: 'bg-red-100 text-red-800',
                          icon: 'text-red-500'
                        },
                        medium: {
                          border: 'border-l-4 border-l-orange-500',
                          bg: 'bg-orange-50',
                          badge: 'bg-orange-100 text-orange-800',
                          icon: 'text-orange-500'
                        },
                        low: {
                          border: 'border-l-4 border-l-blue-500',
                          bg: 'bg-blue-50',
                          badge: 'bg-blue-100 text-blue-800',
                          icon: 'text-blue-500'
                        }
                      };
                      
                      const style = priorityStyles[action.priority as keyof typeof priorityStyles] || priorityStyles.medium;
                      
                      return (
                        <div 
                          key={index} 
                          className={`${style.border} ${style.bg} rounded-lg p-4 hover:shadow-md transition-shadow`}
                        >
                          {/* Action Header */}
                          <div className="flex items-start justify-between mb-3">
                            <span className={`px-2 py-1 text-xs font-medium rounded-full ${style.badge}`}>
                              {action.priority === 'high' ? '🔴 Haute' : action.priority === 'medium' ? '🟠 Moyenne' : '🔵 Basse'}
                            </span>
                            <span className="text-xs text-gray-500">{action.delai}</span>
                          </div>
                          
                          {/* Supplier Name */}
                          <p className="text-sm font-semibold text-gray-900 mb-1">
                            {action.supplier}
                          </p>
                          
                          {/* Action Description */}
                          <p className="text-sm text-gray-700 mb-3">
                            {action.action}
                          </p>
                          
                          {/* Action Details */}
                          <div className="space-y-1 text-xs text-gray-500">
                            <p><span className="font-medium">Raison:</span> {action.raison}</p>
                            <p><span className="font-medium">Impact:</span> {action.impact}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
                
                {/* Actions Summary Footer */}
                <div className="px-6 py-4 bg-gray-50 border-t">
                  <div className="flex flex-wrap items-center justify-between gap-4 text-sm">
                    <div className="flex flex-wrap gap-4">
                      <span className="text-gray-600">
                        <span className="font-semibold text-red-600">
                          {filteredActions.filter(a => a.priority === 'high').length}
                        </span> haute priorité
                      </span>
                      <span className="text-gray-600">
                        <span className="font-semibold text-orange-600">
                          {filteredActions.filter(a => a.priority === 'medium').length}
                        </span> moyenne priorité
                      </span>
                      <span className="text-gray-600">
                        <span className="font-semibold text-blue-600">
                          {filteredActions.filter(a => a.priority === 'low').length}
                        </span> basse priorité
                      </span>
                    </div>
                    <p className="text-gray-500">
                      Dernière mise à jour: {new Date().toLocaleTimeString('fr-FR')}
                    </p>
                  </div>
                </div>
              </div>
              ) : (
              /* No Actions Message - shown when no actions are recommended for selected supplier */
              <div className="bg-white rounded-xl p-8 shadow text-center">
                <CheckCircle className="mx-auto h-12 w-12 text-green-500 mb-4" />
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  {selectedSupplier !== 'all' 
                    ? `Aucune action pour ${selectedSupplier}`
                    : 'Aucune action requise'}
                </h3>
                <p className="text-gray-500">
                  {selectedSupplier !== 'all'
                    ? `Le fournisseur ${selectedSupplier} présente des performances satisfaisantes.`
                    : 'Tous vos fournisseurs présentent des performances satisfaisantes.'}
                  {' '}Continuez à surveiller les indicateurs régulièrement.
                </p>
              </div>
              );
            })()}
          </div>
        )}

        {/* Overview Tab - Show loading or prompt if dashboard not activated */}
        {activeTab === 'overview' && !dashboardActivated && (
          <div className="bg-white rounded-xl p-8 shadow text-center">
            <BarChart3 className="mx-auto h-16 w-16 text-gray-300 mb-4" />
            <h3 className="text-xl font-semibold text-gray-700 mb-2">Dashboard non chargé</h3>
            <p className="text-gray-500 mb-6">
              {workspaceInfo?.dataset?.has_data 
                ? 'Cliquez sur le bouton ci-dessous pour charger les visualisations.'
                : 'Veuillez d\'abord uploader un dataset dans l\'onglet Configuration.'}
            </p>
            {/* Error display */}
            {dashboardError && (
              <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-left">
                <div className="flex items-start gap-2">
                  <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-red-700">{dashboardError}</p>
                </div>
              </div>
            )}
            <button
              onClick={async () => {
                // Clear previous error and attempt to load
                setDashboardError(null);
                await handleActivateDashboard();
              }}
              disabled={loadingDashboard || !workspaceInfo?.dataset?.has_data}
              className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 mx-auto"
            >
              {loadingDashboard ? (
                <>
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  Chargement en cours...
                </>
              ) : (
                <>
                  <BarChart3 className="h-5 w-5" />
                  Charger le Dashboard
                </>
              )}
            </button>
          </div>
        )}

        {/* Predictions Tab */}
        {activeTab === 'predictions' && dashboardActivated && dashboardData && (
          <div className="space-y-6">
            {/* ============================================
                CASE INDICATOR FOR PREDICTIONS
                Shows which metrics are being predicted based on case type
            ============================================ */}
            <div className={`rounded-xl p-4 ${
              dashboardData.case_type === 'delay_only' ? 'bg-blue-50 border border-blue-200' :
              dashboardData.case_type === 'defects_only' ? 'bg-purple-50 border border-purple-200' :
              'bg-green-50 border border-green-200'
            }`}>
              <div className="flex items-center gap-3">
                <TrendingUp className={`h-6 w-6 ${
                  dashboardData.case_type === 'delay_only' ? 'text-blue-600' :
                  dashboardData.case_type === 'defects_only' ? 'text-purple-600' :
                  'text-green-600'
                }`} />
                <div>
                  <h3 className={`font-semibold ${
                    dashboardData.case_type === 'delay_only' ? 'text-blue-800' :
                    dashboardData.case_type === 'defects_only' ? 'text-purple-800' :
                    'text-green-800'
                  }`}>
                    Prédictions: {dashboardData.case_type === 'delay_only' ? 'Retards uniquement' :
                                  dashboardData.case_type === 'defects_only' ? 'Défauts uniquement' :
                                  'Retards et Défauts'}
                  </h3>
                  <p className="text-sm text-gray-600">
                    {dashboardData.case_type === 'delay_only' 
                      ? 'Les prédictions de défauts ne sont pas disponibles pour ce type de données.'
                      : dashboardData.case_type === 'defects_only'
                        ? 'Les prédictions de retards ne sont pas disponibles pour ce type de données.'
                        : 'Prédictions complètes pour les deux métriques.'}
                  </p>
                </div>
              </div>
            </div>

            {/* Mode Toggle - Switch between single model and multi-model comparison */}
            <div className="bg-white rounded-xl p-4 shadow">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-gray-900">Mode de Visualisation</h3>
                  <p className="text-sm text-gray-500">
                    {multiModelMode 
                      ? 'Comparaison des 3 modèles côte à côte'
                      : `Modèle unique: ${selectedModel}`}
                  </p>
                </div>
                <button
                  onClick={() => setMultiModelMode(!multiModelMode)}
                  className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                    multiModelMode
                      ? 'bg-purple-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {multiModelMode ? '✓ Multi-Modèles Actif' : 'Activer Multi-Modèles'}
                </button>
              </div>
              
              {/* Model visibility toggles - only shown in multi-model mode */}
              {multiModelMode && (
                <div className="mt-4 pt-4 border-t border-gray-200">
                  <p className="text-sm text-gray-600 mb-3">Modèles visibles :</p>
                  <div className="flex flex-wrap gap-3">
                    <button
                      onClick={() => setVisibleModels(v => ({ ...v, moving_average: !v.moving_average }))}
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                        visibleModels.moving_average
                          ? 'bg-green-100 text-green-800 border-2 border-green-400'
                          : 'bg-gray-100 text-gray-500 border-2 border-transparent'
                      }`}
                    >
                      <div className={`w-3 h-3 rounded-full ${visibleModels.moving_average ? 'bg-green-500' : 'bg-gray-300'}`} />
                      Moyenne Glissante
                    </button>
                    <button
                      onClick={() => setVisibleModels(v => ({ ...v, linear_regression: !v.linear_regression }))}
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                        visibleModels.linear_regression
                          ? 'bg-blue-100 text-blue-800 border-2 border-blue-400'
                          : 'bg-gray-100 text-gray-500 border-2 border-transparent'
                      }`}
                    >
                      <div className={`w-3 h-3 rounded-full ${visibleModels.linear_regression ? 'bg-blue-500' : 'bg-gray-300'}`} />
                      Régression Linéaire
                    </button>
                    <button
                      onClick={() => setVisibleModels(v => ({ ...v, exponential: !v.exponential }))}
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                        visibleModels.exponential
                          ? 'bg-orange-100 text-orange-800 border-2 border-orange-400'
                          : 'bg-gray-100 text-gray-500 border-2 border-transparent'
                      }`}
                    >
                      <div className={`w-3 h-3 rounded-full ${visibleModels.exponential ? 'bg-orange-500' : 'bg-gray-300'}`} />
                      Lissage Exponentiel
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* ============================================
                CASE-SPECIFIC SINGLE MODEL CHART
                Only shows relevant metrics based on case type
            ============================================ */}
            {!multiModelMode && (
              <div className="bg-white rounded-xl p-6 shadow">
                <h3 className="font-semibold text-gray-900 mb-4">
                  Prédictions par Modèle: {selectedModel}
                  <span className="ml-2 text-sm font-normal text-gray-500">
                    ({dashboardData.case_type === 'delay_only' ? 'Retards' :
                      dashboardData.case_type === 'defects_only' ? 'Défauts' : 'Mixte'})
                  </span>
                </h3>
                <ResponsiveContainer width="100%" height={400}>
                  <LineChart data={predictionData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    {/* Only show defects line if case supports it */}
                    {showDefects && (
                      <Line type="monotone" dataKey="defauts" stroke="#ef4444" name="Défauts prédits (%)" strokeWidth={2} />
                    )}
                    {/* Only show delays line if case supports it */}
                    {showDelays && (
                      <Line type="monotone" dataKey="retards" stroke="#3b82f6" name="Retard prédit (j)" strokeWidth={2} />
                    )}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* ============================================
                CASE-SPECIFIC MULTI-MODEL COMPARISON CHARTS
                Only shows charts relevant to the current case type
            ============================================ */}
            {multiModelMode && (
              <>
                {/* Defects Comparison Chart - Only shown for Case B and Case C */}
                {showDefects && (
                <div className="bg-white rounded-xl p-6 shadow">
                  <h3 className="font-semibold text-gray-900 mb-4">
                    Comparaison des Prédictions de Défauts (%)
                  </h3>
                  <ResponsiveContainer width="100%" height={350}>
                    <BarChart data={multiModelPredictionData} barCategoryGap="15%">
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                      <YAxis />
                      <Tooltip 
                        content={({ active, payload, label }) => {
                          if (active && payload && payload.length) {
                            return (
                              <div className="bg-white p-3 border rounded-lg shadow-lg">
                                <p className="font-semibold mb-2">{label}</p>
                                {payload.map((entry, index) => (
                                  <p key={index} style={{ color: entry.color }} className="text-sm">
                                    {entry.name}: {entry.value}%
                                  </p>
                                ))}
                              </div>
                            );
                          }
                          return null;
                        }}
                      />
                      <Legend />
                      {visibleModels.moving_average && (
                        <Bar dataKey="defauts_ma" name="Moy. Glissante" fill="#10b981" />
                      )}
                      {visibleModels.linear_regression && (
                        <Bar dataKey="defauts_lr" name="Régression Lin." fill="#3b82f6" />
                      )}
                      {visibleModels.exponential && (
                        <Bar dataKey="defauts_exp" name="Lissage Exp." fill="#f59e0b" />
                      )}
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                )}

                {/* Delay Comparison Chart - Only shown for Case A and Case C */}
                {showDelays && (
                <div className="bg-white rounded-xl p-6 shadow">
                  <h3 className="font-semibold text-gray-900 mb-4">
                    Comparaison des Prédictions de Retards (jours)
                  </h3>
                  <ResponsiveContainer width="100%" height={350}>
                    <BarChart data={multiModelPredictionData} barCategoryGap="15%">
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                      <YAxis />
                      <Tooltip 
                        content={({ active, payload, label }) => {
                          if (active && payload && payload.length) {
                            return (
                              <div className="bg-white p-3 border rounded-lg shadow-lg">
                                <p className="font-semibold mb-2">{label}</p>
                                {payload.map((entry, index) => (
                                  <p key={index} style={{ color: entry.color }} className="text-sm">
                                    {entry.name}: {entry.value}j
                                  </p>
                                ))}
                              </div>
                            );
                          }
                          return null;
                        }}
                      />
                      <Legend />
                      {visibleModels.moving_average && (
                        <Bar dataKey="retards_ma" name="Moy. Glissante" fill="#10b981" />
                      )}
                      {visibleModels.linear_regression && (
                        <Bar dataKey="retards_lr" name="Régression Lin." fill="#3b82f6" />
                      )}
                      {visibleModels.exponential && (
                        <Bar dataKey="retards_exp" name="Lissage Exp." fill="#f59e0b" />
                      )}
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                )}
              </>
            )}

            {/* ============================================
                CASE-SPECIFIC PREDICTIONS TABLE
                Adapts columns based on case type
            ============================================ */}
            <div className="bg-white rounded-xl shadow overflow-hidden">
              <div className="p-4 border-b bg-gray-50">
                <h3 className="font-semibold text-gray-900">
                  {multiModelMode ? 'Tableau Comparatif Multi-Modèles' : 'Détail des Prédictions'}
                </h3>
              </div>
              <div className="overflow-x-auto">
                {/* Multi-model table */}
                {multiModelMode && (
                  <table className="w-full">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Fournisseur</th>
                        {visibleModels.moving_average && (
                          <>
                            <th className="px-3 py-3 text-center text-xs font-medium text-green-600 uppercase bg-green-50">MA Déf.</th>
                            <th className="px-3 py-3 text-center text-xs font-medium text-green-600 uppercase bg-green-50">MA Ret.</th>
                          </>
                        )}
                        {visibleModels.linear_regression && (
                          <>
                            <th className="px-3 py-3 text-center text-xs font-medium text-blue-600 uppercase bg-blue-50">LR Déf.</th>
                            <th className="px-3 py-3 text-center text-xs font-medium text-blue-600 uppercase bg-blue-50">LR Ret.</th>
                          </>
                        )}
                        {visibleModels.exponential && (
                          <>
                            <th className="px-3 py-3 text-center text-xs font-medium text-orange-600 uppercase bg-orange-50">Exp Déf.</th>
                            <th className="px-3 py-3 text-center text-xs font-medium text-orange-600 uppercase bg-orange-50">Exp Ret.</th>
                          </>
                        )}
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Confiance</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {multiModelPredictionData.map((p, i) => (
                        <tr key={i} className="hover:bg-gray-50">
                          <td className="px-4 py-4 font-medium text-gray-900">{p.supplier}</td>
                          {visibleModels.moving_average && (
                            <>
                              <td className="px-3 py-4 text-center bg-green-50/50">{p.defauts_ma}%</td>
                              <td className="px-3 py-4 text-center bg-green-50/50">{p.retards_ma}j</td>
                            </>
                          )}
                          {visibleModels.linear_regression && (
                            <>
                              <td className="px-3 py-4 text-center bg-blue-50/50">{p.defauts_lr}%</td>
                              <td className="px-3 py-4 text-center bg-blue-50/50">{p.retards_lr}j</td>
                            </>
                          )}
                          {visibleModels.exponential && (
                            <>
                              <td className="px-3 py-4 text-center bg-orange-50/50">{p.defauts_exp}%</td>
                              <td className="px-3 py-4 text-center bg-orange-50/50">{p.retards_exp}j</td>
                            </>
                          )}
                          <td className="px-4 py-4">
                            <span className={`px-2 py-1 text-xs rounded-full ${
                              p.confiance === 'haute' ? 'bg-green-100 text-green-800' :
                              p.confiance === 'moyenne' ? 'bg-yellow-100 text-yellow-800' :
                              'bg-red-100 text-red-800'
                            }`}>
                              {p.confiance}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                
                {/* Single model table */}
                {!multiModelMode && (
                  <table className="w-full">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Fournisseur</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Défauts Prédits</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Retard Prédit</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Confiance</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {dashboardData.predictions?.map((p, i) => (
                        <tr key={i} className="hover:bg-gray-50">
                          <td className="px-4 py-4 font-medium text-gray-900">{p.supplier}</td>
                          <td className="px-4 py-4">{p.predicted_defect}%</td>
                          <td className="px-4 py-4">{p.predicted_delay}j</td>
                          <td className="px-4 py-4">
                            <span className={`px-2 py-1 text-xs rounded-full ${
                              p.confiance === 'haute' ? 'bg-green-100 text-green-800' :
                              p.confiance === 'moyenne' ? 'bg-yellow-100 text-yellow-800' :
                              'bg-red-100 text-red-800'
                            }`}>
                              {p.confiance}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>

            {/* Model Performance Summary - only in multi-model mode */}
            {multiModelMode && multiModelPredictionData.length > 0 && (
              <div className="bg-white rounded-xl p-6 shadow">
                <h3 className="font-semibold text-gray-900 mb-4">Résumé Comparatif des Modèles</h3>
                <div className="grid md:grid-cols-3 gap-4">
                  {/* Moving Average Summary */}
                  <div className={`p-4 rounded-lg border-2 ${visibleModels.moving_average ? 'border-green-400 bg-green-50' : 'border-gray-200 bg-gray-50 opacity-50'}`}>
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-4 h-4 rounded-full bg-green-500" />
                      <h4 className="font-semibold text-green-800">Moyenne Glissante</h4>
                    </div>
                    <div className="space-y-2 text-sm">
                      {showDefects && (
                      <p className="text-gray-600">
                        Moy. Défauts: <span className="font-semibold text-green-700">
                          {(multiModelPredictionData.reduce((acc, p) => acc + (p.defauts_ma ?? 0), 0) / multiModelPredictionData.length).toFixed(2)}%
                        </span>
                      </p>
                      )}
                      {showDelays && (
                      <p className="text-gray-600">
                        Moy. Retards: <span className="font-semibold text-green-700">
                          {(multiModelPredictionData.reduce((acc, p) => acc + (p.retards_ma ?? 0), 0) / multiModelPredictionData.length).toFixed(2)}j
                        </span>
                      </p>
                      )}
                    </div>
                  </div>

                  {/* Linear Regression Summary */}
                  <div className={`p-4 rounded-lg border-2 ${visibleModels.linear_regression ? 'border-blue-400 bg-blue-50' : 'border-gray-200 bg-gray-50 opacity-50'}`}>
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-4 h-4 rounded-full bg-blue-500" />
                      <h4 className="font-semibold text-blue-800">Régression Linéaire</h4>
                    </div>
                    <div className="space-y-2 text-sm">
                      {showDefects && (
                      <p className="text-gray-600">
                        Moy. Défauts: <span className="font-semibold text-blue-700">
                          {(multiModelPredictionData.reduce((acc, p) => acc + (p.defauts_lr ?? 0), 0) / multiModelPredictionData.length).toFixed(2)}%
                        </span>
                      </p>
                      )}
                      {showDelays && (
                      <p className="text-gray-600">
                        Moy. Retards: <span className="font-semibold text-blue-700">
                          {(multiModelPredictionData.reduce((acc, p) => acc + (p.retards_lr ?? 0), 0) / multiModelPredictionData.length).toFixed(2)}j
                        </span>
                      </p>
                      )}
                    </div>
                  </div>

                  {/* Exponential Smoothing Summary */}
                  <div className={`p-4 rounded-lg border-2 ${visibleModels.exponential ? 'border-orange-400 bg-orange-50' : 'border-gray-200 bg-gray-50 opacity-50'}`}>
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-4 h-4 rounded-full bg-orange-500" />
                      <h4 className="font-semibold text-orange-800">Lissage Exponentiel</h4>
                    </div>
                    <div className="space-y-2 text-sm">
                      {showDefects && (
                      <p className="text-gray-600">
                        Moy. Défauts: <span className="font-semibold text-orange-700">
                          {(multiModelPredictionData.reduce((acc, p) => acc + (p.defauts_exp ?? 0), 0) / multiModelPredictionData.length).toFixed(2)}%
                        </span>
                      </p>
                      )}
                      {showDelays && (
                      <p className="text-gray-600">
                        Moy. Retards: <span className="font-semibold text-orange-700">
                          {(multiModelPredictionData.reduce((acc, p) => acc + (p.retards_exp ?? 0), 0) / multiModelPredictionData.length).toFixed(2)}j
                        </span>
                      </p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Predictions Tab - Show loading or prompt if dashboard not activated */}
        {activeTab === 'predictions' && !dashboardActivated && (
          <div className="bg-white rounded-xl p-8 shadow text-center">
            <TrendingUp className="mx-auto h-16 w-16 text-gray-300 mb-4" />
            <h3 className="text-xl font-semibold text-gray-700 mb-2">Prédictions non disponibles</h3>
            <p className="text-gray-500 mb-6">
              {workspaceInfo?.dataset?.has_data 
                ? 'Cliquez sur le bouton ci-dessous pour charger le dashboard et voir les prédictions.'
                : 'Veuillez d\'abord uploader un dataset dans l\'onglet Configuration.'}
            </p>
            {/* Error display */}
            {dashboardError && (
              <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-left">
                <div className="flex items-start gap-2">
                  <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-red-700">{dashboardError}</p>
                </div>
              </div>
            )}
            <button
              onClick={async () => {
                // Clear previous error and attempt to load dashboard
                setDashboardError(null);
                await handleActivateDashboard();
              }}
              disabled={loadingDashboard || !workspaceInfo?.dataset?.has_data}
              className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 mx-auto"
            >
              {loadingDashboard ? (
                <>
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  Chargement en cours...
                </>
              ) : (
                <>
                  <TrendingUp className="h-5 w-5" />
                  Charger les Prédictions
                </>
              )}
            </button>
          </div>
        )}

        {/* Models Tab */}
        {activeTab === 'models' && (
          <div className="space-y-6">
            {/* Multi-Model Comparison Card */}
            <div className={`rounded-xl p-6 shadow border-2 transition-all ${
              multiModelMode 
                ? 'bg-gradient-to-r from-purple-50 to-blue-50 border-purple-400' 
                : 'bg-white border-gray-200'
            }`}>
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                    <Activity className="h-5 w-5 text-purple-600" />
                    Mode Comparaison Multi-Modèles
                  </h3>
                  <p className="text-gray-500 text-sm mt-1">
                    Exécutez les 3 modèles simultanément et comparez leurs prédictions côte à côte
                  </p>
                </div>
                <button
                  onClick={() => {
                    setMultiModelMode(!multiModelMode);
                    // If enabling multi-model, switch to predictions tab to see results
                    if (!multiModelMode && dashboardActivated) {
                      setActiveTab('predictions');
                    }
                  }}
                  className={`px-6 py-3 rounded-lg font-medium transition-all ${
                    multiModelMode
                      ? 'bg-purple-600 text-white hover:bg-purple-700'
                      : 'bg-gray-100 text-gray-700 hover:bg-purple-100 hover:text-purple-700'
                  }`}
                >
                  {multiModelMode ? '✓ Activé' : 'Activer'}
                </button>
              </div>
              
              {/* Quick info about what multi-model does */}
              {!multiModelMode && (
                <div className="mt-4 pt-4 border-t border-gray-200 grid md:grid-cols-3 gap-4">
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <div className="w-3 h-3 rounded-full bg-green-500" />
                    Moyenne Glissante
                  </div>
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <div className="w-3 h-3 rounded-full bg-blue-500" />
                    Régression Linéaire
                  </div>
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <div className="w-3 h-3 rounded-full bg-orange-500" />
                    Lissage Exponentiel
                  </div>
                </div>
              )}
            </div>

            {/* Single Model Selection - shown when NOT in multi-model mode */}
            {!multiModelMode && (
              <div className="bg-white rounded-xl p-6 shadow">
                <h3 className="font-semibold text-gray-900 mb-6">Sélection du Modèle ML</h3>
                <p className="text-gray-500 mb-4 text-sm">
                  Sélectionnez le modèle à utiliser pour les prédictions. Le dashboard sera mis à jour automatiquement si déjà chargé.
                </p>
                <div className="grid md:grid-cols-2 gap-4">
                  {availableModels.map((model) => (
                    <div
                      key={model.id}
                      onClick={() => handleModelChange(model.id)}
                      className={`p-6 rounded-xl border-2 cursor-pointer transition-all ${
                        selectedModel === model.id
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-gray-200 hover:border-blue-300'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="font-semibold text-gray-900">{model.name}</h4>
                        {selectedModel === model.id && (
                          <CheckCircle className="h-5 w-5 text-blue-600" />
                        )}
                      </div>
                      <p className="text-sm text-gray-600 mb-3">{model.description}</p>
                      {model.parameters.length > 0 && (
                        <div className="text-xs text-gray-500">
                          Paramètres: {model.parameters.map(p => p.name).join(', ')}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Multi-Model Active Info */}
            {multiModelMode && (
              <div className="bg-white rounded-xl p-6 shadow">
                <h3 className="font-semibold text-gray-900 mb-4">Modèles Actifs</h3>
                <p className="text-gray-500 mb-4 text-sm">
                  Tous les modèles sont exécutés simultanément. Vous pouvez activer/désactiver leur visibilité dans l'onglet Prédictions.
                </p>
                <div className="grid md:grid-cols-3 gap-4">
                  {/* Moving Average */}
                  <div className={`p-4 rounded-lg border-2 ${
                    visibleModels.moving_average ? 'border-green-400 bg-green-50' : 'border-gray-200'
                  }`}>
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-4 h-4 rounded-full bg-green-500" />
                      <h4 className="font-semibold text-green-800">Moyenne Glissante</h4>
                    </div>
                    <p className="text-xs text-gray-600">Basé sur une fenêtre de {modelParams.fenetre || 3} observations</p>
                  </div>
                  
                  {/* Linear Regression */}
                  <div className={`p-4 rounded-lg border-2 ${
                    visibleModels.linear_regression ? 'border-blue-400 bg-blue-50' : 'border-gray-200'
                  }`}>
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-4 h-4 rounded-full bg-blue-500" />
                      <h4 className="font-semibold text-blue-800">Régression Linéaire</h4>
                    </div>
                    <p className="text-xs text-gray-600">Détection des tendances linéaires</p>
                  </div>
                  
                  {/* Exponential */}
                  <div className={`p-4 rounded-lg border-2 ${
                    visibleModels.exponential ? 'border-orange-400 bg-orange-50' : 'border-gray-200'
                  }`}>
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-4 h-4 rounded-full bg-orange-500" />
                      <h4 className="font-semibold text-orange-800">Lissage Exponentiel</h4>
                    </div>
                    <p className="text-xs text-gray-600">Pondération exponentielle (α=0.3)</p>
                  </div>
                </div>
                
                <button
                  onClick={() => setActiveTab('predictions')}
                  className="mt-4 w-full py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-medium flex items-center justify-center gap-2"
                >
                  <TrendingUp className="h-5 w-5" />
                  Voir la Comparaison dans Prédictions
                </button>
              </div>
            )}
          </div>
        )}

        {/* KPIs Tab */}
        {activeTab === 'kpis' && (
          <div className="space-y-6">
            {/* Standard KPIs */}
            <div className="bg-white rounded-xl p-6 shadow">
              <h3 className="font-semibold text-gray-900 mb-4">KPIs Standards</h3>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {['Taux Retard', 'Taux Défaut', 'Retard Moyen', 'Nb Commandes', 'Conformité', 'Commandes Parfaites'].map((kpi, i) => (
                  <div key={i} className="p-4 bg-gray-50 rounded-lg">
                    <div className="flex items-center gap-2">
                      <CheckCircle className="h-4 w-4 text-green-500" />
                      <span className="text-sm text-gray-700">{kpi}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Custom KPIs */}
            <div className="bg-white rounded-xl p-6 shadow">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-gray-900">KPIs Personnalisés</h3>
                <button
                  onClick={() => setShowKPIModal(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium"
                >
                  <Plus className="h-4 w-4" />
                  Ajouter
                </button>
              </div>
              
              {workspaceInfo?.custom_kpis && workspaceInfo.custom_kpis.length > 0 ? (
                <div className="space-y-3">
                  {workspaceInfo.custom_kpis.map((kpi) => (
                    <div key={kpi.id} className="flex items-center justify-between p-4 bg-purple-50 rounded-lg">
                      <div>
                        <p className="font-medium text-purple-900">{kpi.name}</p>
                        <p className="text-sm text-purple-600">
                          {kpi.formula_type} de {kpi.target_field} ({kpi.unit})
                        </p>
                      </div>
                      <button
                        onClick={() => handleDeleteKPI(kpi.id)}
                        className="p-2 text-red-500 hover:bg-red-100 rounded-lg"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-500 text-center py-8">Aucun KPI personnalisé</p>
              )}
            </div>
          </div>
        )}

        {/* Export Tab */}
        {activeTab === 'export' && (
          <div className="space-y-6">
            {/* Export Options */}
            <div className="bg-white rounded-xl p-6 shadow">
              <h3 className="font-semibold text-gray-900 mb-6 flex items-center gap-2">
                <Download className="h-5 w-5 text-blue-600" />
                Exporter les Données
              </h3>
              
              {/* Supplier Filter */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Filtrer par fournisseur
                </label>
                <select
                  value={selectedSupplier}
                  onChange={(e) => setSelectedSupplier(e.target.value)}
                  className="w-full max-w-xs px-4 py-2 rounded-lg border border-gray-300"
                >
                  <option value="all">Tous les fournisseurs</option>
                  {workspaceInfo?.dataset?.suppliers?.map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>

              {/* Export Buttons Grid */}
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                {/* Excel Export (Complete) */}
                <div className="border rounded-lg p-4 hover:border-green-500 transition-colors">
                  <div className="flex items-center gap-3 mb-3">
                    <FileSpreadsheet className="h-8 w-8 text-green-600" />
                    <div>
                      <h4 className="font-medium text-gray-900">Excel Complet</h4>
                      <p className="text-xs text-gray-500">Toutes les données en un fichier</p>
                    </div>
                  </div>
                  <button
                    onClick={() => handleExportExcel(true)}
                    disabled={exportLoading}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium disabled:opacity-50"
                  >
                    {exportLoading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                    Télécharger .xlsx
                  </button>
                </div>

                {/* CSV - Raw Data */}
                <div className="border rounded-lg p-4 hover:border-blue-500 transition-colors">
                  <div className="flex items-center gap-3 mb-3">
                    <Table className="h-8 w-8 text-blue-600" />
                    <div>
                      <h4 className="font-medium text-gray-900">Données Brutes</h4>
                      <p className="text-xs text-gray-500">CSV des données sources</p>
                    </div>
                  </div>
                  <button
                    onClick={() => handleExportCSV('all')}
                    disabled={exportLoading}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium disabled:opacity-50"
                  >
                    {exportLoading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                    Télécharger .csv
                  </button>
                </div>

                {/* CSV - KPIs */}
                <div className="border rounded-lg p-4 hover:border-purple-500 transition-colors">
                  <div className="flex items-center gap-3 mb-3">
                    <Activity className="h-8 w-8 text-purple-600" />
                    <div>
                      <h4 className="font-medium text-gray-900">KPIs</h4>
                      <p className="text-xs text-gray-500">Indicateurs calculés</p>
                    </div>
                  </div>
                  <button
                    onClick={() => handleExportCSV('kpis')}
                    disabled={exportLoading}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-medium disabled:opacity-50"
                  >
                    {exportLoading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                    Télécharger .csv
                  </button>
                </div>

                {/* CSV - Risks */}
                <div className="border rounded-lg p-4 hover:border-orange-500 transition-colors">
                  <div className="flex items-center gap-3 mb-3">
                    <AlertCircle className="h-8 w-8 text-orange-600" />
                    <div>
                      <h4 className="font-medium text-gray-900">Risques Fournisseurs</h4>
                      <p className="text-xs text-gray-500">Scores et niveaux de risque</p>
                    </div>
                  </div>
                  <button
                    onClick={() => handleExportCSV('risks')}
                    disabled={exportLoading}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-lg font-medium disabled:opacity-50"
                  >
                    {exportLoading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                    Télécharger .csv
                  </button>
                </div>

                {/* CSV - Predictions */}
                <div className="border rounded-lg p-4 hover:border-teal-500 transition-colors">
                  <div className="flex items-center gap-3 mb-3">
                    <TrendingUp className="h-8 w-8 text-teal-600" />
                    <div>
                      <h4 className="font-medium text-gray-900">Prédictions</h4>
                      <p className="text-xs text-gray-500">Prévisions par fournisseur</p>
                    </div>
                  </div>
                  <button
                    onClick={() => handleExportCSV('predictions')}
                    disabled={exportLoading}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg font-medium disabled:opacity-50"
                  >
                    {exportLoading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                    Télécharger .csv
                  </button>
                </div>

                {/* CSV - Actions */}
                <div className="border rounded-lg p-4 hover:border-red-500 transition-colors">
                  <div className="flex items-center gap-3 mb-3">
                    <CheckCircle className="h-8 w-8 text-red-600" />
                    <div>
                      <h4 className="font-medium text-gray-900">Actions Recommandées</h4>
                      <p className="text-xs text-gray-500">Plan d'action prioritaire</p>
                    </div>
                  </div>
                  <button
                    onClick={() => handleExportCSV('actions')}
                    disabled={exportLoading}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium disabled:opacity-50"
                  >
                    {exportLoading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                    Télécharger .csv
                  </button>
                </div>
              </div>
            </div>

            {/* Report Summary Export */}
            <div className="bg-gradient-to-r from-indigo-600 to-purple-600 rounded-xl p-6 shadow text-white">
              <div className="flex items-center justify-between flex-wrap gap-4">
                <div>
                  <h3 className="font-semibold text-lg mb-1">Rapport Structuré (JSON)</h3>
                  <p className="text-indigo-100 text-sm">
                    Export complet avec métadonnées pour intégration système ou génération PDF
                  </p>
                </div>
                <button
                  onClick={handleExportReport}
                  disabled={exportLoading}
                  className="flex items-center gap-2 px-6 py-3 bg-white text-indigo-600 hover:bg-indigo-50 rounded-lg font-medium disabled:opacity-50"
                >
                  {exportLoading ? <RefreshCw className="h-5 w-5 animate-spin" /> : <FileText className="h-5 w-5" />}
                  Générer Rapport
                </button>
              </div>
            </div>

            <div className="p-4 bg-blue-50 rounded-lg">
              <p className="text-sm text-blue-800">
                <strong>💡 Astuce:</strong> Utilisez le filtre fournisseur pour exporter uniquement les données d'un fournisseur spécifique.
                {selectedSupplier !== 'all' && (
                  <span className="block mt-1">
                    Filtrage actif: <strong>{selectedSupplier}</strong>
                  </span>
                )}
              </p>
            </div>
          </div>
        )}

        {/* Add KPI Modal */}
        {showKPIModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="bg-white rounded-2xl p-6 w-full max-w-md mx-4 shadow-2xl">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold">Nouveau KPI</h3>
                <button onClick={() => setShowKPIModal(false)} className="p-2 hover:bg-gray-100 rounded">
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nom</label>
                  <input
                    type="text"
                    value={newKPI.name}
                    onChange={(e) => setNewKPI({ ...newKPI, name: e.target.value })}
                    className="w-full px-4 py-2 rounded-lg border border-gray-300"
                    placeholder="Ex: Score Qualité"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Formule</label>
                  <select
                    value={newKPI.formula_type}
                    onChange={(e) => setNewKPI({ ...newKPI, formula_type: e.target.value })}
                    className="w-full px-4 py-2 rounded-lg border border-gray-300"
                  >
                    <option value="average">Moyenne</option>
                    <option value="sum">Somme</option>
                    <option value="percentage">Pourcentage (&gt; 0)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Champ cible</label>
                  <select
                    value={newKPI.target_field}
                    onChange={(e) => setNewKPI({ ...newKPI, target_field: e.target.value })}
                    className="w-full px-4 py-2 rounded-lg border border-gray-300"
                  >
                    <option value="defects">Défauts</option>
                    <option value="delay">Retard</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Unité</label>
                  <input
                    type="text"
                    value={newKPI.unit}
                    onChange={(e) => setNewKPI({ ...newKPI, unit: e.target.value })}
                    className="w-full px-4 py-2 rounded-lg border border-gray-300"
                    placeholder="%"
                  />
                </div>
              </div>

              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => setShowKPIModal(false)}
                  className="flex-1 px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg font-medium"
                >
                  Annuler
                </button>
                <button
                  onClick={handleAddCustomKPI}
                  className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium"
                >
                  Créer
                </button>
              </div>
            </div>
          </div>
        )}

        {/* LLM Column Mapper Modal */}
        {showLLMMapper && llmAnalysis && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 overflow-y-auto">
            <div className="my-8">
              <LLMColumnMapper
                analysis={llmAnalysis}
                originalColumns={llmAnalysis.column_analysis?.map((c: any) => c.column) || []}
                onApply={handleApplyMappings}
                onCancel={() => {
                  setShowLLMMapper(false);
                  setLLMAnalysis(null);
                  setUploadError(null);
                }}
                loading={applyingMappings}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
