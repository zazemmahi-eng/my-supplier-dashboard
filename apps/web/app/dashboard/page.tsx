'use client';
import SupplierPredictions from 'components/SupplierPredictions';
import { useState, useEffect } from 'react';
import axios from 'axios';
import {
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Clock,
  CheckCircle,
  Package,
  Activity,
  Plus,
  X,
  Mail,
  Phone,
  MapPin,
  FileText,
  Star
} from 'lucide-react';

interface Supplier {
  supplier: string;
  score_risque: number;
  niveau_risque: string;
  status: string;
  retard_moyen: number;
  taux_defaut: number;
  taux_retard: number;
  nb_commandes: number;
  tendance_defauts: string;
  tendance_retards: string;
  derniere_commande: string;
}

interface Action {
  supplier: string;
  action: string;
  priority: string;
  raison: string;
  delai: string;
  impact: string;
}

export default function SupplierDashboardPage() {
  const [selectedPeriod, setSelectedPeriod] = useState('30d');
  const [kpis, setKpis] = useState<any>(null);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [actions, setActions] = useState<Action[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newSupplier, setNewSupplier] = useState({
    name: '',
    contact_email: '',
    contact_phone: '',
    address: '',
    quality_rating: 5,
    delivery_rating: 5,
    notes: ''
  });

  // Charger les données
  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const response = await axios.get('http://127.0.0.1:8000/api/dashboard/data');
      setKpis(response.data.kpis_globaux);
      setSuppliers(response.data.suppliers);
      setActions(response.data.actions);
    } catch (error) {
      console.error('Erreur chargement données:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddSupplier = async () => {
    try {
      await axios.post('http://127.0.0.1:8000/api/supplier/create', newSupplier);
      alert(`✅ Fournisseur "${newSupplier.name}" ajouté (stockage temporaire)`);
      setShowAddModal(false);
      setNewSupplier({
        name: '',
        contact_email: '',
        contact_phone: '',
        address: '',
        quality_rating: 5,
        delivery_rating: 5,
        notes: ''
      });
    } catch (error: any) {
      alert(`❌ Erreur : ${error.response?.data?.detail || 'Impossible d\'ajouter le fournisseur'}`);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'good':
        return 'bg-green-100 text-green-800 border-green-300';
      case 'warning':
        return 'bg-yellow-100 text-yellow-800 border-yellow-300';
      case 'alert':
        return 'bg-red-100 text-red-800 border-red-300';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-300';
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high':
        return 'bg-red-500 text-white';
      case 'medium':
        return 'bg-orange-500 text-white';
      case 'low':
        return 'bg-blue-500 text-white';
      default:
        return 'bg-gray-500 text-white';
    }
  };

  const getTendanceIcon = (tendance: string) => {
    if (tendance === 'hausse') return <TrendingUp className="h-5 w-5 text-red-500" />;
    if (tendance === 'baisse') return <TrendingDown className="h-5 w-5 text-green-500" />;
    return <span className="text-gray-400">→</span>;
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="mx-auto h-16 w-16 animate-spin rounded-full border-8 border-blue-600 border-t-transparent"></div>
          <p className="mt-4 text-xl font-medium text-gray-700">Chargement du tableau de bord...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-blue-50 p-6">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-bold text-gray-900">
              📊 Tableau de Bord Prédictif
            </h1>
            <p className="mt-2 text-lg text-gray-600">
              Analyse intelligente des risques fournisseurs
            </p>
          </div>
          <div className="flex gap-3">
            {/* Sélecteur de période */}
            {['7d', '30d', '90d'].map((period) => (
              <button
                key={period}
                onClick={() => setSelectedPeriod(period)}
                className={`rounded-lg px-5 py-2.5 text-sm font-semibold transition-all ${
                  selectedPeriod === period
                    ? 'bg-blue-600 text-white shadow-lg'
                    : 'bg-white text-gray-700 hover:bg-gray-100 shadow'
                }`}
              >
                {period === '7d' && '7 jours'}
                {period === '30d' && '30 jours'}
                {period === '90d' && '90 jours'}
              </button>
            ))}
            {/* Bouton Ajouter fournisseur */}
            <button
              onClick={() => setShowAddModal(true)}
              className="flex items-center gap-2 rounded-lg bg-green-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg hover:bg-green-700 transition-all"
            >
              <Plus className="h-5 w-5" />
              Ajouter fournisseur
            </button>
          </div>
        </div>
      </div>

      {/* KPIs Globaux */}
      <div className="mb-8 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-5">
        <div className="rounded-xl bg-white p-6 shadow-lg transition-all hover:shadow-xl">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Taux de défauts</p>
              <p className="mt-2 text-3xl font-bold text-orange-600">{kpis?.taux_defaut}%</p>
              <p className="mt-1 text-xs text-gray-500">Max: {kpis?.defaut_max}%</p>
            </div>
            <div className="rounded-full bg-orange-100 p-4">
              <AlertTriangle className="h-7 w-7 text-orange-600" />
            </div>
          </div>
        </div>

        <div className="rounded-xl bg-white p-6 shadow-lg transition-all hover:shadow-xl">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Retard moyen</p>
              <p className="mt-2 text-3xl font-bold text-blue-600">{kpis?.retard_moyen}j</p>
              <p className="mt-1 text-xs text-gray-500">Max: {kpis?.retard_max}j</p>
            </div>
            <div className="rounded-full bg-blue-100 p-4">
              <Clock className="h-7 w-7 text-blue-600" />
            </div>
          </div>
        </div>

        <div className="rounded-xl bg-white p-6 shadow-lg transition-all hover:shadow-xl">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Fournisseurs</p>
              <p className="mt-2 text-3xl font-bold text-purple-600">{kpis?.nb_fournisseurs}</p>
              <p className="mt-1 text-xs text-gray-500">Actifs</p>
            </div>
            <div className="rounded-full bg-purple-100 p-4">
              <Package className="h-7 w-7 text-purple-600" />
            </div>
          </div>
        </div>

        <div className="rounded-xl bg-white p-6 shadow-lg transition-all hover:shadow-xl">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Commandes</p>
              <p className="mt-2 text-3xl font-bold text-green-600">{kpis?.nb_commandes}</p>
              <p className="mt-1 text-xs text-gray-500">Total</p>
            </div>
            <div className="rounded-full bg-green-100 p-4">
              <Activity className="h-7 w-7 text-green-600" />
            </div>
          </div>
        </div>

        <div className="rounded-xl bg-white p-6 shadow-lg transition-all hover:shadow-xl">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Conformité</p>
              <p className="mt-2 text-3xl font-bold text-emerald-600">{kpis?.taux_conformite}%</p>
              <p className="mt-1 text-xs text-gray-500">{kpis?.commandes_parfaites} parfaites</p>
            </div>
            <div className="rounded-full bg-emerald-100 p-4">
              <CheckCircle className="h-7 w-7 text-emerald-600" />
            </div>
          </div>
        </div>
      </div>

      {/* Graphique Prédictions */}
      <div className="mb-8">
        <SupplierPredictions />
      </div>

      {/* Grille Fournisseurs + Actions */}
      <div className="grid gap-8 lg:grid-cols-3">
        {/* Fournisseurs (2 colonnes) */}
        <div className="lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-2xl font-bold text-gray-900">
              🏭 Fournisseurs ({suppliers.length})
            </h2>
          </div>
          <div className="space-y-4">
            {suppliers.map((supplier) => (
              <div
                key={supplier.supplier}
                className={`rounded-xl border-2 p-6 shadow-md transition-all hover:shadow-lg ${getStatusColor(supplier.status)}`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      <h3 className="text-2xl font-bold">{supplier.supplier}</h3>
                      <span className={`rounded-full px-3 py-1 text-xs font-semibold ${
                        supplier.status === 'good' ? 'bg-green-200' :
                        supplier.status === 'warning' ? 'bg-yellow-200' :
                        'bg-red-200'
                      }`}>
                        {supplier.niveau_risque}
                      </span>
                    </div>
                    
                    <div className="mt-4 grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-sm text-gray-600">Défauts</p>
                        <p className="text-xl font-bold">{supplier.taux_defaut}%</p>
                        <div className="flex items-center gap-1 mt-1">
                          {getTendanceIcon(supplier.tendance_defauts)}
                          <span className="text-xs capitalize">{supplier.tendance_defauts}</span>
                        </div>
                      </div>
                      <div>
                        <p className="text-sm text-gray-600">Retard moyen</p>
                        <p className="text-xl font-bold">{supplier.retard_moyen}j</p>
                        <div className="flex items-center gap-1 mt-1">
                          {getTendanceIcon(supplier.tendance_retards)}
                          <span className="text-xs capitalize">{supplier.tendance_retards}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  <div className="text-right">
                    <p className="text-sm text-gray-600">Score de risque</p>
                    <p className="text-4xl font-bold">{supplier.score_risque}</p>
                    <p className="mt-1 text-xs text-gray-600">{supplier.nb_commandes} commandes</p>
                    <p className="text-xs text-gray-500">Dernière: {supplier.derniere_commande}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Actions (1 colonne) */}
        <div className="lg:col-span-1">
          <h2 className="mb-4 text-2xl font-bold text-gray-900">
            ⚡ Actions recommandées
          </h2>
          <div className="space-y-3">
            {actions.slice(0, 10).map((action, idx) => (
              <div
                key={idx}
                className="rounded-lg bg-white p-4 shadow-md transition-all hover:shadow-lg"
              >
                <div className="flex items-start gap-3">
                  <span className={`mt-1 rounded-full px-2.5 py-1 text-xs font-bold ${getPriorityColor(action.priority)}`}>
                    {action.priority.toUpperCase()}
                  </span>
                  <div className="flex-1">
                    <p className="font-semibold text-gray-900">{action.action}</p>
                    <p className="mt-1 text-sm text-gray-600">{action.raison}</p>
                    <div className="mt-2 flex items-center justify-between text-xs text-gray-500">
                      <span>⏱️ {action.delai}</span>
                      <span>📊 Impact: {action.impact}</span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Modal Ajout Fournisseur */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
          <div className="w-full max-w-2xl rounded-xl bg-white p-8 shadow-2xl">
            <div className="mb-6 flex items-center justify-between">
              <h2 className="text-2xl font-bold text-gray-900">➕ Ajouter un fournisseur</h2>
              <button
                onClick={() => setShowAddModal(false)}
                className="rounded-full p-2 hover:bg-gray-100 transition-colors"
              >
                <X className="h-6 w-6" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Nom du fournisseur *</label>
                <input
                  type="text"
                  value={newSupplier.name}
                  onChange={(e) => setNewSupplier({ ...newSupplier, name: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-gray-300 p-3 focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                  placeholder="Ex: Fournisseur G"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Email *</label>
                  <div className="relative mt-1">
                    <Mail className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
                    <input
                      type="email"
                      value={newSupplier.contact_email}
                      onChange={(e) => setNewSupplier({ ...newSupplier, contact_email: e.target.value })}
                      className="w-full rounded-lg border border-gray-300 p-3 pl-10 focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                      placeholder="contact@fournisseur.com"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700">Téléphone *</label>
                  <div className="relative mt-1">
                    <Phone className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
                    <input
                      type="tel"
                      value={newSupplier.contact_phone}
                      onChange={(e) => setNewSupplier({ ...newSupplier, contact_phone: e.target.value })}
                      className="w-full rounded-lg border border-gray-300 p-3 pl-10 focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                      placeholder="+212 6XX XXX XXX"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">Adresse</label>
                <div className="relative mt-1">
                  <MapPin className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
                  <input
                    type="text"
                    value={newSupplier.address}
                    onChange={(e) => setNewSupplier({ ...newSupplier, address: e.target.value })}
                    className="w-full rounded-lg border border-gray-300 p-3 pl-10 focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                    placeholder="Adresse complète"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Note Qualité</label>
                  <div className="mt-1 flex items-center gap-2">
                    <input
                      type="range"
                      min="1"
                      max="10"
                      value={newSupplier.quality_rating}
                      onChange={(e) => setNewSupplier({ ...newSupplier, quality_rating: Number(e.target.value) })}
                      className="flex-1"
                    />
                    <span className="flex items-center gap-1 text-lg font-bold text-yellow-600">
                      <Star className="h-5 w-5 fill-yellow-400" />
                      {newSupplier.quality_rating}/10
                    </span>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700">Note Livraison</label>
                  <div className="mt-1 flex items-center gap-2">
                    <input
                      type="range"
                      min="1"
                      max="10"
                      value={newSupplier.delivery_rating}
                      onChange={(e) => setNewSupplier({ ...newSupplier, delivery_rating: Number(e.target.value) })}
                      className="flex-1"
                    />
                    <span className="flex items-center gap-1 text-lg font-bold text-blue-600">
                      <Clock className="h-5 w-5" />
                      {newSupplier.delivery_rating}/10
                    </span>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">Notes</label>
                <div className="relative mt-1">
                  <FileText className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
                  <textarea
                    value={newSupplier.notes}
                    onChange={(e) => setNewSupplier({ ...newSupplier, notes: e.target.value })}
                    rows={3}
                    className="w-full rounded-lg border border-gray-300 p-3 pl-10 focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                    placeholder="Remarques ou informations supplémentaires..."
                  />
                </div>
              </div>

              <div className="rounded-lg bg-yellow-50 p-4">
                <p className="text-sm text-yellow-800">
                  ⚠️ <strong>Note:</strong> Les données seront stockées temporairement en mémoire (non persistantes sans base de données).
                </p>
              </div>
            </div>

            <div className="mt-6 flex gap-3">
              <button
                onClick={handleAddSupplier}
                className="flex-1 rounded-lg bg-green-600 px-6 py-3 font-semibold text-white hover:bg-green-700 transition-colors"
              >
                ✅ Ajouter le fournisseur
              </button>
              <button
                onClick={() => setShowAddModal(false)}
                className="rounded-lg border-2 border-gray-300 px-6 py-3 font-semibold text-gray-700 hover:bg-gray-100 transition-colors"
              >
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}