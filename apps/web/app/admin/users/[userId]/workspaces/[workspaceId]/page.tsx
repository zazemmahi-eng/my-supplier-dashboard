'use client';
/**
 * Admin Read-Only Workspace Dashboard View
 * 
 * This page allows admins to view a user's workspace dashboard
 * in COMPLETE READ-ONLY mode.
 * 
 * Features:
 * - Same dashboard data as user sees
 * - All edit/action buttons are HIDDEN or DISABLED
 * - Clear "ADMIN MODE - READ ONLY" indicator
 * - Audit logging of admin access
 */

import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useRouter, useParams } from 'next/navigation';
import {
  PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend, LineChart, Line
} from 'recharts';
import {
  Shield, Lock, Eye, ArrowLeft, AlertTriangle, CheckCircle,
  TrendingUp, TrendingDown, Activity, Users, Package, Clock,
  BarChart3, PieChart as PieChartIcon, FolderOpen
} from 'lucide-react';

const API_BASE_URL = process.env.NEXT_PUBLIC_SUPPLIER_API_URL ?? 'http://127.0.0.1:8000';

// ============================================
// TYPES
// ============================================

interface DashboardData {
  admin_view: boolean;
  read_only: boolean;
  user_id: string;
  user_email: string;
  workspace: {
    id: string;
    name: string;
    description?: string;
    data_type: string;
    status: string;
    has_data: boolean;
  };
  data_type: string;
  case_type: string;
  case_description: string;
  kpis_globaux: Record<string, number>;
  custom_kpis: Record<string, number>;
  suppliers: Array<{
    supplier: string;
    score_risque: number;
    niveau_risque: string;
    status: string;
    nb_commandes: number;
  }>;
  actions: Array<{
    supplier: string;
    action: string;
    priority: string;
    raison: string;
  }>;
  predictions: Array<{
    supplier: string;
    predicted_defect: number | null;
    predicted_delay: number | null;
    confiance: string;
  }>;
  distribution: {
    faible: { count: number };
    modere: { count: number };
    eleve: { count: number };
  };
}

// ============================================
// COLORS
// ============================================

const COLORS = {
  faible: '#10b981',
  modere: '#f59e0b',
  eleve: '#ef4444',
  good: '#10b981',
  warning: '#f59e0b',
  alert: '#ef4444',
  primary: '#7c3aed'
};

// ============================================
// COMPONENT
// ============================================

export default function AdminWorkspaceView() {
  const router = useRouter();
  const params = useParams();
  const userId = params.userId as string;
  const workspaceId = params.workspaceId as string;
  
  // State
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Admin auth
  const [adminUserId, setAdminUserId] = useState<string | null>(null);
  const [adminEmail, setAdminEmail] = useState<string | null>(null);
  
  // ============================================
  // LOAD ADMIN CREDENTIALS
  // ============================================
  
  useEffect(() => {
    const storedUserId = localStorage.getItem('admin_user_id');
    const storedEmail = localStorage.getItem('admin_email');
    
    if (!storedUserId) {
      router.push('/admin');
      return;
    }
    
    setAdminUserId(storedUserId);
    setAdminEmail(storedEmail);
  }, [router]);
  
  // ============================================
  // FETCH DASHBOARD DATA
  // ============================================
  
  const fetchDashboard = useCallback(async () => {
    if (!adminUserId || !userId || !workspaceId) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const response = await axios.get(
        `${API_BASE_URL}/api/admin/users/${userId}/workspaces/${workspaceId}/dashboard`,
        {
          headers: {
            'X-Admin-User-ID': adminUserId,
            'X-Admin-Email': adminEmail || ''
          }
        }
      );
      
      setDashboardData(response.data);
    } catch (err: any) {
      console.error('Failed to fetch dashboard:', err);
      setError(err.response?.data?.detail || 'Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  }, [adminUserId, adminEmail, userId, workspaceId]);
  
  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);
  
  // ============================================
  // CHART DATA
  // ============================================
  
  const riskDistributionData = dashboardData?.distribution ? [
    { name: 'Low Risk', value: dashboardData.distribution.faible?.count || 0, color: COLORS.faible },
    { name: 'Medium Risk', value: dashboardData.distribution.modere?.count || 0, color: COLORS.modere },
    { name: 'High Risk', value: dashboardData.distribution.eleve?.count || 0, color: COLORS.eleve }
  ].filter(d => d.value > 0) : [];
  
  const supplierRiskData = dashboardData?.suppliers?.map(s => ({
    name: s.supplier.length > 12 ? s.supplier.slice(0, 12) + '...' : s.supplier,
    fullName: s.supplier,
    score: s.score_risque,
    fill: COLORS[s.status as keyof typeof COLORS] || '#6b7280'
  })) || [];
  
  const predictionData = dashboardData?.predictions?.map(p => ({
    name: p.supplier.length > 10 ? p.supplier.slice(0, 10) + '...' : p.supplier,
    fullName: p.supplier,
    defauts: p.predicted_defect,
    retards: p.predicted_delay
  })) || [];
  
  // ============================================
  // LOADING STATE
  // ============================================
  
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin h-12 w-12 border-4 border-purple-500 border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-gray-400">Loading dashboard...</p>
        </div>
      </div>
    );
  }
  
  // ============================================
  // ERROR STATE
  // ============================================
  
  if (error) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
        <div className="bg-gray-800 rounded-2xl p-8 max-w-md w-full text-center">
          <AlertTriangle className="h-16 w-16 text-red-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-white mb-2">Error</h1>
          <p className="text-gray-400 mb-6">{error}</p>
          <button
            onClick={() => router.push('/admin')}
            className="px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-medium"
          >
            Return to Admin Dashboard
          </button>
        </div>
      </div>
    );
  }
  
  if (!dashboardData) {
    return null;
  }
  
  // ============================================
  // MAIN RENDER
  // ============================================
  
  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* Admin Header - READ ONLY INDICATOR */}
      <div className="sticky top-0 z-40 bg-gradient-to-r from-red-900 via-purple-900 to-red-900 border-b border-red-700">
        <div className="max-w-7xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={() => router.push('/admin')}
                className="p-2 hover:bg-white/10 rounded-lg"
              >
                <ArrowLeft className="h-5 w-5" />
              </button>
              
              <div className="flex items-center gap-3">
                <div className="p-2 bg-red-600 rounded-lg">
                  <Lock className="h-5 w-5 text-white" />
                </div>
                <div>
                  <h1 className="font-bold">Admin View - {dashboardData.workspace.name}</h1>
                  <p className="text-sm text-red-300">User: {dashboardData.user_email}</p>
                </div>
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              <span className="px-4 py-1.5 bg-red-500 text-white text-sm font-bold rounded-full flex items-center gap-2 animate-pulse">
                <Lock className="h-4 w-4" />
                READ-ONLY MODE
              </span>
              <span className="px-3 py-1 bg-purple-500/20 border border-purple-500/50 text-purple-300 text-xs font-bold rounded-full">
                ADMIN VIEW
              </span>
            </div>
          </div>
        </div>
      </div>
      
      {/* Read-Only Warning Banner */}
      <div className="bg-yellow-900/30 border-b border-yellow-700/50">
        <div className="max-w-7xl mx-auto px-4 py-2">
          <div className="flex items-center gap-2 text-yellow-400 text-sm">
            <Eye className="h-4 w-4" />
            <span>
              You are viewing this dashboard as an administrator. All modification actions are disabled.
            </span>
          </div>
        </div>
      </div>
      
      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* Workspace Info */}
        <div className="bg-gray-800 rounded-xl p-6 mb-6 border border-gray-700">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <FolderOpen className="h-6 w-6 text-purple-400" />
                <h2 className="text-xl font-bold">{dashboardData.workspace.name}</h2>
                <span className="px-2 py-1 bg-blue-500/20 text-blue-400 text-xs rounded">
                  {dashboardData.case_type.toUpperCase()}
                </span>
              </div>
              {dashboardData.workspace.description && (
                <p className="text-gray-400">{dashboardData.workspace.description}</p>
              )}
              <p className="text-sm text-gray-500 mt-2">{dashboardData.case_description}</p>
            </div>
            <div className="text-right">
              <p className="text-sm text-gray-400">Owned by</p>
              <p className="font-medium">{dashboardData.user_email}</p>
            </div>
          </div>
        </div>
        
        {/* KPIs Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {Object.entries(dashboardData.kpis_globaux).slice(0, 8).map(([key, value]) => (
            <div key={key} className="bg-gray-800 rounded-xl p-4 border border-gray-700">
              <p className="text-sm text-gray-400 mb-1 capitalize">
                {key.replace(/_/g, ' ')}
              </p>
              <p className="text-2xl font-bold">
                {typeof value === 'number' ? value.toFixed(2) : value}
              </p>
            </div>
          ))}
        </div>
        
        {/* Custom KPIs */}
        {Object.keys(dashboardData.custom_kpis).length > 0 && (
          <div className="bg-gray-800 rounded-xl p-6 mb-6 border border-gray-700">
            <h3 className="font-semibold mb-4 flex items-center gap-2">
              <Activity className="h-5 w-5 text-purple-400" />
              Custom KPIs
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {Object.entries(dashboardData.custom_kpis).map(([name, value]) => (
                <div key={name} className="p-4 bg-purple-900/30 rounded-lg border border-purple-700/50">
                  <p className="text-sm text-purple-300 mb-1">{name}</p>
                  <p className="text-xl font-bold text-purple-100">{value}</p>
                </div>
              ))}
            </div>
          </div>
        )}
        
        {/* Charts Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          {/* Risk Distribution */}
          <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
            <h3 className="font-semibold mb-4 flex items-center gap-2">
              <PieChartIcon className="h-5 w-5 text-green-400" />
              Risk Distribution
            </h3>
            {riskDistributionData.length > 0 ? (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={riskDistributionData}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={80}
                      paddingAngle={5}
                      dataKey="value"
                    >
                      {riskDistributionData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: '#1f2937', 
                        border: '1px solid #374151',
                        borderRadius: '8px'
                      }}
                    />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-64 flex items-center justify-center text-gray-500">
                No risk distribution data
              </div>
            )}
          </div>
          
          {/* Supplier Risk Scores */}
          <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
            <h3 className="font-semibold mb-4 flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-blue-400" />
              Supplier Risk Scores
            </h3>
            {supplierRiskData.length > 0 ? (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={supplierRiskData} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                    <XAxis type="number" domain={[0, 100]} tick={{ fill: '#9ca3af' }} />
                    <YAxis dataKey="name" type="category" tick={{ fill: '#9ca3af' }} width={100} />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: '#1f2937', 
                        border: '1px solid #374151',
                        borderRadius: '8px'
                      }}
                      formatter={(value: number) => [`${value.toFixed(1)}`, 'Risk Score']}
                    />
                    <Bar dataKey="score" radius={[0, 4, 4, 0]}>
                      {supplierRiskData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-64 flex items-center justify-center text-gray-500">
                No supplier data
              </div>
            )}
          </div>
        </div>
        
        {/* Predictions Chart */}
        <div className="bg-gray-800 rounded-xl p-6 mb-6 border border-gray-700">
          <h3 className="font-semibold mb-4 flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-purple-400" />
            Predictions by Supplier
          </h3>
          {predictionData.length > 0 ? (
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={predictionData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis dataKey="name" tick={{ fill: '#9ca3af' }} />
                  <YAxis tick={{ fill: '#9ca3af' }} />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: '#1f2937', 
                      border: '1px solid #374151',
                      borderRadius: '8px'
                    }}
                  />
                  <Legend />
                  <Bar dataKey="defauts" name="Predicted Defects" fill="#ef4444" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="retards" name="Predicted Delays" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-64 flex items-center justify-center text-gray-500">
              No prediction data
            </div>
          )}
        </div>
        
        {/* Supplier Table */}
        <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden mb-6">
          <div className="p-4 border-b border-gray-700">
            <h3 className="font-semibold flex items-center gap-2">
              <Users className="h-5 w-5 text-green-400" />
              Suppliers ({dashboardData.suppliers?.length || 0})
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-700/50">
                <tr>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-300">Supplier</th>
                  <th className="px-4 py-3 text-center text-sm font-medium text-gray-300">Risk Score</th>
                  <th className="px-4 py-3 text-center text-sm font-medium text-gray-300">Risk Level</th>
                  <th className="px-4 py-3 text-center text-sm font-medium text-gray-300">Orders</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700">
                {dashboardData.suppliers?.map((supplier, index) => (
                  <tr key={index} className="hover:bg-gray-700/30">
                    <td className="px-4 py-3 font-medium">{supplier.supplier}</td>
                    <td className="px-4 py-3 text-center">
                      <span className="font-mono">{supplier.score_risque.toFixed(1)}</span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                        supplier.status === 'faible' ? 'bg-green-500/20 text-green-400' :
                        supplier.status === 'modere' ? 'bg-yellow-500/20 text-yellow-400' :
                        'bg-red-500/20 text-red-400'
                      }`}>
                        {supplier.niveau_risque}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center text-gray-400">
                      {supplier.nb_commandes}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        
        {/* Recommended Actions */}
        {dashboardData.actions?.length > 0 && (
          <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
            <h3 className="font-semibold mb-4 flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-yellow-400" />
              Recommended Actions
            </h3>
            <div className="space-y-3">
              {dashboardData.actions.map((action, index) => (
                <div 
                  key={index}
                  className={`p-4 rounded-lg border ${
                    action.priority === 'high' ? 'bg-red-900/20 border-red-700/50' :
                    action.priority === 'medium' ? 'bg-yellow-900/20 border-yellow-700/50' :
                    'bg-gray-700/30 border-gray-600'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-medium">{action.supplier}</p>
                      <p className="text-gray-400 text-sm mt-1">{action.action}</p>
                      <p className="text-gray-500 text-xs mt-1">Reason: {action.raison}</p>
                    </div>
                    <span className={`px-2 py-1 rounded text-xs font-medium ${
                      action.priority === 'high' ? 'bg-red-500/20 text-red-400' :
                      action.priority === 'medium' ? 'bg-yellow-500/20 text-yellow-400' :
                      'bg-gray-600 text-gray-300'
                    }`}>
                      {action.priority.toUpperCase()}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      
      {/* Footer with Admin Info */}
      <div className="border-t border-gray-700 bg-gray-800/50">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between text-sm text-gray-500">
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4" />
              <span>Admin: {adminEmail}</span>
            </div>
            <div className="flex items-center gap-2">
              <Lock className="h-4 w-4" />
              <span>Read-Only Access • No modifications allowed</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
