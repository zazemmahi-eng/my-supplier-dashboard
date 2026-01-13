'use client';
/**
 * WorkspaceView Component
 * 
 * Main view for a single workspace.
 * Handles data upload, model selection, KPI management,
 * visualization, and report export.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import axios from 'axios';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell
} from 'recharts';
import {
  ArrowLeft, Database, Settings, FileText, Download, Upload,
  AlertCircle, CheckCircle, TrendingUp, TrendingDown, Activity,
  BarChart3, PieChart as PieChartIcon, Filter, Plus, X, Trash2,
  RefreshCw, FileSpreadsheet, Table, FileDown, Zap, PlayCircle,
  FolderOpen, Users, Package, Calendar as CalendarIcon, Edit, Eye
} from 'lucide-react';
import LLMColumnMapper from './LLMColumnMapper';
import { AppLogo } from './app-logo';

const API_BASE_URL = process.env.NEXT_PUBLIC_SUPPLIER_API_URL ?? 'http://127.0.0.1:8000';

// ============================================
// CLIENT-ONLY TIME COMPONENT (prevents hydration mismatch)
// ============================================
function ClientOnlyTime() {
  const [time, setTime] = useState<string | null>(null);
  
  useEffect(() => {
    setTime(new Date().toLocaleTimeString('fr-FR'));
  }, []);
  
  return (
    <p className="text-gray-500">
      Dernière mise à jour: {time ?? '...'}
    </p>
  );
}

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
  const [activeTab, setActiveTab] = useState<'setup' | 'suppliers' | 'overview' | 'predictions' | 'models' | 'kpis' | 'export'>('setup');
  
  // Supplier management state
  const [suppliersData, setSuppliersData] = useState<any[]>([]);
  const [loadingSuppliers, setLoadingSuppliers] = useState(false);
  const [selectedSupplierForOrders, setSelectedSupplierForOrders] = useState<string | null>(null);
  const [supplierOrders, setSupplierOrders] = useState<any[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(false);
  
  // Add supplier modal state
  const [showAddSupplierModal, setShowAddSupplierModal] = useState(false);
  const [newSupplierForm, setNewSupplierForm] = useState({ name: '', description: '', category: '' });
  const [addingSupplier, setAddingSupplier] = useState(false);
  
  // Add order modal state
  const [showAddOrderModal, setShowAddOrderModal] = useState(false);
  const [newOrderForm, setNewOrderForm] = useState({
    supplier_name: '',
    date_promised: '',
    date_delivered: '',
    defects: 0,
    order_reference: '',
    quantity: 0,
    notes: ''
  });
  const [addingOrder, setAddingOrder] = useState(false);
  
  // CSV upload for supplier state
  const [showSupplierUploadModal, setShowSupplierUploadModal] = useState(false);
  const [uploadingSupplierCSV, setUploadingSupplierCSV] = useState(false);
  const [supplierUploadMode, setSupplierUploadMode] = useState<'standard' | 'intelligent'>('standard');
  const [mergeMode, setMergeMode] = useState<'append' | 'replace'>('append');
  
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

  // Export state
  const [exportLoading, setExportLoading] = useState(false);
  const [showExportOptions, setShowExportOptions] = useState(false);

  // Multi-model comparison data state
  const [multiModelData, setMultiModelData] = useState<any>(null);
  const [loadingMultiModel, setLoadingMultiModel] = useState(false);

  // ============================================
  // CONFIGURATION STATE (for workspaces without data)
  // ============================================
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [uploadMode, setUploadMode] = useState<'standard' | 'intelligent' | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [configuring, setConfiguring] = useState(false);
  
  // LLM Column Mapping state
  const [showLLMMapper, setShowLLMMapper] = useState(false);
  const [llmAnalysis, setLLMAnalysis] = useState<any>(null);
  const [llmCsvContent, setLLMCsvContent] = useState<string>('');
  const [llmFilename, setLLMFilename] = useState<string>('');

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
        { 
          responseType: 'blob',
          timeout: 60000,
          validateStatus: (status) => status < 500
        }
      );

      // Check if response is an error (JSON error message)
      if (response.status >= 400) {
        const errorText = await response.data.text();
        try {
          const errorJson = JSON.parse(errorText);
          throw new Error(errorJson.detail || 'Erreur lors de l\'export Excel');
        } catch {
          throw new Error(errorText || 'Erreur lors de l\'export Excel');
        }
      }

      // Verify it's actually an Excel file
      const contentType = response.headers['content-type'];
      if (contentType && !contentType.includes('spreadsheet') && !contentType.includes('excel')) {
        throw new Error('Réponse inattendue du serveur');
      }

      // Create download link
      const url = window.URL.createObjectURL(new Blob([response.data], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      }));
      const link = document.createElement('a');
      link.href = url;
      const timestamp = new Date().toISOString().slice(0, 10);
      const supplierSuffix = selectedSupplier !== 'all' ? `_${selectedSupplier}` : '';
      link.setAttribute('download', `workspace_${workspaceName}${supplierSuffix}_${timestamp}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      console.error('Excel export error:', err);
      const message = err?.message || err?.response?.data?.detail || 'Erreur lors de l\'export Excel';
      alert(message);
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

  // PDF Export Handler - Full Workspace Anticipation Report
  const handleExportPDF = async () => {
    setExportLoading(true);
    try {
      const supplierParam = selectedSupplier !== 'all' ? `?supplier=${encodeURIComponent(selectedSupplier)}` : '';
      const response = await axios.get(
        `${API_BASE_URL}/api/reports/${workspaceId}/export/pdf${supplierParam}`,
        { 
          responseType: 'blob',
          timeout: 60000,
          validateStatus: (status) => status < 500
        }
      );

      // Check if response is an error
      if (response.status >= 400) {
        const errorText = await response.data.text();
        try {
          const errorJson = JSON.parse(errorText);
          throw new Error(errorJson.detail || 'Erreur lors de l\'export PDF');
        } catch {
          throw new Error(errorText || 'Erreur lors de l\'export PDF');
        }
      }

      // Verify it's actually a PDF
      const contentType = response.headers['content-type'];
      if (contentType && !contentType.includes('pdf')) {
        throw new Error('Réponse inattendue du serveur');
      }

      // Create download link
      const url = window.URL.createObjectURL(new Blob([response.data], {
        type: 'application/pdf'
      }));
      const link = document.createElement('a');
      link.href = url;
      const timestamp = new Date().toISOString().slice(0, 10);
      const supplierSuffix = selectedSupplier !== 'all' ? `_${selectedSupplier}` : '';
      link.setAttribute('download', `rapport_anticipation_${workspaceName}${supplierSuffix}_${timestamp}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      console.error('PDF export error:', err);
      const message = err?.message || err?.response?.data?.detail || 'Erreur lors de l\'export PDF';
      alert(message);
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
      setDashboardError('Aucune donnée disponible. Ce workspace n\'a pas de dataset initial.');
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
  // SUPPLIER MANAGEMENT FUNCTIONS
  // ============================================

  // Fetch all suppliers in the workspace
  const fetchSuppliers = useCallback(async () => {
    setLoadingSuppliers(true);
    try {
      const response = await axios.get(`${API_BASE_URL}/api/workspaces/${workspaceId}/suppliers`);
      setSuppliersData(response.data.suppliers || []);
    } catch (err) {
      console.error('Error fetching suppliers:', err);
      setSuppliersData([]);
    } finally {
      setLoadingSuppliers(false);
    }
  }, [workspaceId]);

  // Fetch orders for a specific supplier
  const fetchSupplierOrders = useCallback(async (supplierName: string) => {
    setLoadingOrders(true);
    try {
      const response = await axios.get(
        `${API_BASE_URL}/api/workspaces/${workspaceId}/suppliers/${encodeURIComponent(supplierName)}/orders`
      );
      setSupplierOrders(response.data.orders || []);
    } catch (err) {
      console.error('Error fetching supplier orders:', err);
      setSupplierOrders([]);
    } finally {
      setLoadingOrders(false);
    }
  }, [workspaceId]);

  // Add a new supplier
  const handleAddSupplier = async () => {
    if (!newSupplierForm.name.trim()) {
      alert('Veuillez entrer un nom de fournisseur');
      return;
    }

    setAddingSupplier(true);
    try {
      await axios.post(`${API_BASE_URL}/api/workspaces/${workspaceId}/suppliers`, newSupplierForm);
      setShowAddSupplierModal(false);
      setNewSupplierForm({ name: '', description: '', category: '' });
      await fetchSuppliers();
      await fetchWorkspaceInfo(); // Refresh workspace info to update supplier list
    } catch (err: any) {
      const message = err?.response?.data?.detail || 'Erreur lors de l\'ajout du fournisseur';
      alert(message);
    } finally {
      setAddingSupplier(false);
    }
  };

  // Remove a supplier
  const handleRemoveSupplier = async (supplierName: string) => {
    if (!confirm(`Êtes-vous sûr de vouloir supprimer "${supplierName}" et toutes ses commandes ?`)) {
      return;
    }

    try {
      await axios.delete(`${API_BASE_URL}/api/workspaces/${workspaceId}/suppliers/${encodeURIComponent(supplierName)}`);
      await fetchSuppliers();
      await fetchWorkspaceInfo();
      if (selectedSupplierForOrders === supplierName) {
        setSelectedSupplierForOrders(null);
        setSupplierOrders([]);
      }
      // Reset dashboard to force recalculation
      if (dashboardActivated) {
        setDashboardActivated(false);
        setDashboardData(null);
      }
    } catch (err: any) {
      const message = err?.response?.data?.detail || 'Erreur lors de la suppression';
      alert(message);
    }
  };

  // Add a single order manually
  const handleAddOrder = async () => {
    const dataType = workspaceInfo?.workspace?.data_type || 'delays';
    
    // Case-specific validation
    if (!newOrderForm.supplier_name) {
      alert('Veuillez sélectionner un fournisseur');
      return;
    }
    
    if (dataType === 'delays' || dataType === 'mixed') {
      // Case A and C require dates
      if (!newOrderForm.date_promised) {
        alert('Veuillez remplir la date promise');
        return;
      }
    }
    
    if (dataType === 'late_days') {
      // Case B requires defects
      if (newOrderForm.defects === undefined || newOrderForm.defects === null) {
        alert('Veuillez remplir le taux de défauts');
        return;
      }
    }

    setAddingOrder(true);
    try {
      // Build payload based on case type
      const payload: any = {
        supplier_name: newOrderForm.supplier_name,
        order_reference: newOrderForm.order_reference,
        quantity: newOrderForm.quantity,
        notes: newOrderForm.notes
      };
      
      // Add date fields for Case A and C
      if (dataType === 'delays' || dataType === 'mixed') {
        payload.date_promised = newOrderForm.date_promised;
        payload.date_delivered = newOrderForm.date_delivered || null;
      }
      
      // Add defects field for Case B and C
      if (dataType === 'late_days' || dataType === 'mixed') {
        payload.defects = newOrderForm.defects;
      }
      
      await axios.post(`${API_BASE_URL}/api/workspaces/${workspaceId}/orders`, payload);
      setShowAddOrderModal(false);
      setNewOrderForm({
        supplier_name: '',
        date_promised: '',
        date_delivered: '',
        defects: 0,
        order_reference: '',
        quantity: 0,
        notes: ''
      });
      
      // Refresh all data sources to reflect the new order
      await Promise.all([
        fetchSuppliers(),
        fetchWorkspaceInfo()
      ]);
      
      // Refresh supplier orders if viewing the same supplier
      if (selectedSupplierForOrders === newOrderForm.supplier_name) {
        await fetchSupplierOrders(newOrderForm.supplier_name);
      }
      
      // If dashboard was already activated, automatically refetch to show updated data
      // This ensures KPIs, predictions, and charts reflect the new order
      if (dashboardActivated) {
        setDashboardData(null); // Clear stale data
        await fetchDashboardData(); // Refetch with updated dataset
      }
    } catch (err: any) {
      const message = err?.response?.data?.detail || 'Erreur lors de l\'ajout de la commande';
      alert(message);
    } finally {
      setAddingOrder(false);
    }
  };

  // Upload CSV for a specific supplier
  const handleSupplierCSVUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedSupplierForOrders) return;

    setUploadingSupplierCSV(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const endpoint = supplierUploadMode === 'intelligent' 
        ? `${API_BASE_URL}/api/workspaces/${workspaceId}/suppliers/${encodeURIComponent(selectedSupplierForOrders)}/upload/smart?merge_mode=${mergeMode}`
        : `${API_BASE_URL}/api/workspaces/${workspaceId}/suppliers/${encodeURIComponent(selectedSupplierForOrders)}/upload?merge_mode=${mergeMode}`;

      const response = await axios.post(endpoint, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      if (response.data.needs_review) {
        alert('Le fichier nécessite une vérification manuelle des colonnes. Utilisez l\'upload standard ou corrigez le format.');
      } else {
        alert(`${response.data.orders_added} commandes importées avec succès`);
        setShowSupplierUploadModal(false);
        
        // Refresh all data sources to reflect the new orders
        await Promise.all([
          fetchSuppliers(),
          fetchSupplierOrders(selectedSupplierForOrders),
          fetchWorkspaceInfo()
        ]);
        
        // If dashboard was already activated, automatically refetch to show updated data
        // This ensures KPIs, predictions, and charts reflect the new orders
        if (dashboardActivated) {
          setDashboardData(null); // Clear stale data
          await fetchDashboardData(); // Refetch with updated dataset
        }
      }
    } catch (err: any) {
      const message = err?.response?.data?.detail || 'Erreur lors de l\'import CSV';
      if (typeof message === 'object' && message.errors) {
        alert(`Erreurs de validation:\n${message.errors.join('\n')}`);
      } else {
        alert(message);
      }
    } finally {
      setUploadingSupplierCSV(false);
      e.target.value = ''; // Reset file input
    }
  };

  // Fetch suppliers when switching to suppliers tab
  useEffect(() => {
    if (activeTab === 'suppliers') {
      fetchSuppliers();
    }
  }, [activeTab, fetchSuppliers]);

  // ============================================
  // CHART DATA PREPARATION
  // ============================================

  const pieData = dashboardData?.distribution ? [
    { name: 'Faible', value: dashboardData.distribution.faible?.count || 0, color: COLORS.faible },
    { name: 'Modéré', value: dashboardData.distribution.modere?.count || 0, color: COLORS.modere },
    { name: 'Élevé', value: dashboardData.distribution.eleve?.count || 0, color: COLORS.eleve }
  ].filter(d => d.value > 0) : [];

  const barData = dashboardData?.suppliers?.map(s => ({
    name: s.supplier,
    fullName: s.supplier,
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
    name: p.supplier,
    fullName: p.supplier,
    // Only include non-null values based on case type
    defauts: p.predicted_defect,
    retards: p.predicted_delay
  })) || [];

  // Multi-model comparison data - includes all 3 model predictions for each supplier
  // Used when multiModelMode is enabled for side-by-side comparison
  const multiModelPredictionData = dashboardData?.predictions?.map(p => ({
    name: p.supplier,
    supplier: p.supplier,
    fullName: p.supplier,
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
  // DATA TYPE INFO (for configuration screen)
  // ============================================
  const DATA_TYPE_INFO: Record<string, { label: string; columns: string[]; description: string }> = {
    delays: {
      label: 'Case A - Retards Uniquement',
      columns: ['supplier', 'date_promised', 'date_delivered'],
      description: 'Analyse des délais de livraison'
    },
    late_days: {
      label: 'Case B - Défauts Uniquement',
      columns: ['supplier', 'defects'],
      description: 'Analyse du taux de défauts'
    },
    mixed: {
      label: 'Case C - Mixte',
      columns: ['supplier', 'date_promised', 'date_delivered', 'defects'],
      description: 'Analyse combinée retards et défauts'
    }
  };

  // ============================================
  // CONFIGURATION HANDLERS
  // ============================================
  
  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>, mode: 'standard' | 'intelligent') => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.csv')) {
      setUploadError('Format invalide. Veuillez uploader un fichier CSV.');
      return;
    }

    setUploadedFile(file);
    setUploadMode(mode);
    setUploadError(null);
  };

  const handleRemoveFile = () => {
    setUploadedFile(null);
    setUploadMode(null);
    setUploadError(null);
  };

  const handleActivateWorkspace = async () => {
    if (!uploadedFile) {
      setUploadError('Veuillez sélectionner un fichier CSV');
      return;
    }

    setConfiguring(true);
    setUploadError(null);

    try {
      if (uploadMode === 'standard') {
        // Standard upload
        const formData = new FormData();
        formData.append('file', uploadedFile);
        await axios.post(`${API_BASE_URL}/api/workspaces/${workspaceId}/upload`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });
        
        // Refresh workspace info to show dashboard
        await fetchWorkspaceInfo();
        setUploadedFile(null);
        setUploadMode(null);
      } else if (uploadMode === 'intelligent') {
        // Intelligent upload - analyze first
        const formData = new FormData();
        formData.append('file', uploadedFile);
        const analyzeResponse = await axios.post(
          `${API_BASE_URL}/api/workspaces/${workspaceId}/upload/analyze`, 
          formData,
          { headers: { 'Content-Type': 'multipart/form-data' } }
        );
        
        // Store analysis results and show LLM mapper
        setLLMAnalysis(analyzeResponse.data.analysis);
        setLLMCsvContent(analyzeResponse.data.csv_content);
        setLLMFilename(analyzeResponse.data.filename || uploadedFile.name);
        setShowLLMMapper(true);
      }
    } catch (err) {
      if (axios.isAxiosError(err)) {
        const detail = err.response?.data?.detail;
        const errorMsg = typeof detail === 'object' && detail.errors 
          ? detail.errors.join('\n') 
          : (detail || 'Erreur lors du téléchargement');
        setUploadError(errorMsg);
      } else {
        setUploadError('Erreur inconnue');
      }
    } finally {
      setConfiguring(false);
    }
  };

  const handleApplyMappings = async (mappings: any[], targetCase: string) => {
    setConfiguring(true);
    setUploadError(null);

    try {
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
        setShowLLMMapper(false);
        setLLMAnalysis(null);
        setUploadedFile(null);
        setUploadMode(null);
        await fetchWorkspaceInfo();
        
        if (response.data.warnings?.length > 0) {
          alert(`Import réussi avec avertissements:\n${response.data.warnings.join('\n')}`);
        }
      } else {
        setUploadError(response.data.errors?.join('\n') || 'Erreur de normalisation');
      }
    } catch (err) {
      if (axios.isAxiosError(err)) {
        setUploadError(err.response?.data?.detail || 'Erreur lors de l\'import');
      }
    } finally {
      setConfiguring(false);
    }
  };

  const handleCancelLLMMapping = () => {
    setShowLLMMapper(false);
    setLLMAnalysis(null);
    setUploadError(null);
  };

  // ============================================
  // CONFIGURATION SCREEN - Mandatory step for workspaces without data
  // ============================================

  if (!workspaceInfo?.dataset?.has_data) {
    const dataTypeInfo = DATA_TYPE_INFO[workspaceInfo?.workspace?.data_type || 'delays'];
    
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 p-6">
        <div className="max-w-3xl mx-auto">
          {/* Header with Logo */}
          <div className="flex items-center gap-4 mb-8">
            <AppLogo href="/dashboard" className="bg-white/10 rounded-lg p-2" />
            <div className="border-l border-white/30 pl-4 flex items-center gap-4">
              <button
                onClick={onBack}
                className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors"
              >
                <ArrowLeft className="h-5 w-5" />
              </button>
              <div>
                <h1 className="text-2xl font-bold text-white">{workspaceName}</h1>
                <p className="text-blue-200">{dataTypeInfo?.label}</p>
              </div>
            </div>
          </div>

          {/* Configuration Card */}
          <div className="bg-white rounded-2xl shadow-2xl overflow-hidden">
            {/* Card Header */}
            <div className="bg-gradient-to-r from-amber-500 to-orange-500 p-6">
              <div className="flex items-center gap-3">
                <Settings className="h-8 w-8 text-white" />
                <div>
                  <h2 className="text-xl font-bold text-white">Configuration du Workspace</h2>
                  <p className="text-amber-100">Étape 2/2 : Importez votre dataset pour activer le workspace</p>
                </div>
              </div>
            </div>

            <div className="p-8">
              {/* Info Section */}
              <div className="mb-8 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <h3 className="font-semibold text-blue-900 mb-2">Dataset Initial</h3>
                <p className="text-sm text-blue-700 mb-3">
                  Importez un fichier CSV pour configurer et initialiser le workspace.
                  Cette étape est obligatoire pour accéder aux dashboards et prédictions.
                </p>
                <div className="flex items-center gap-2 text-blue-600">
                  <AlertCircle className="h-4 w-4" />
                  <span className="text-xs">Le dataset ne pourra pas être modifié après configuration</span>
                </div>
              </div>

              {/* Expected Format */}
              <div className="mb-8">
                <h3 className="font-semibold text-gray-900 mb-3">Format attendu pour {dataTypeInfo?.label}</h3>
                <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                  <code className="text-sm text-gray-700 font-mono">
                    {dataTypeInfo?.columns.join(', ')}
                  </code>
                  {workspaceInfo?.schema && (
                    <div className="mt-4 pt-4 border-t border-gray-200">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-left text-gray-500">
                            <th className="pb-2">Colonne</th>
                            <th className="pb-2">Type</th>
                          </tr>
                        </thead>
                        <tbody className="text-gray-700">
                          {Object.entries(workspaceInfo.schema.types).map(([col, type]) => (
                            <tr key={col}>
                              <td className="py-1 font-mono text-blue-600">{col}</td>
                              <td className="py-1">{type}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>

              {/* Upload Section */}
              <div className="mb-8">
                <h3 className="font-semibold text-gray-900 mb-4">Choisissez votre méthode d'import</h3>
                
                {uploadedFile ? (
                  <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <CheckCircle className="h-6 w-6 text-green-600" />
                        <div>
                          <p className="font-medium text-gray-900">{uploadedFile.name}</p>
                          <p className="text-sm text-gray-500">
                            {uploadMode === 'intelligent' ? 'Upload intelligent (IA)' : 'Upload standard'}
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={handleRemoveFile}
                        className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                      >
                        <X className="h-5 w-5" />
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="grid md:grid-cols-2 gap-4">
                    {/* Standard Upload */}
                    <div className="relative">
                      <input
                        type="file"
                        accept=".csv"
                        onChange={(e) => handleFileSelect(e, 'standard')}
                        disabled={uploading || configuring}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                      />
                      <div className="border-2 border-dashed rounded-xl p-8 text-center transition-colors h-full border-gray-300 hover:border-blue-400 hover:bg-blue-50">
                        <div className="flex flex-col items-center justify-center gap-3">
                          <Upload className="h-10 w-10 text-gray-400" />
                          <span className="text-gray-700 font-semibold">Upload Standard</span>
                          <span className="text-gray-500 text-sm">Format attendu uniquement</span>
                        </div>
                      </div>
                    </div>

                    {/* Intelligent Upload */}
                    <div className="relative">
                      <input
                        type="file"
                        accept=".csv"
                        onChange={(e) => handleFileSelect(e, 'intelligent')}
                        disabled={uploading || configuring}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                      />
                      <div className="border-2 border-dashed rounded-xl p-8 text-center transition-colors h-full border-yellow-300 hover:border-yellow-500 bg-gradient-to-br from-yellow-50 to-orange-50">
                        <div className="flex flex-col items-center justify-center gap-3">
                          <Zap className="h-10 w-10 text-yellow-500" />
                          <span className="text-gray-700 font-semibold">Upload Intelligent</span>
                          <span className="text-gray-500 text-sm">L'IA suggère les mappings</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Upload Error */}
                {uploadError && (
                  <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
                    <div className="flex items-start gap-3">
                      <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0" />
                      <pre className="text-sm text-red-700 whitespace-pre-wrap">{uploadError}</pre>
                    </div>
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex gap-4">
                <button
                  onClick={onBack}
                  className="flex-1 px-6 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium rounded-lg transition-colors"
                >
                  Retour
                </button>
                <button
                  onClick={handleActivateWorkspace}
                  disabled={!uploadedFile || configuring}
                  className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 disabled:from-gray-400 disabled:to-gray-400 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-all"
                >
                  {configuring ? (
                    <>
                      <div className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                      <span>Activation...</span>
                    </>
                  ) : (
                    <>
                      <PlayCircle className="h-5 w-5" />
                      <span>Activer le Workspace</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* LLM Mapper Modal */}
          {showLLMMapper && llmAnalysis && (
            <LLMColumnMapper
              analysis={llmAnalysis}
              originalColumns={llmAnalysis.column_analysis?.map((c: any) => c.column) || []}
              onApply={handleApplyMappings}
              onCancel={handleCancelLLMMapping}
              loading={configuring}
            />
          )}
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
            <AppLogo href="/dashboard" className="bg-white rounded-lg p-2 shadow" />
            <div className="border-l border-gray-300 pl-4 flex items-center gap-4">
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
            { key: 'suppliers', icon: FolderOpen, label: 'Fournisseurs', requiresDashboard: false },
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
                <p className="text-gray-500">Aucun dataset uploadé. Le dataset initial a été défini lors de la création du workspace.</p>
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

        {/* ============================================
            SUPPLIERS TAB - Manage suppliers and orders
            ============================================ */}
        {activeTab === 'suppliers' && (
          <div className="space-y-6">
            {/* Header with Add buttons */}
            <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
              <div>
                <h2 className="text-xl font-bold text-gray-900">Gestion des Fournisseurs</h2>
                <p className="text-gray-500 text-sm">Ajoutez et gérez les fournisseurs et leurs commandes</p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowAddSupplierModal(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  <Plus className="h-4 w-4" />
                  Ajouter Fournisseur
                </button>
                <button
                  onClick={() => {
                    setNewOrderForm({ ...newOrderForm, supplier_name: suppliersData[0]?.name || '' });
                    setShowAddOrderModal(true);
                  }}
                  className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                >
                  <Package className="h-4 w-4" />
                  Ajouter Commande
                </button>
              </div>
            </div>

            {/* Suppliers Grid */}
            <div className="grid lg:grid-cols-2 gap-6">
              {/* Suppliers List */}
              <div className="bg-white rounded-xl shadow overflow-hidden">
                <div className="p-4 border-b border-gray-200 bg-gray-50">
                  <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                    <Users className="h-5 w-5 text-blue-600" />
                    Fournisseurs ({suppliersData.length})
                  </h3>
                </div>
                
                {loadingSuppliers ? (
                  <div className="p-8 text-center">
                    <div className="h-8 w-8 mx-auto animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
                    <p className="mt-2 text-gray-500">Chargement...</p>
                  </div>
                ) : suppliersData.length === 0 ? (
                  <div className="p-8 text-center">
                    <Users className="h-12 w-12 mx-auto text-gray-300 mb-3" />
                    <p className="text-gray-500">Aucun fournisseur</p>
                    <p className="text-gray-400 text-sm">Ajoutez un fournisseur ou importez des données</p>
                  </div>
                ) : (
                  <div className="divide-y divide-gray-100 max-h-[500px] overflow-y-auto">
                    {suppliersData.map((supplier) => (
                      <div
                        key={supplier.name}
                        className={`p-4 hover:bg-gray-50 cursor-pointer transition-colors ${
                          selectedSupplierForOrders === supplier.name ? 'bg-blue-50 border-l-4 border-blue-500' : ''
                        }`}
                        onClick={() => {
                          setSelectedSupplierForOrders(supplier.name);
                          fetchSupplierOrders(supplier.name);
                        }}
                      >
                        <div className="flex justify-between items-start">
                          <div className="flex-1">
                            <h4 className="font-medium text-gray-900">{supplier.name}</h4>
                            <div className="flex flex-wrap gap-3 mt-2 text-sm text-gray-500">
                              <span className="flex items-center gap-1">
                                <Package className="h-3 w-3" />
                                {supplier.order_count} commandes
                              </span>
                              {supplier.avg_delay !== undefined && (
                                <span className={`flex items-center gap-1 ${supplier.avg_delay > 2 ? 'text-red-500' : 'text-green-500'}`}>
                                  <CalendarIcon className="h-3 w-3" />
                                  Retard moy: {supplier.avg_delay}j
                                </span>
                              )}
                              {supplier.avg_defects !== undefined && (
                                <span className={`flex items-center gap-1 ${supplier.avg_defects > 5 ? 'text-red-500' : 'text-green-500'}`}>
                                  <AlertCircle className="h-3 w-3" />
                                  Défauts: {supplier.avg_defects}%
                                </span>
                              )}
                            </div>
                            {supplier.first_order && (
                              <p className="text-xs text-gray-400 mt-1">
                                {supplier.first_order} → {supplier.last_order}
                              </p>
                            )}
                          </div>
                          <div className="flex gap-1">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedSupplierForOrders(supplier.name);
                                setShowSupplierUploadModal(true);
                              }}
                              className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                              title="Importer CSV"
                            >
                              <Upload className="h-4 w-4" />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleRemoveSupplier(supplier.name);
                              }}
                              className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                              title="Supprimer"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Orders Panel */}
              <div className="bg-white rounded-xl shadow overflow-hidden">
                <div className="p-4 border-b border-gray-200 bg-gray-50">
                  <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                    <FileSpreadsheet className="h-5 w-5 text-green-600" />
                    {selectedSupplierForOrders 
                      ? `Commandes - ${selectedSupplierForOrders}` 
                      : 'Sélectionnez un fournisseur'}
                  </h3>
                </div>

                {!selectedSupplierForOrders ? (
                  <div className="p-8 text-center">
                    <Eye className="h-12 w-12 mx-auto text-gray-300 mb-3" />
                    <p className="text-gray-500">Sélectionnez un fournisseur</p>
                    <p className="text-gray-400 text-sm">pour voir ses commandes</p>
                  </div>
                ) : loadingOrders ? (
                  <div className="p-8 text-center">
                    <div className="h-8 w-8 mx-auto animate-spin rounded-full border-2 border-green-500 border-t-transparent" />
                    <p className="mt-2 text-gray-500">Chargement...</p>
                  </div>
                ) : supplierOrders.length === 0 ? (
                  <div className="p-8 text-center">
                    <Package className="h-12 w-12 mx-auto text-gray-300 mb-3" />
                    <p className="text-gray-500">Aucune commande</p>
                    <button
                      onClick={() => {
                        setNewOrderForm({ ...newOrderForm, supplier_name: selectedSupplierForOrders });
                        setShowAddOrderModal(true);
                      }}
                      className="mt-3 text-blue-600 hover:text-blue-700 text-sm"
                    >
                      + Ajouter une commande
                    </button>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-3 text-left text-gray-600">Date Promise</th>
                          <th className="px-4 py-3 text-left text-gray-600">Date Livrée</th>
                          <th className="px-4 py-3 text-right text-gray-600">Retard</th>
                          <th className="px-4 py-3 text-right text-gray-600">Défauts</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {supplierOrders.slice(0, 20).map((order, idx) => (
                          <tr key={idx} className="hover:bg-gray-50">
                            <td className="px-4 py-3 text-gray-900">{order.date_promised}</td>
                            <td className="px-4 py-3 text-gray-900">{order.date_delivered}</td>
                            <td className={`px-4 py-3 text-right ${order.delay > 0 ? 'text-red-600' : 'text-green-600'}`}>
                              {order.delay !== undefined ? `${order.delay}j` : '-'}
                            </td>
                            <td className={`px-4 py-3 text-right ${(order.defects || 0) > 0.05 ? 'text-red-600' : 'text-green-600'}`}>
                              {order.defects !== undefined ? `${(order.defects * 100).toFixed(1)}%` : '-'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {supplierOrders.length > 20 && (
                      <div className="p-3 text-center text-gray-500 text-sm bg-gray-50">
                        Affichage des 20 premières commandes sur {supplierOrders.length}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Quick Actions */}
            <div className="bg-gradient-to-r from-green-600 to-teal-600 rounded-xl p-6 shadow">
              <div className="flex items-center justify-between flex-wrap gap-4">
                <div>
                  <h3 className="font-semibold text-white mb-1">Actions rapides</h3>
                  <p className="text-green-100 text-sm">
                    Après ajout de données, actualisez le dashboard pour voir les nouvelles analyses.
                  </p>
                </div>
                <button
                  onClick={async () => {
                    if (dashboardActivated) {
                      setDashboardActivated(false);
                      setDashboardData(null);
                    }
                    const success = await handleActivateDashboard();
                    if (success) {
                      setActiveTab('overview');
                    }
                  }}
                  disabled={!workspaceInfo?.dataset?.has_data}
                  className="flex items-center gap-2 px-6 py-3 bg-white text-green-600 rounded-lg font-medium hover:bg-green-50 transition-colors disabled:opacity-50"
                >
                  <RefreshCw className="h-5 w-5" />
                  Recalculer Dashboard
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Add Supplier Modal */}
        {showAddSupplierModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-xl max-w-md w-full">
              <div className="p-6 border-b border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900">Ajouter un Fournisseur</h3>
              </div>
              <div className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nom *</label>
                  <input
                    type="text"
                    value={newSupplierForm.name}
                    onChange={(e) => setNewSupplierForm({ ...newSupplierForm, name: e.target.value })}
                    placeholder="Nom du fournisseur"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                  <textarea
                    value={newSupplierForm.description}
                    onChange={(e) => setNewSupplierForm({ ...newSupplierForm, description: e.target.value })}
                    placeholder="Description optionnelle"
                    rows={2}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Catégorie</label>
                  <input
                    type="text"
                    value={newSupplierForm.category}
                    onChange={(e) => setNewSupplierForm({ ...newSupplierForm, category: e.target.value })}
                    placeholder="Ex: Composants, Matières premières..."
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </div>
              <div className="p-6 border-t border-gray-200 flex justify-end gap-3">
                <button
                  onClick={() => setShowAddSupplierModal(false)}
                  className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  Annuler
                </button>
                <button
                  onClick={handleAddSupplier}
                  disabled={addingSupplier || !newSupplierForm.name.trim()}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
                >
                  {addingSupplier ? 'Ajout...' : 'Ajouter'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Add Order Modal */}
        {showAddOrderModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
              <div className="p-6 border-b border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900">Ajouter une Commande</h3>
                <p className="text-sm text-gray-500 mt-1">
                  {workspaceInfo?.workspace?.data_type === 'delays' && 'Case A - Retards uniquement'}
                  {workspaceInfo?.workspace?.data_type === 'late_days' && 'Case B - Défauts uniquement'}
                  {workspaceInfo?.workspace?.data_type === 'mixed' && 'Case C - Retards et défauts'}
                </p>
              </div>
              <div className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Fournisseur *</label>
                  <select
                    value={newOrderForm.supplier_name}
                    onChange={(e) => setNewOrderForm({ ...newOrderForm, supplier_name: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="">Sélectionnez un fournisseur</option>
                    {suppliersData.map(s => (
                      <option key={s.name} value={s.name}>{s.name}</option>
                    ))}
                    {workspaceInfo?.dataset?.suppliers?.filter(s => !suppliersData.find(sd => sd.name === s)).map(s => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
                
                {/* Date fields - Show for Case A (delays) and Case C (mixed) */}
                {(workspaceInfo?.workspace?.data_type === 'delays' || workspaceInfo?.workspace?.data_type === 'mixed') && (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Date Promise *</label>
                      <input
                        type="date"
                        value={newOrderForm.date_promised}
                        onChange={(e) => setNewOrderForm({ ...newOrderForm, date_promised: e.target.value })}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Date Livrée</label>
                      <input
                        type="date"
                        value={newOrderForm.date_delivered}
                        onChange={(e) => setNewOrderForm({ ...newOrderForm, date_delivered: e.target.value })}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                  </div>
                )}
                
                {/* Defects field - Show for Case B (late_days) and Case C (mixed) */}
                {(workspaceInfo?.workspace?.data_type === 'late_days' || workspaceInfo?.workspace?.data_type === 'mixed') && (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Taux de défauts (0-1) {workspaceInfo?.workspace?.data_type === 'late_days' ? '*' : ''}
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        max="1"
                        value={newOrderForm.defects}
                        onChange={(e) => setNewOrderForm({ ...newOrderForm, defects: parseFloat(e.target.value) || 0 })}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Quantité</label>
                      <input
                        type="number"
                        min="0"
                        value={newOrderForm.quantity}
                        onChange={(e) => setNewOrderForm({ ...newOrderForm, quantity: parseInt(e.target.value) || 0 })}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                  </div>
                )}
                
                {/* Quantity field for Case A (no defects row) */}
                {workspaceInfo?.workspace?.data_type === 'delays' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Quantité</label>
                    <input
                      type="number"
                      min="0"
                      value={newOrderForm.quantity}
                      onChange={(e) => setNewOrderForm({ ...newOrderForm, quantity: parseInt(e.target.value) || 0 })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                )}
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Référence commande</label>
                  <input
                    type="text"
                    value={newOrderForm.order_reference}
                    onChange={(e) => setNewOrderForm({ ...newOrderForm, order_reference: e.target.value })}
                    placeholder="Ex: CMD-2024-001"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                  <textarea
                    value={newOrderForm.notes}
                    onChange={(e) => setNewOrderForm({ ...newOrderForm, notes: e.target.value })}
                    placeholder="Notes optionnelles"
                    rows={2}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </div>
              <div className="p-6 border-t border-gray-200 flex justify-end gap-3">
                <button
                  onClick={() => setShowAddOrderModal(false)}
                  className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  Annuler
                </button>
                <button
                  onClick={handleAddOrder}
                  disabled={addingOrder || !newOrderForm.supplier_name || 
                    ((workspaceInfo?.workspace?.data_type === 'delays' || workspaceInfo?.workspace?.data_type === 'mixed') && !newOrderForm.date_promised)}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50"
                >
                  {addingOrder ? 'Ajout...' : 'Ajouter'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Supplier CSV Upload Modal */}
        {showSupplierUploadModal && selectedSupplierForOrders && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-xl max-w-md w-full">
              <div className="p-6 border-b border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900">
                  Importer CSV - {selectedSupplierForOrders}
                </h3>
              </div>
              <div className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Mode d'import</label>
                  <div className="flex gap-4">
                    <label className="flex items-center gap-2">
                      <input
                        type="radio"
                        checked={supplierUploadMode === 'standard'}
                        onChange={() => setSupplierUploadMode('standard')}
                        className="text-blue-600"
                      />
                      <span className="text-sm">Standard</span>
                    </label>
                    <label className="flex items-center gap-2">
                      <input
                        type="radio"
                        checked={supplierUploadMode === 'intelligent'}
                        onChange={() => setSupplierUploadMode('intelligent')}
                        className="text-blue-600"
                      />
                      <span className="text-sm">Intelligent (LLM)</span>
                    </label>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Mode de fusion</label>
                  <div className="flex gap-4">
                    <label className="flex items-center gap-2">
                      <input
                        type="radio"
                        checked={mergeMode === 'append'}
                        onChange={() => setMergeMode('append')}
                        className="text-blue-600"
                      />
                      <span className="text-sm">Ajouter aux données</span>
                    </label>
                    <label className="flex items-center gap-2">
                      <input
                        type="radio"
                        checked={mergeMode === 'replace'}
                        onChange={() => setMergeMode('replace')}
                        className="text-blue-600"
                      />
                      <span className="text-sm">Remplacer les données</span>
                    </label>
                  </div>
                </div>
                <div className="p-4 bg-blue-50 rounded-lg">
                  <p className="text-sm text-blue-700">
                    <strong>Format attendu :</strong> CSV avec colonnes date_promised, date_delivered, defects
                    {supplierUploadMode === 'intelligent' && ' (les noms de colonnes seront détectés automatiquement)'}
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Fichier CSV</label>
                  <input
                    type="file"
                    accept=".csv"
                    onChange={handleSupplierCSVUpload}
                    disabled={uploadingSupplierCSV}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                {uploadingSupplierCSV && (
                  <div className="flex items-center gap-2 text-blue-600">
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
                    <span>Import en cours...</span>
                  </div>
                )}
              </div>
              <div className="p-6 border-t border-gray-200 flex justify-end">
                <button
                  onClick={() => setShowSupplierUploadModal(false)}
                  disabled={uploadingSupplierCSV}
                  className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  Fermer
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
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={barData} margin={{ top: 20, right: 30, left: 20, bottom: 80 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis 
                      dataKey="name" 
                      tick={{ fontSize: 10, angle: -45, textAnchor: 'end' }}
                      interval={0}
                      height={80}
                    />
                    <YAxis domain={[0, 100]} />
                    <Tooltip 
                      formatter={(value: number) => [`${value}`, 'Score de risque']}
                      labelFormatter={(label) => `Fournisseur: ${label}`}
                    />
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
                    <ClientOnlyTime />
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
                : 'Ce workspace n\'a pas de dataset initial. Créez un nouveau workspace avec des données.'}
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
                  <LineChart data={predictionData} margin={{ top: 20, right: 30, left: 20, bottom: 80 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis 
                      dataKey="name" 
                      tick={{ fontSize: 10, angle: -45, textAnchor: 'end' }}
                      interval={0}
                      height={80}
                    />
                    <YAxis />
                    <Tooltip 
                      labelFormatter={(label) => `Fournisseur: ${label}`}
                    />
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
                  <ResponsiveContainer width="100%" height={400}>
                    <BarChart data={multiModelPredictionData} barCategoryGap="15%" margin={{ top: 20, right: 30, left: 20, bottom: 80 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis 
                        dataKey="name" 
                        tick={{ fontSize: 10, angle: -45, textAnchor: 'end' }}
                        interval={0}
                        height={80}
                      />
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
                  <ResponsiveContainer width="100%" height={400}>
                    <BarChart data={multiModelPredictionData} barCategoryGap="15%" margin={{ top: 20, right: 30, left: 20, bottom: 80 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis 
                        dataKey="name" 
                        tick={{ fontSize: 10, angle: -45, textAnchor: 'end' }}
                        interval={0}
                        height={80}
                      />
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
                : 'Ce workspace n\'a pas de dataset initial. Créez un nouveau workspace avec des données.'}
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

            {/* PDF Workspace Report Export */}
            <div className="bg-gradient-to-r from-red-600 to-rose-600 rounded-xl p-6 shadow text-white">
              <div className="flex items-center justify-between flex-wrap gap-4">
                <div>
                  <h3 className="font-semibold text-lg mb-1">📄 Rapport PDF Complet</h3>
                  <p className="text-red-100 text-sm">
                    Rapport d'anticipation complet du workspace : KPIs, fournisseurs, prédictions et actions recommandées
                  </p>
                  <p className="text-red-200 text-xs mt-1">
                    Inclut : Nom et type du workspace • Liste des fournisseurs • KPIs par fournisseur • Résumés des prédictions • Actions prioritaires
                  </p>
                </div>
                <button
                  onClick={handleExportPDF}
                  disabled={exportLoading}
                  className="flex items-center gap-2 px-6 py-3 bg-white text-red-600 hover:bg-red-50 rounded-lg font-medium disabled:opacity-50"
                >
                  {exportLoading ? <RefreshCw className="h-5 w-5 animate-spin" /> : <FileDown className="h-5 w-5" />}
                  Télécharger PDF
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
      </div>
    </div>
  );
}
