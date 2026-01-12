'use client';
/**
 * Global Dashboard Page
 * 
 * This is the main entry point after login.
 * Shows a READ-ONLY overview of ALL user workspaces with:
 * - Total workspaces count
 * - Workspace summaries (name, case, supplier count)
 * - Aggregated KPIs across all workspaces
 * - Global trends and risk distribution
 * 
 * Navigation: "Workspaces" button → /workspaces
 */

import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import Link from 'next/link';
import {
  PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend
} from 'recharts';
import {
  LayoutDashboard, FolderOpen, TrendingUp, TrendingDown, AlertTriangle,
  Clock, CheckCircle, Users, Package, BarChart3, ArrowRight, Plus,
  Activity, FileText, Database, Shield, Zap, Target
} from 'lucide-react';

const API_BASE_URL = process.env.NEXT_PUBLIC_SUPPLIER_API_URL ?? 'http://127.0.0.1:8000';

// ============================================
// TYPE DEFINITIONS
// ============================================

interface WorkspaceSummary {
  id: string;
  name: string;
  description: string | null;
  data_type: string;
  case_label: string;
  status: string;
  has_data: boolean;
  supplier_count: number;
  row_count: number;
  created_at: string;
  updated_at: string;
}

interface GlobalDashboardData {
  summary: {
    total_workspaces: number;
    workspaces_with_data: number;
    total_suppliers: number;
    total_orders: number;
  };
  global_kpis: {
    avg_delay: number;
    avg_defect: number;
    delay_orders_analyzed: number;
    defect_orders_analyzed: number;
  };
  risk_distribution: {
    faible: number;
    modere: number;
    eleve: number;
  };
  workspaces: WorkspaceSummary[];
  case_breakdown: {
    case_a_count: number;
    case_b_count: number;
    case_c_count: number;
  };
}

// Colors
const COLORS = {
  primary: '#3b82f6',
  success: '#10b981',
  warning: '#f59e0b',
  danger: '#ef4444',
  purple: '#8b5cf6',
  indigo: '#6366f1'
};

const RISK_COLORS = {
  faible: '#10b981',
  modere: '#f59e0b',
  eleve: '#ef4444'
};

// Case type styling
const CASE_STYLES = {
  delays: { bg: 'bg-blue-100', text: 'text-blue-800', icon: '📅', label: 'Case A - Retards' },
  late_days: { bg: 'bg-purple-100', text: 'text-purple-800', icon: '🔍', label: 'Case B - Défauts' },
  mixed: { bg: 'bg-green-100', text: 'text-green-800', icon: '📊', label: 'Case C - Mixte' }
};

// ============================================
// MAIN COMPONENT
// ============================================

export default function GlobalDashboardPage() {
  const [data, setData] = useState<GlobalDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ============================================
  // DATA FETCHING
  // ============================================

  const fetchDashboardData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await axios.get(`${API_BASE_URL}/api/workspaces/global/dashboard`);
      setData(response.data);
    } catch (err) {
      console.error('Erreur chargement dashboard global:', err);
      setError('Impossible de charger les données. Vérifiez que le backend est lancé.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  // ============================================
  // LOADING STATE
  // ============================================

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Chargement du tableau de bord...</p>
        </div>
      </div>
    );
  }

  // ============================================
  // ERROR STATE
  // ============================================

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-lg p-8 max-w-md text-center">
          <AlertTriangle className="h-12 w-12 text-amber-500 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Erreur de connexion</h2>
          <p className="text-gray-600 mb-6">{error}</p>
          <button
            onClick={fetchDashboardData}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Réessayer
          </button>
        </div>
      </div>
    );
  }

  // ============================================
  // EMPTY STATE (No workspaces)
  // ============================================

  if (!data || data.summary.total_workspaces === 0) {
    return (
      <div className="min-h-screen bg-gray-50">
        {/* Header */}
        <div className="bg-white border-b border-gray-200">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 rounded-xl">
                  <LayoutDashboard className="h-6 w-6 text-blue-600" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold text-gray-900">Dashboard Global</h1>
                  <p className="text-gray-500 text-sm">Vue d'ensemble de vos workspaces</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Empty State Content */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-12 text-center">
            <div className="w-20 h-20 bg-gradient-to-br from-blue-100 to-indigo-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <FolderOpen className="h-10 w-10 text-blue-600" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-3">Bienvenue !</h2>
            <p className="text-gray-600 mb-8 max-w-md mx-auto">
              Vous n'avez pas encore de workspace. Créez votre premier workspace pour commencer
              à analyser vos fournisseurs.
            </p>
            <Link href="/workspaces">
              <button className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-semibold rounded-xl hover:from-blue-700 hover:to-indigo-700 transition-all shadow-lg shadow-blue-500/25">
                <Plus className="h-5 w-5" />
                Créer mon premier Workspace
              </button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // ============================================
  // PREPARE CHART DATA
  // ============================================

  const riskChartData = [
    { name: 'Faible', value: data.risk_distribution.faible, color: RISK_COLORS.faible },
    { name: 'Modéré', value: data.risk_distribution.modere, color: RISK_COLORS.modere },
    { name: 'Élevé', value: data.risk_distribution.eleve, color: RISK_COLORS.eleve }
  ].filter(item => item.value > 0);

  const caseBreakdownData = [
    { name: 'Retards (A)', value: data.case_breakdown.case_a_count, color: '#3b82f6' },
    { name: 'Défauts (B)', value: data.case_breakdown.case_b_count, color: '#8b5cf6' },
    { name: 'Mixte (C)', value: data.case_breakdown.case_c_count, color: '#10b981' }
  ].filter(item => item.value > 0);

  // ============================================
  // MAIN RENDER
  // ============================================

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl shadow-lg">
                <LayoutDashboard className="h-6 w-6 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Dashboard Global</h1>
                <p className="text-gray-500 text-sm">Vue d'ensemble de tous vos workspaces</p>
              </div>
            </div>
            <Link href="/workspaces">
              <button className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-medium rounded-xl hover:from-blue-700 hover:to-indigo-700 transition-all shadow-md">
                <FolderOpen className="h-5 w-5" />
                Workspaces
                <ArrowRight className="h-4 w-4" />
              </button>
            </Link>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          {/* Total Workspaces */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="p-2 bg-blue-100 rounded-lg">
                <FolderOpen className="h-5 w-5 text-blue-600" />
              </div>
              <span className="text-xs font-medium text-blue-600 bg-blue-50 px-2 py-1 rounded-full">
                Total
              </span>
            </div>
            <div className="text-3xl font-bold text-gray-900 mb-1">
              {data.summary.total_workspaces}
            </div>
            <p className="text-sm text-gray-500">Workspaces créés</p>
            <div className="mt-3 text-xs text-gray-400">
              {data.summary.workspaces_with_data} avec données
            </div>
          </div>

          {/* Total Suppliers */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="p-2 bg-emerald-100 rounded-lg">
                <Users className="h-5 w-5 text-emerald-600" />
              </div>
              <span className="text-xs font-medium text-emerald-600 bg-emerald-50 px-2 py-1 rounded-full">
                Fournisseurs
              </span>
            </div>
            <div className="text-3xl font-bold text-gray-900 mb-1">
              {data.summary.total_suppliers}
            </div>
            <p className="text-sm text-gray-500">Fournisseurs suivis</p>
            <div className="mt-3 text-xs text-gray-400">
              Dans tous les workspaces
            </div>
          </div>

          {/* Total Orders */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="p-2 bg-purple-100 rounded-lg">
                <Package className="h-5 w-5 text-purple-600" />
              </div>
              <span className="text-xs font-medium text-purple-600 bg-purple-50 px-2 py-1 rounded-full">
                Commandes
              </span>
            </div>
            <div className="text-3xl font-bold text-gray-900 mb-1">
              {data.summary.total_orders.toLocaleString()}
            </div>
            <p className="text-sm text-gray-500">Commandes analysées</p>
            <div className="mt-3 text-xs text-gray-400">
              Données historiques
            </div>
          </div>

          {/* Average Delay */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="p-2 bg-amber-100 rounded-lg">
                <Clock className="h-5 w-5 text-amber-600" />
              </div>
              <span className="text-xs font-medium text-amber-600 bg-amber-50 px-2 py-1 rounded-full">
                Global
              </span>
            </div>
            <div className="text-3xl font-bold text-gray-900 mb-1">
              {data.global_kpis.avg_delay.toFixed(1)}j
            </div>
            <p className="text-sm text-gray-500">Retard moyen global</p>
            <div className="mt-3 text-xs text-gray-400">
              {data.global_kpis.delay_orders_analyzed} commandes
            </div>
          </div>
        </div>

        {/* Charts Row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          {/* Risk Distribution */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <div className="flex items-center gap-2 mb-6">
              <Shield className="h-5 w-5 text-gray-700" />
              <h2 className="text-lg font-semibold text-gray-900">Distribution des Risques</h2>
            </div>
            {riskChartData.length > 0 ? (
              <div className="flex items-center gap-8">
                <div className="w-48 h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={riskChartData}
                        cx="50%"
                        cy="50%"
                        innerRadius={45}
                        outerRadius={70}
                        paddingAngle={3}
                        dataKey="value"
                      >
                        {riskChartData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex-1 space-y-3">
                  {riskChartData.map((item, index) => (
                    <div key={index} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div 
                          className="w-3 h-3 rounded-full" 
                          style={{ backgroundColor: item.color }}
                        />
                        <span className="text-sm text-gray-600">{item.name}</span>
                      </div>
                      <span className="text-sm font-semibold text-gray-900">{item.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="h-48 flex items-center justify-center text-gray-400">
                <p>Aucune donnée de risque disponible</p>
              </div>
            )}
          </div>

          {/* Case Breakdown */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <div className="flex items-center gap-2 mb-6">
              <BarChart3 className="h-5 w-5 text-gray-700" />
              <h2 className="text-lg font-semibold text-gray-900">Types de Cas</h2>
            </div>
            {caseBreakdownData.length > 0 ? (
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={caseBreakdownData} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} />
                    <XAxis type="number" />
                    <YAxis dataKey="name" type="category" width={100} />
                    <Tooltip />
                    <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                      {caseBreakdownData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-48 flex items-center justify-center text-gray-400">
                <p>Aucun workspace créé</p>
              </div>
            )}
          </div>
        </div>

        {/* Global KPIs */}
        {(data.global_kpis.delay_orders_analyzed > 0 || data.global_kpis.defect_orders_analyzed > 0) && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mb-8">
            <div className="flex items-center gap-2 mb-6">
              <Activity className="h-5 w-5 text-gray-700" />
              <h2 className="text-lg font-semibold text-gray-900">KPIs Globaux Agrégés</h2>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
              <div className="text-center p-4 bg-blue-50 rounded-xl">
                <div className="text-2xl font-bold text-blue-700">{data.global_kpis.avg_delay.toFixed(1)}j</div>
                <div className="text-sm text-blue-600 mt-1">Retard Moyen</div>
              </div>
              <div className="text-center p-4 bg-purple-50 rounded-xl">
                <div className="text-2xl font-bold text-purple-700">{data.global_kpis.avg_defect.toFixed(2)}%</div>
                <div className="text-sm text-purple-600 mt-1">Taux Défaut Moyen</div>
              </div>
              <div className="text-center p-4 bg-emerald-50 rounded-xl">
                <div className="text-2xl font-bold text-emerald-700">{data.global_kpis.delay_orders_analyzed}</div>
                <div className="text-sm text-emerald-600 mt-1">Analyses Délai</div>
              </div>
              <div className="text-center p-4 bg-amber-50 rounded-xl">
                <div className="text-2xl font-bold text-amber-700">{data.global_kpis.defect_orders_analyzed}</div>
                <div className="text-sm text-amber-600 mt-1">Analyses Qualité</div>
              </div>
            </div>
          </div>
        )}

        {/* Workspaces List */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FolderOpen className="h-5 w-5 text-gray-700" />
              <h2 className="text-lg font-semibold text-gray-900">Mes Workspaces</h2>
            </div>
            <Link href="/workspaces">
              <button className="text-sm text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1">
                Voir tous
                <ArrowRight className="h-4 w-4" />
              </button>
            </Link>
          </div>
          
          <div className="divide-y divide-gray-100">
            {data.workspaces.slice(0, 5).map((workspace) => {
              const caseStyle = CASE_STYLES[workspace.data_type as keyof typeof CASE_STYLES] || CASE_STYLES.mixed;
              
              return (
                <Link key={workspace.id} href={`/workspaces?open=${workspace.id}`}>
                  <div className="px-6 py-4 hover:bg-gray-50 transition-colors cursor-pointer">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className={`p-2 rounded-lg ${caseStyle.bg}`}>
                          <span className="text-lg">{caseStyle.icon}</span>
                        </div>
                        <div>
                          <h3 className="font-semibold text-gray-900">{workspace.name}</h3>
                          <div className="flex items-center gap-3 mt-1">
                            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${caseStyle.bg} ${caseStyle.text}`}>
                              {caseStyle.label}
                            </span>
                            <span className="text-xs text-gray-500">
                              {workspace.supplier_count} fournisseur{workspace.supplier_count !== 1 ? 's' : ''}
                            </span>
                            <span className="text-xs text-gray-400">•</span>
                            <span className="text-xs text-gray-500">
                              {workspace.row_count} commandes
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        {workspace.has_data ? (
                          <span className="flex items-center gap-1 text-xs font-medium text-emerald-600 bg-emerald-50 px-2 py-1 rounded-full">
                            <CheckCircle className="h-3 w-3" />
                            Données
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-xs font-medium text-gray-500 bg-gray-100 px-2 py-1 rounded-full">
                            <AlertTriangle className="h-3 w-3" />
                            Vide
                          </span>
                        )}
                        <ArrowRight className="h-5 w-5 text-gray-400" />
                      </div>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>

          {data.workspaces.length > 5 && (
            <div className="px-6 py-4 bg-gray-50 text-center">
              <Link href="/workspaces">
                <button className="text-sm text-blue-600 hover:text-blue-700 font-medium">
                  Voir les {data.workspaces.length - 5} autres workspaces →
                </button>
              </Link>
            </div>
          )}
        </div>

        {/* Quick Actions */}
        <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4">
          <Link href="/workspaces">
            <div className="bg-gradient-to-r from-blue-500 to-blue-600 rounded-xl p-6 text-white hover:from-blue-600 hover:to-blue-700 transition-all cursor-pointer shadow-lg">
              <FolderOpen className="h-8 w-8 mb-3 opacity-90" />
              <h3 className="font-semibold text-lg mb-1">Gérer les Workspaces</h3>
              <p className="text-blue-100 text-sm">Créer, modifier ou supprimer des workspaces</p>
            </div>
          </Link>
          
          <Link href="/workspaces">
            <div className="bg-gradient-to-r from-emerald-500 to-emerald-600 rounded-xl p-6 text-white hover:from-emerald-600 hover:to-emerald-700 transition-all cursor-pointer shadow-lg">
              <Plus className="h-8 w-8 mb-3 opacity-90" />
              <h3 className="font-semibold text-lg mb-1">Nouveau Workspace</h3>
              <p className="text-emerald-100 text-sm">Démarrer une nouvelle analyse</p>
            </div>
          </Link>
          
          <Link href="/workspaces">
            <div className="bg-gradient-to-r from-purple-500 to-purple-600 rounded-xl p-6 text-white hover:from-purple-600 hover:to-purple-700 transition-all cursor-pointer shadow-lg">
              <Target className="h-8 w-8 mb-3 opacity-90" />
              <h3 className="font-semibold text-lg mb-1">Ajouter un Fournisseur</h3>
              <p className="text-purple-100 text-sm">Importer des données fournisseur</p>
            </div>
          </Link>
        </div>
      </div>
    </div>
  );
}
