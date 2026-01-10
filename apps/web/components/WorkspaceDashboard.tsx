'use client';
/**
 * WorkspaceDashboard Component
 * 
 * Main entry point for workspace management.
 * Displays list of workspaces, allows creation of new workspaces,
 * and provides navigation to individual workspace views.
 */

import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import {
  Plus, FolderOpen, Trash2, Settings, Upload, Calendar,
  Database, AlertCircle, CheckCircle, Clock, FileText,
  BarChart3, ChevronRight, Search, Filter
} from 'lucide-react';

const API_BASE_URL = process.env.NEXT_PUBLIC_SUPPLIER_API_URL ?? 'http://127.0.0.1:8000';

// ============================================
// TYPE DEFINITIONS
// ============================================

interface Workspace {
  id: string;
  name: string;
  description: string | null;
  data_type: string;
  status: string;
  created_at: string;
  updated_at: string;
  has_data: boolean;
  supplier_count: number;
  row_count: number;
}

// Data type case descriptions for display
// Each case generates a specific dashboard with isolated KPIs and charts
const DATA_TYPE_INFO = {
  delays: {
    label: 'Case A - Retards Uniquement',
    description: 'Analyse des délais de livraison (dates promises vs livrées)',
    columns: ['supplier', 'date_promised', 'date_delivered'],
    color: 'bg-blue-100 text-blue-800',
    icon: '📅',
    metrics: ['Taux de retard', 'Retard moyen', 'Ponctualité']
  },
  late_days: {
    label: 'Case B - Défauts Uniquement',
    description: 'Analyse du taux de défauts par commande',
    columns: ['supplier', 'order_date', 'defects'],
    color: 'bg-purple-100 text-purple-800',
    icon: '🔍',
    metrics: ['Taux de défaut', 'Défaut moyen', 'Conformité']
  },
  mixed: {
    label: 'Case C - Mixte (Retards + Défauts)',
    description: 'Analyse combinée des retards et défauts',
    columns: ['supplier', 'date_promised', 'date_delivered', 'defects'],
    color: 'bg-green-100 text-green-800',
    icon: '📊',
    metrics: ['Tous les KPIs', 'Alertes combinées', 'Prédictions complètes']
  }
};

// ============================================
// PROPS INTERFACE
// ============================================

interface WorkspaceDashboardProps {
  onSelectWorkspace: (workspaceId: string, workspaceName: string) => void;
}

// ============================================
// MAIN COMPONENT
// ============================================

export default function WorkspaceDashboard({ onSelectWorkspace }: WorkspaceDashboardProps) {
  // State
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // New workspace form state
  const [newWorkspace, setNewWorkspace] = useState({
    name: '',
    description: '',
    data_type: 'delays'
  });
  const [creating, setCreating] = useState(false);

  // ============================================
  // DATA FETCHING
  // ============================================

  const fetchWorkspaces = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await axios.get(`${API_BASE_URL}/api/workspaces`);
      setWorkspaces(response.data);
    } catch (err) {
      console.error('Erreur chargement workspaces:', err);
      setError('Impossible de charger les workspaces. Vérifiez que le backend est lancé.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchWorkspaces();
  }, [fetchWorkspaces]);

  // ============================================
  // ACTIONS
  // ============================================

  const handleCreateWorkspace = async () => {
    if (!newWorkspace.name.trim()) {
      alert('Veuillez entrer un nom pour le workspace');
      return;
    }

    try {
      setCreating(true);
      await axios.post(`${API_BASE_URL}/api/workspaces`, newWorkspace);
      
      // Reset form and refresh list
      setNewWorkspace({ name: '', description: '', data_type: 'delays' });
      setShowCreateModal(false);
      await fetchWorkspaces();
    } catch (err) {
      if (axios.isAxiosError(err)) {
        alert(`Erreur: ${err.response?.data?.detail || 'Impossible de créer le workspace'}`);
      } else {
        alert('Erreur inconnue');
      }
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteWorkspace = async (workspace: Workspace) => {
    if (!confirm(`Êtes-vous sûr de vouloir supprimer "${workspace.name}" ? Cette action est irréversible.`)) {
      return;
    }

    try {
      await axios.delete(`${API_BASE_URL}/api/workspaces/${workspace.id}`);
      await fetchWorkspaces();
    } catch (err) {
      if (axios.isAxiosError(err)) {
        alert(`Erreur: ${err.response?.data?.detail || 'Impossible de supprimer le workspace'}`);
      }
    }
  };

  // ============================================
  // FILTERING
  // ============================================

  const filteredWorkspaces = workspaces.filter(ws => {
    const matchesSearch = ws.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         (ws.description?.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesStatus = statusFilter === 'all' || ws.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  // ============================================
  // RENDER HELPERS
  // ============================================

  const getStatusBadge = (status: string) => {
    const styles = {
      active: 'bg-green-100 text-green-800',
      archived: 'bg-gray-100 text-gray-800',
      pending: 'bg-yellow-100 text-yellow-800'
    };
    return styles[status as keyof typeof styles] || styles.pending;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  };

  // ============================================
  // LOADING STATE
  // ============================================

  if (loading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <div className="text-center">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-blue-600 border-t-transparent mx-auto"></div>
          <p className="mt-4 text-gray-600">Chargement des workspaces...</p>
        </div>
      </div>
    );
  }

  // ============================================
  // ERROR STATE
  // ============================================

  if (error) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <div className="text-center bg-white p-8 rounded-xl shadow-lg max-w-md">
          <AlertCircle className="mx-auto h-12 w-12 text-red-500 mb-4" />
          <h2 className="text-xl font-bold text-gray-900 mb-2">Erreur de connexion</h2>
          <p className="text-gray-600 mb-4">{error}</p>
          <button 
            onClick={fetchWorkspaces}
            className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700"
          >
            Réessayer
          </button>
        </div>
      </div>
    );
  }

  // ============================================
  // MAIN RENDER
  // ============================================

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 p-6">
      <div className="max-w-7xl mx-auto">
        
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">
            📁 Mes Workspaces
          </h1>
          <p className="text-blue-200">
            Gérez vos espaces de travail pour l'analyse des fournisseurs
          </p>
        </div>

        {/* Actions Bar */}
        <div className="flex flex-col md:flex-row gap-4 mb-6">
          {/* Search */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
            <input
              type="text"
              placeholder="Rechercher un workspace..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 rounded-lg bg-white/10 border border-white/20 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-4 py-2.5 rounded-lg bg-white/10 border border-white/20 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">Tous les statuts</option>
            <option value="active">Actifs</option>
            <option value="archived">Archivés</option>
          </select>

          {/* Create Button */}
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 px-6 py-2.5 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-lg transition-colors"
          >
            <Plus className="h-5 w-5" />
            Nouveau Workspace
          </button>
        </div>

        {/* Workspaces Grid */}
        {filteredWorkspaces.length === 0 ? (
          <div className="text-center py-16 bg-white/5 rounded-2xl border border-white/10">
            <FolderOpen className="mx-auto h-16 w-16 text-gray-400 mb-4" />
            <h3 className="text-xl font-semibold text-white mb-2">
              {workspaces.length === 0 ? 'Aucun workspace' : 'Aucun résultat'}
            </h3>
            <p className="text-gray-400 mb-6">
              {workspaces.length === 0 
                ? 'Créez votre premier workspace pour commencer l\'analyse'
                : 'Modifiez vos critères de recherche'
              }
            </p>
            {workspaces.length === 0 && (
              <button
                onClick={() => setShowCreateModal(true)}
                className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg"
              >
                <Plus className="h-5 w-5" />
                Créer mon premier workspace
              </button>
            )}
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {filteredWorkspaces.map((workspace) => (
              <div
                key={workspace.id}
                className="bg-white/10 backdrop-blur-sm rounded-2xl border border-white/20 overflow-hidden hover:border-blue-400/50 transition-all group"
              >
                {/* Card Header */}
                <div className="p-6 border-b border-white/10">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <h3 className="text-lg font-semibold text-white truncate">
                        {workspace.name}
                      </h3>
                      <span className={`inline-block mt-1 px-2 py-0.5 text-xs font-medium rounded ${DATA_TYPE_INFO[workspace.data_type as keyof typeof DATA_TYPE_INFO]?.color || 'bg-gray-100 text-gray-800'}`}>
                        {DATA_TYPE_INFO[workspace.data_type as keyof typeof DATA_TYPE_INFO]?.label || workspace.data_type}
                      </span>
                    </div>
                    <span className={`px-2 py-1 text-xs font-medium rounded ${getStatusBadge(workspace.status)}`}>
                      {workspace.status}
                    </span>
                  </div>
                  {workspace.description && (
                    <p className="text-sm text-gray-300 line-clamp-2">
                      {workspace.description}
                    </p>
                  )}
                </div>

                {/* Card Stats */}
                <div className="p-4 bg-white/5 grid grid-cols-3 gap-4 text-center">
                  <div>
                    <div className="flex items-center justify-center gap-1 text-gray-400 mb-1">
                      <Database className="h-4 w-4" />
                    </div>
                    <p className="text-lg font-semibold text-white">{workspace.row_count}</p>
                    <p className="text-xs text-gray-400">Lignes</p>
                  </div>
                  <div>
                    <div className="flex items-center justify-center gap-1 text-gray-400 mb-1">
                      <FileText className="h-4 w-4" />
                    </div>
                    <p className="text-lg font-semibold text-white">{workspace.supplier_count}</p>
                    <p className="text-xs text-gray-400">Fournisseurs</p>
                  </div>
                  <div>
                    <div className="flex items-center justify-center gap-1 text-gray-400 mb-1">
                      {workspace.has_data ? (
                        <CheckCircle className="h-4 w-4 text-green-400" />
                      ) : (
                        <Clock className="h-4 w-4 text-yellow-400" />
                      )}
                    </div>
                    <p className="text-xs text-gray-400 mt-1">
                      {workspace.has_data ? 'Données OK' : 'À importer'}
                    </p>
                  </div>
                </div>

                {/* Card Actions */}
                <div className="p-4 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleDeleteWorkspace(workspace)}
                      className="p-2 text-gray-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                      title="Supprimer"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  
                  <button
                    onClick={() => onSelectWorkspace(workspace.id, workspace.name)}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors"
                  >
                    {workspace.has_data ? 'Analyser' : 'Importer'}
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>

                {/* Footer */}
                <div className="px-4 py-2 bg-black/20 text-xs text-gray-400 flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  Créé le {formatDate(workspace.created_at)}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Create Workspace Modal */}
        {showCreateModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="bg-slate-800 rounded-2xl p-8 w-full max-w-lg mx-4 border border-white/20 shadow-2xl">
              <h2 className="text-2xl font-bold text-white mb-6">
                ✨ Nouveau Workspace
              </h2>

              {/* Name Input */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Nom du workspace *
                </label>
                <input
                  type="text"
                  value={newWorkspace.name}
                  onChange={(e) => setNewWorkspace({ ...newWorkspace, name: e.target.value })}
                  placeholder="Ex: Analyse Q1 2026"
                  className="w-full px-4 py-3 rounded-lg bg-white/10 border border-white/20 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Description Input */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Description (optionnel)
                </label>
                <textarea
                  value={newWorkspace.description}
                  onChange={(e) => setNewWorkspace({ ...newWorkspace, description: e.target.value })}
                  placeholder="Description du workspace..."
                  rows={2}
                  className="w-full px-4 py-3 rounded-lg bg-white/10 border border-white/20 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
              </div>

              {/* Data Type Selection */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-300 mb-3">
                  Type de données *
                </label>
                <div className="space-y-3">
                  {Object.entries(DATA_TYPE_INFO).map(([key, info]) => (
                    <label
                      key={key}
                      className={`flex items-start gap-3 p-4 rounded-lg border cursor-pointer transition-all ${
                        newWorkspace.data_type === key
                          ? 'border-blue-500 bg-blue-500/20'
                          : 'border-white/20 bg-white/5 hover:border-white/40'
                      }`}
                    >
                      <input
                        type="radio"
                        name="data_type"
                        value={key}
                        checked={newWorkspace.data_type === key}
                        onChange={(e) => setNewWorkspace({ ...newWorkspace, data_type: e.target.value })}
                        className="mt-1"
                      />
                      <div>
                        <p className="font-medium text-white">{info.label}</p>
                        <p className="text-sm text-gray-400">{info.description}</p>
                        <p className="text-xs text-gray-500 mt-1">
                          Colonnes: {info.columns.join(', ')}
                        </p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-3">
                <button
                  onClick={() => setShowCreateModal(false)}
                  className="flex-1 px-4 py-3 bg-white/10 hover:bg-white/20 text-white font-medium rounded-lg transition-colors"
                >
                  Annuler
                </button>
                <button
                  onClick={handleCreateWorkspace}
                  disabled={creating || !newWorkspace.name.trim()}
                  className="flex-1 px-4 py-3 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors"
                >
                  {creating ? 'Création...' : 'Créer'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
