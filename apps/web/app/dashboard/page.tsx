'use client';
import { useState, useEffect } from 'react';
import axios from 'axios';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell
} from 'recharts';
import {
  TrendingUp, TrendingDown, AlertTriangle, Clock, CheckCircle,
  Package, Activity, Plus, X, Mail, Phone, MapPin, FileText, Star,
  BarChart3, PieChart as PieChartIcon, LineChart as LineChartIcon, Upload, RotateCcw,
  ChevronRight, Download, FileBarChart, XCircle
} from 'lucide-react';
import DataUploadLanding from '~/components/DataUploadLanding';

const API_BASE_URL = process.env.NEXT_PUBLIC_SUPPLIER_API_URL ?? 'http://127.0.0.1:8000';

// ============== INTERFACES ==============
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

interface GlobalKpis {
  taux_retard: number;
  taux_defaut: number;
  retard_moyen: number;
  nb_fournisseurs: number;
  nb_commandes: number;
  defaut_max: number;
  retard_max: number;
  commandes_parfaites: number;
  taux_conformite: number;
}

interface Prediction {
  supplier: string;
  predicted_defect: number;
  predicted_delay: number;
  method_ma_defect: number;
  method_ma_delay: number;
  method_lr_defect: number;
  method_lr_delay: number;
  method_exp_defect: number;
  method_exp_delay: number;
  confiance: string;
  nb_commandes_historique: number;
}

type Screen = 'overview' | 'charts' | 'predictions' | 'distribution';

const COLORS = {
  good: '#10b981',
  warning: '#f59e0b',
  alert: '#ef4444',
  faible: '#10b981',
  modere: '#f59e0b',
  eleve: '#ef4444'
};

const CreateSupplierPayload = {
  name: '', email: '', phone: '', address: '',
  quality_rating: 5, delivery_rating: 5, notes: ''
};

export default function SupplierDashboardPage() {
  const [activeScreen, setActiveScreen] = useState<Screen>('overview');
  const [kpis, setKpis] = useState<GlobalKpis | null>(null);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [actions, setActions] = useState<Action[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newSupplier, setNewSupplier] = useState(CreateSupplierPayload);
  const [dataLoaded, setDataLoaded] = useState<boolean | null>(null);
  const [dataSource, setDataSource] = useState<string>('database');
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);

  useEffect(() => {
    checkDataStatus();
  }, []);

  const handleUploadSuccess = async () => {
    setDataLoaded(true);
    await fetchData();
  };

  const handleResetData = async () => {
    try {
      await axios.delete(`${API_BASE_URL}/api/data`);
      setDataLoaded(false);
      setKpis(null);
      setSuppliers([]);
      setPredictions([]);
      setActions([]);
    } catch (err) {
      console.error('Erreur lors de la réinitialisation:', err);
    }
  };

  const checkDataStatus = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/api/data-status`);
      if (response.data.has_data) {
        setDataLoaded(true);
        fetchData();
      } else {
        setDataLoaded(false);
        setLoading(false);
      }
    } catch {
      // If status check fails, assume no data and show landing
      setDataLoaded(false);
      setLoading(false);
    }
  };

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);

      const [dashboardRes, predictionsRes] = await Promise.all([
        axios.get(`${API_BASE_URL}/api/dashboard/data`),
        axios.get(`${API_BASE_URL}/api/predictions`)
      ]);

      setKpis(dashboardRes.data.kpis_globaux);
      setSuppliers(dashboardRes.data.suppliers);
      setActions(dashboardRes.data.actions);
      setPredictions(predictionsRes.data.predictions);
    } catch (err) {
      console.error('Erreur chargement données:', err);
      setError('Impossible de charger les données. Vérifiez que le backend est lancé.');
    } finally {
      setLoading(false);
    }
  };

  const handleAddSupplier = async () => {
    try {
      await axios.post(`${API_BASE_URL}/api/supplier/create`, newSupplier);
      alert(`✅ Fournisseur "${newSupplier.name}" ajouté avec succès`);
      await fetchData();
      setShowAddModal(false);
      setNewSupplier(CreateSupplierPayload);
    } catch (err: unknown) {
      const detail = axios.isAxiosError(err)
        ? err.response?.data?.detail ?? "Impossible d'ajouter le fournisseur"
        : "Erreur inconnue";
      alert(`❌ Erreur : ${detail}`);
    }
  };

  // ============== DONNÉES POUR GRAPHIQUES ==============

  // Graphique circulaire (Pie Chart)
  const pieData = [
    { name: 'Faible', value: suppliers.filter(s => s.niveau_risque === 'Faible').length, color: COLORS.faible },
    { name: 'Modéré', value: suppliers.filter(s => s.niveau_risque === 'Modéré').length, color: COLORS.modere },
    { name: 'Élevé', value: suppliers.filter(s => s.niveau_risque === 'Élevé').length, color: COLORS.eleve },
  ].filter(d => d.value > 0);

  // Graphique en barres (scores de risque)
  const barData = suppliers.map(s => ({
    name: s.supplier.replace('Fournisseur ', '').substring(0, 10),
    score: s.score_risque,
    fill: COLORS[s.status as keyof typeof COLORS] || '#6b7280'
  }));

  // Graphique en lignes (défauts et retards)
  const lineData = suppliers.map(s => ({
    name: s.supplier.replace('Fournisseur ', '').substring(0, 10),
    defauts: s.taux_defaut,
    retards: s.retard_moyen
  }));

  // Comparaison méthodes de prédiction
  const predictionCompareData = predictions.map(p => ({
    name: p.supplier.replace('Fournisseur ', '').substring(0, 8),
    'Moy. Glissante': p.method_ma_defect,
    'Régression': p.method_lr_defect,
    'Exponentielle': p.method_exp_defect,
    'Finale': p.predicted_defect
  }));

  // ============== HELPERS ==============
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'good': return 'bg-green-100 text-green-800 border-green-300';
      case 'warning': return 'bg-yellow-100 text-yellow-800 border-yellow-300';
      case 'alert': return 'bg-red-100 text-red-800 border-red-300';
      default: return 'bg-gray-100 text-gray-800 border-gray-300';
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high': return 'bg-red-500 text-white';
      case 'medium': return 'bg-orange-500 text-white';
      case 'low': return 'bg-blue-500 text-white';
      default: return 'bg-gray-500 text-white';
    }
  };

  const getTrendIcon = (tendance: string) => {
    if (tendance === 'hausse') return <TrendingUp className="h-4 w-4 text-red-500" />;
    if (tendance === 'baisse') return <TrendingDown className="h-4 w-4 text-green-500" />;
    return <span className="text-gray-400">→</span>;
  };

  // Get prediction for a specific supplier
  const getSupplierPrediction = (supplierName: string) => {
    return predictions.find(p => p.supplier === supplierName);
  };

  // Get actions for a specific supplier
  const getSupplierActions = (supplierName: string) => {
    return actions.filter(a => a.supplier === supplierName);
  };

  // ============== LOADING / ERROR ==============
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

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="text-center bg-white p-8 rounded-xl shadow-lg max-w-md">
          <AlertTriangle className="mx-auto h-16 w-16 text-red-500 mb-4" />
          <h2 className="text-xl font-bold text-gray-900 mb-2">Erreur de connexion</h2>
          <p className="text-gray-600 mb-4">{error}</p>
          <button onClick={fetchData} className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700">
            Réessayer
          </button>
        </div>
      </div>
    );
  }

  // Show landing page when no data is loaded
  if (dataLoaded === false) {
    return <DataUploadLanding onUploadSuccess={handleUploadSuccess} />;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-blue-50 p-6">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-4xl font-bold text-gray-900">📊 Dashboard Prédictif</h1>
          <div className="flex items-center gap-3">
            <button
              onClick={handleResetData}
              className="flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2.5 font-semibold text-white shadow-lg hover:bg-orange-600 transition-colors"
            >
              <RotateCcw className="h-4 w-4" /> Nouvelles données
            </button>
            <button
              onClick={() => setShowAddModal(true)}
              className="flex items-center gap-2 rounded-lg bg-green-600 px-5 py-2.5 font-semibold text-white shadow-lg hover:bg-green-700"
            >
              <Plus className="h-5 w-5" /> Ajouter fournisseur
            </button>
          </div>
        </div>

        {/* Navigation */}
        <div className="flex gap-3 flex-wrap">
          {[
            { key: 'overview', icon: BarChart3, label: 'Vue générale' },
            { key: 'charts', icon: LineChartIcon, label: 'Graphiques' },
            { key: 'predictions', icon: Activity, label: 'Prédictions' },
            { key: 'distribution', icon: PieChartIcon, label: 'Distribution' },
          ].map(({ key, icon: Icon, label }) => (
            <button
              key={key}
              onClick={() => setActiveScreen(key as Screen)}
              className={`flex items-center gap-2 rounded-lg px-5 py-2.5 font-semibold transition-all ${activeScreen === key
                ? 'bg-blue-600 text-white shadow-lg'
                : 'bg-white text-gray-700 hover:bg-gray-100 shadow'
                }`}
            >
              <Icon className="h-5 w-5" /> {label}
            </button>
          ))}
        </div>
      </div>

      {/* ========== ÉCRAN 1 : OVERVIEW ========== */}
      {activeScreen === 'overview' && (
        <div className="space-y-8">
          {/* KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-6">
            <div className="rounded-xl bg-white p-6 shadow-lg">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Taux défauts</p>
                  <p className="mt-2 text-3xl font-bold text-orange-600">{kpis?.taux_defaut}%</p>
                  <p className="text-xs text-gray-500">Max: {kpis?.defaut_max}%</p>
                </div>
                <AlertTriangle className="h-12 w-12 text-orange-200" />
              </div>
            </div>
            <div className="rounded-xl bg-white p-6 shadow-lg">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Retard moyen</p>
                  <p className="mt-2 text-3xl font-bold text-blue-600">{kpis?.retard_moyen}j</p>
                  <p className="text-xs text-gray-500">Max: {kpis?.retard_max}j</p>
                </div>
                <Clock className="h-12 w-12 text-blue-200" />
              </div>
            </div>
            <div className="rounded-xl bg-white p-6 shadow-lg">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Fournisseurs</p>
                  <p className="mt-2 text-3xl font-bold text-purple-600">{kpis?.nb_fournisseurs}</p>
                </div>
                <Package className="h-12 w-12 text-purple-200" />
              </div>
            </div>
            <div className="rounded-xl bg-white p-6 shadow-lg">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Commandes</p>
                  <p className="mt-2 text-3xl font-bold text-green-600">{kpis?.nb_commandes}</p>
                </div>
                <Activity className="h-12 w-12 text-green-200" />
              </div>
            </div>
            <div className="rounded-xl bg-white p-6 shadow-lg">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Conformité</p>
                  <p className="mt-2 text-3xl font-bold text-emerald-600">{kpis?.taux_conformite}%</p>
                  <p className="text-xs text-gray-500">{kpis?.commandes_parfaites} parfaites</p>
                </div>
                <CheckCircle className="h-12 w-12 text-emerald-200" />
              </div>
            </div>
          </div>

          {/* Fournisseurs + Actions */}
          <div className="grid gap-8 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <h2 className="mb-4 text-2xl font-bold text-gray-900">🏭 Fournisseurs</h2>
              <div className="space-y-4">
                {suppliers.map((supplier) => (
                  <div
                    key={supplier.supplier}
                    onClick={() => setSelectedSupplier(supplier)}
                    className={`rounded-xl border-2 p-5 shadow-md cursor-pointer transition-all duration-200 hover:shadow-lg hover:scale-[1.01] ${getStatusColor(supplier.status)} ${selectedSupplier?.supplier === supplier.supplier ? 'ring-4 ring-blue-500 ring-offset-2' : ''}`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-3">
                          <h3 className="text-xl font-bold">{supplier.supplier}</h3>
                          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${supplier.status === 'good' ? 'bg-green-200' :
                            supplier.status === 'warning' ? 'bg-yellow-200' : 'bg-red-200'
                            }`}>
                            {supplier.niveau_risque}
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <p className="text-sm text-gray-600">Défauts</p>
                            <div className="flex items-center gap-2">
                              <p className="text-lg font-bold">{supplier.taux_defaut}%</p>
                              {getTrendIcon(supplier.tendance_defauts)}
                            </div>
                          </div>
                          <div>
                            <p className="text-sm text-gray-600">Retard moyen</p>
                            <div className="flex items-center gap-2">
                              <p className="text-lg font-bold">{supplier.retard_moyen}j</p>
                              {getTrendIcon(supplier.tendance_retards)}
                            </div>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <p className="text-sm text-gray-600">Score</p>
                          <p className="text-3xl font-bold">{supplier.score_risque}</p>
                          <p className="text-xs text-gray-500">{supplier.nb_commandes} cmd</p>
                        </div>
                        <ChevronRight className="h-6 w-6 text-gray-400" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <h2 className="mb-4 text-2xl font-bold text-gray-900">⚡ Actions</h2>
              <div className="space-y-3">
                {actions.slice(0, 6).map((action, idx) => (
                  <div key={idx} className="rounded-lg bg-white p-4 shadow-md">
                    <div className="flex items-start gap-3">
                      <span className={`rounded-full px-2 py-1 text-xs font-bold ${getPriorityColor(action.priority)}`}>
                        {action.priority.toUpperCase()}
                      </span>
                      <div>
                        <p className="font-semibold text-gray-900">{action.action}</p>
                        <p className="text-sm text-gray-600">{action.raison}</p>
                        <p className="text-xs text-gray-500 mt-1">⏱️ {action.delai}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========== ÉCRAN 2 : GRAPHIQUES ========== */}
      {activeScreen === 'charts' && (
        <div className="space-y-8">
          <div className="grid gap-8 lg:grid-cols-2">
            {/* Graphique en Barres - Scores de Risque */}
            <div className="rounded-xl bg-white p-6 shadow-lg">
              <h2 className="mb-4 text-xl font-bold text-gray-900">📊 Scores de Risque par Fournisseur</h2>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={barData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis domain={[0, 100]} />
                  <Tooltip formatter={(value) => [`${value}`, 'Score']} />
                  <Bar dataKey="score" radius={[4, 4, 0, 0]}>
                    {barData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Graphique en Lignes - Défauts et Retards */}
            <div className="rounded-xl bg-white p-6 shadow-lg">
              <h2 className="mb-4 text-xl font-bold text-gray-900">📈 Défauts vs Retards</h2>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={lineData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis yAxisId="left" />
                  <YAxis yAxisId="right" orientation="right" />
                  <Tooltip />
                  <Legend />
                  <Line yAxisId="left" type="monotone" dataKey="defauts" stroke="#ef4444" strokeWidth={2} name="Défauts (%)" dot={{ r: 4 }} />
                  <Line yAxisId="right" type="monotone" dataKey="retards" stroke="#3b82f6" strokeWidth={2} name="Retards (j)" dot={{ r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Graphique Comparaison Méthodes */}
          <div className="rounded-xl bg-white p-6 shadow-lg">
            <h2 className="mb-4 text-xl font-bold text-gray-900">🔮 Comparaison des Méthodes de Prédiction (Défauts %)</h2>
            <ResponsiveContainer width="100%" height={350}>
              <BarChart data={predictionCompareData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="Moy. Glissante" fill="#f97316" />
                <Bar dataKey="Régression" fill="#3b82f6" />
                <Bar dataKey="Exponentielle" fill="#8b5cf6" />
                <Bar dataKey="Finale" fill="#10b981" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* ========== ÉCRAN 3 : PRÉDICTIONS ========== */}
      {activeScreen === 'predictions' && (
        <div className="space-y-6">
          <div className="rounded-xl bg-white p-8 shadow-lg">
            <h2 className="mb-2 text-2xl font-bold text-gray-900">🔮 Prédictions Avancées</h2>
            <p className="mb-6 text-gray-600">3 méthodes : Moyenne Glissante | Régression Linéaire | Exponentielle Lissée</p>

            <div className="grid gap-6">
              {predictions.map((pred) => (
                <div key={pred.supplier} className="rounded-lg border-2 border-blue-200 p-6 bg-blue-50">
                  <div className="flex justify-between items-start mb-4">
                    <h3 className="text-xl font-bold text-gray-900">{pred.supplier}</h3>
                    <span className={`px-3 py-1 rounded-full text-sm font-semibold ${pred.confiance === 'haute' ? 'bg-green-100 text-green-700' :
                      pred.confiance === 'moyenne' ? 'bg-yellow-100 text-yellow-700' :
                        'bg-red-100 text-red-700'
                      }`}>
                      Confiance: {pred.confiance}
                    </span>
                  </div>

                  <div className="grid md:grid-cols-2 gap-6">
                    {/* Défauts */}
                    <div className="space-y-2">
                      <p className="font-semibold text-gray-700">📊 Prédiction Défauts</p>
                      <div className="space-y-1 text-sm">
                        <div className="flex justify-between p-2 bg-white rounded border">
                          <span>Moyenne Glissante</span>
                          <span className="font-bold text-orange-600">{pred.method_ma_defect}%</span>
                        </div>
                        <div className="flex justify-between p-2 bg-white rounded border">
                          <span>Régression Linéaire</span>
                          <span className="font-bold text-blue-600">{pred.method_lr_defect}%</span>
                        </div>
                        <div className="flex justify-between p-2 bg-white rounded border">
                          <span>Exponentielle</span>
                          <span className="font-bold text-purple-600">{pred.method_exp_defect}%</span>
                        </div>
                        <div className="flex justify-between p-3 bg-green-100 rounded font-bold border-2 border-green-300">
                          <span>🎯 FINALE</span>
                          <span className="text-green-700">{pred.predicted_defect}%</span>
                        </div>
                      </div>
                    </div>

                    {/* Retards */}
                    <div className="space-y-2">
                      <p className="font-semibold text-gray-700">⏱️ Prédiction Retards</p>
                      <div className="space-y-1 text-sm">
                        <div className="flex justify-between p-2 bg-white rounded border">
                          <span>Moyenne Glissante</span>
                          <span className="font-bold text-orange-600">{pred.method_ma_delay}j</span>
                        </div>
                        <div className="flex justify-between p-2 bg-white rounded border">
                          <span>Régression Linéaire</span>
                          <span className="font-bold text-blue-600">{pred.method_lr_delay}j</span>
                        </div>
                        <div className="flex justify-between p-2 bg-white rounded border">
                          <span>Exponentielle</span>
                          <span className="font-bold text-purple-600">{pred.method_exp_delay}j</span>
                        </div>
                        <div className="flex justify-between p-3 bg-green-100 rounded font-bold border-2 border-green-300">
                          <span>🎯 FINALE</span>
                          <span className="text-green-700">{pred.predicted_delay}j</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <p className="mt-4 text-xs text-gray-500">Historique: {pred.nb_commandes_historique} commandes</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ========== ÉCRAN 4 : DISTRIBUTION (PIE CHART CORRIGÉ) ========== */}
      {activeScreen === 'distribution' && (
        <div className="grid gap-8 lg:grid-cols-2">
          {/* Graphique Circulaire CORRIGÉ avec Recharts */}
          <div className="rounded-xl bg-white p-8 shadow-lg">
            <h2 className="mb-6 text-2xl font-bold text-gray-900">📈 Distribution des Risques</h2>

            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={5}
                  dataKey="value"
                  label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                >
                  {pieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>

            {/* Légende détaillée */}
            <div className="mt-6 space-y-3">
              <div className="flex items-center justify-between p-3 bg-green-50 rounded-lg border-2 border-green-200">
                <div className="flex items-center gap-3">
                  <div className="w-4 h-4 bg-green-500 rounded-full"></div>
                  <span className="font-semibold">Risque Faible</span>
                </div>
                <span className="text-lg font-bold text-green-600">
                  {suppliers.filter(s => s.niveau_risque === 'Faible').length}
                </span>
              </div>
              <div className="flex items-center justify-between p-3 bg-yellow-50 rounded-lg border-2 border-yellow-200">
                <div className="flex items-center gap-3">
                  <div className="w-4 h-4 bg-yellow-500 rounded-full"></div>
                  <span className="font-semibold">Risque Modéré</span>
                </div>
                <span className="text-lg font-bold text-yellow-600">
                  {suppliers.filter(s => s.niveau_risque === 'Modéré').length}
                </span>
              </div>
              <div className="flex items-center justify-between p-3 bg-red-50 rounded-lg border-2 border-red-200">
                <div className="flex items-center gap-3">
                  <div className="w-4 h-4 bg-red-500 rounded-full"></div>
                  <span className="font-semibold">Risque Élevé</span>
                </div>
                <span className="text-lg font-bold text-red-600">
                  {suppliers.filter(s => s.niveau_risque === 'Élevé').length}
                </span>
              </div>
            </div>
          </div>

          {/* Recommandations */}
          <div className="rounded-xl bg-white p-8 shadow-lg">
            <h2 className="mb-6 text-2xl font-bold text-gray-900">💡 Résumé & Recommandations</h2>

            <div className="space-y-4">
              <div className="p-4 bg-blue-50 rounded-lg border-l-4 border-blue-500">
                <p className="font-semibold text-blue-900 mb-2">📊 État Global</p>
                <p className="text-sm text-blue-800">
                  {suppliers.filter(s => s.niveau_risque === 'Élevé').length > 0
                    ? `${suppliers.filter(s => s.niveau_risque === 'Élevé').length} fournisseur(s) en situation critique requiert une intervention immédiate.`
                    : 'Aucun fournisseur en risque critique. Bon maintien des normes.'
                  }
                </p>
              </div>

              <div className="p-4 bg-orange-50 rounded-lg border-l-4 border-orange-500">
                <p className="font-semibold text-orange-900 mb-2">⚠️ Attention</p>
                <p className="text-sm text-orange-800">
                  {suppliers.filter(s => s.niveau_risque === 'Modéré').length} fournisseur(s) à surveiller pour éviter leur dégradation.
                </p>
              </div>

              <div className="p-4 bg-green-50 rounded-lg border-l-4 border-green-500">
                <p className="font-semibold text-green-900 mb-2">✅ Excellent</p>
                <p className="text-sm text-green-800">
                  {suppliers.filter(s => s.niveau_risque === 'Faible').length} fournisseur(s) performant(s). Maintenir la relation.
                </p>
              </div>

              <div className="mt-6 p-4 bg-gray-100 rounded-lg">
                <p className="font-semibold text-gray-900 mb-3">📋 Actions Prioritaires</p>
                <ul className="text-sm text-gray-700 space-y-2">
                  <li>✓ Renforcer contrôles qualité (audit 8D si risque élevé)</li>
                  <li>✓ Analyser tendances (hausse/baisse défauts & retards)</li>
                  <li>✓ Planifier formation/recalibrage si nécessaire</li>
                  <li>✓ Suivi hebdomadaire des cas modérés</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========== MODAL AJOUT FOURNISSEUR ========== */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
          <div className="w-full max-w-2xl rounded-xl bg-white p-8 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="mb-6 flex items-center justify-between">
              <h2 className="text-2xl font-bold text-gray-900">➕ Ajouter un fournisseur</h2>
              <button onClick={() => setShowAddModal(false)} className="rounded-full p-2 hover:bg-gray-100">
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
                  <label className="block text-sm font-medium text-gray-700">Email</label>
                  <div className="relative mt-1">
                    <Mail className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
                    <input
                      type="email"
                      value={newSupplier.email}
                      onChange={(e) => setNewSupplier({ ...newSupplier, email: e.target.value })}
                      className="w-full rounded-lg border border-gray-300 p-3 pl-10"
                      placeholder="contact@fournisseur.com"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Téléphone</label>
                  <div className="relative mt-1">
                    <Phone className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
                    <input
                      type="tel"
                      value={newSupplier.phone}
                      onChange={(e) => setNewSupplier({ ...newSupplier, phone: e.target.value })}
                      className="w-full rounded-lg border border-gray-300 p-3 pl-10"
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
                    className="w-full rounded-lg border border-gray-300 p-3 pl-10"
                    placeholder="Adresse complète"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Note Qualité</label>
                  <div className="mt-1 flex items-center gap-2">
                    <input
                      type="range" min="1" max="10"
                      value={newSupplier.quality_rating}
                      onChange={(e) => setNewSupplier({ ...newSupplier, quality_rating: Number(e.target.value) })}
                      className="flex-1"
                    />
                    <span className="flex items-center gap-1 text-lg font-bold text-yellow-600">
                      <Star className="h-5 w-5 fill-yellow-400" /> {newSupplier.quality_rating}/10
                    </span>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Note Livraison</label>
                  <div className="mt-1 flex items-center gap-2">
                    <input
                      type="range" min="1" max="10"
                      value={newSupplier.delivery_rating}
                      onChange={(e) => setNewSupplier({ ...newSupplier, delivery_rating: Number(e.target.value) })}
                      className="flex-1"
                    />
                    <span className="flex items-center gap-1 text-lg font-bold text-blue-600">
                      <Clock className="h-5 w-5" /> {newSupplier.delivery_rating}/10
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
                    className="w-full rounded-lg border border-gray-300 p-3 pl-10"
                    placeholder="Remarques..."
                  />
                </div>
              </div>
            </div>

            <div className="mt-6 flex gap-3">
              <button
                onClick={handleAddSupplier}
                className="flex-1 rounded-lg bg-green-600 px-6 py-3 font-semibold text-white hover:bg-green-700"
              >
                ✅ Ajouter le fournisseur
              </button>
              <button
                onClick={() => setShowAddModal(false)}
                className="rounded-lg border-2 border-gray-300 px-6 py-3 font-semibold text-gray-700 hover:bg-gray-100"
              >
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========== SUPPLIER DETAIL PANEL ========== */}
      {selectedSupplier && (
        <div className="fixed inset-0 z-40 flex justify-end" onClick={() => setSelectedSupplier(null)}>
          <div className="absolute inset-0 bg-black bg-opacity-30 transition-opacity" />
          <div
            className="relative w-full max-w-lg bg-white shadow-2xl overflow-y-auto transform transition-transform duration-300 ease-out"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Panel Header */}
            <div className={`sticky top-0 z-10 p-6 border-b-2 ${getStatusColor(selectedSupplier.status)}`}>
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-2xl font-bold text-gray-900">{selectedSupplier.supplier}</h2>
                  <span className={`inline-block mt-2 rounded-full px-4 py-1 text-sm font-semibold ${selectedSupplier.status === 'good' ? 'bg-green-500 text-white' :
                    selectedSupplier.status === 'warning' ? 'bg-yellow-500 text-white' : 'bg-red-500 text-white'
                    }`}>
                    Risque {selectedSupplier.niveau_risque}
                  </span>
                </div>
                <button
                  onClick={() => setSelectedSupplier(null)}
                  className="rounded-full p-2 hover:bg-gray-200 transition-colors"
                >
                  <XCircle className="h-7 w-7 text-gray-500" />
                </button>
              </div>
            </div>

            <div className="p-6 space-y-6">
              {/* Performance Metrics */}
              <div className="rounded-xl bg-gradient-to-br from-blue-50 to-indigo-50 p-5">
                <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                  <BarChart3 className="h-5 w-5 text-blue-600" /> Métriques de Performance
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-white rounded-lg p-4 shadow-sm">
                    <p className="text-sm text-gray-600">Score de Risque</p>
                    <div className="flex items-end gap-2">
                      <span className="text-4xl font-bold text-blue-600">{selectedSupplier.score_risque}</span>
                      <span className="text-gray-500 mb-1">/100</span>
                    </div>
                    <div className="mt-2 h-2 bg-gray-200 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${selectedSupplier.status === 'good' ? 'bg-green-500' : selectedSupplier.status === 'warning' ? 'bg-yellow-500' : 'bg-red-500'}`}
                        style={{ width: `${selectedSupplier.score_risque}%` }}
                      />
                    </div>
                  </div>
                  <div className="bg-white rounded-lg p-4 shadow-sm">
                    <p className="text-sm text-gray-600">Commandes</p>
                    <span className="text-4xl font-bold text-purple-600">{selectedSupplier.nb_commandes}</span>
                  </div>
                  <div className="bg-white rounded-lg p-4 shadow-sm">
                    <p className="text-sm text-gray-600">Taux de Défauts</p>
                    <div className="flex items-center gap-2">
                      <span className="text-3xl font-bold text-orange-600">{selectedSupplier.taux_defaut}%</span>
                      {getTrendIcon(selectedSupplier.tendance_defauts)}
                    </div>
                  </div>
                  <div className="bg-white rounded-lg p-4 shadow-sm">
                    <p className="text-sm text-gray-600">Retard Moyen</p>
                    <div className="flex items-center gap-2">
                      <span className="text-3xl font-bold text-blue-600">{selectedSupplier.retard_moyen}j</span>
                      {getTrendIcon(selectedSupplier.tendance_retards)}
                    </div>
                  </div>
                </div>
              </div>

              {/* Predictions Section */}
              {(() => {
                const prediction = getSupplierPrediction(selectedSupplier.supplier);
                if (!prediction) return null;
                return (
                  <div className="rounded-xl bg-gradient-to-br from-purple-50 to-pink-50 p-5">
                    <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                      <Activity className="h-5 w-5 text-purple-600" /> Prédictions
                    </h3>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-white rounded-lg p-4 shadow-sm">
                        <p className="text-sm text-gray-600">Défauts Prévus</p>
                        <span className="text-3xl font-bold text-orange-600">{prediction.predicted_defect}%</span>
                      </div>
                      <div className="bg-white rounded-lg p-4 shadow-sm">
                        <p className="text-sm text-gray-600">Retard Prévu</p>
                        <span className="text-3xl font-bold text-blue-600">{prediction.predicted_delay}j</span>
                      </div>
                    </div>
                    <div className="mt-3 flex items-center justify-center">
                      <span className={`px-3 py-1 rounded-full text-sm font-semibold ${prediction.confiance === 'haute' ? 'bg-green-100 text-green-700' :
                        prediction.confiance === 'moyenne' ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'
                        }`}>
                        Confiance: {prediction.confiance}
                      </span>
                    </div>
                  </div>
                );
              })()}

              {/* Supplier Actions */}
              {(() => {
                const supplierActions = getSupplierActions(selectedSupplier.supplier);
                if (supplierActions.length === 0) return null;
                return (
                  <div className="rounded-xl bg-gradient-to-br from-amber-50 to-orange-50 p-5">
                    <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                      <AlertTriangle className="h-5 w-5 text-amber-600" /> Actions Correctives
                    </h3>
                    <div className="space-y-3">
                      {supplierActions.map((action, idx) => (
                        <div key={idx} className="bg-white rounded-lg p-4 shadow-sm">
                          <div className="flex items-start gap-3">
                            <span className={`rounded-full px-2 py-1 text-xs font-bold ${getPriorityColor(action.priority)}`}>
                              {action.priority.toUpperCase()}
                            </span>
                            <div className="flex-1">
                              <p className="font-semibold text-gray-900">{action.action}</p>
                              <p className="text-sm text-gray-600 mt-1">{action.raison}</p>
                              <p className="text-xs text-gray-500 mt-2">⏱️ {action.delai} • 📊 {action.impact}</p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}

              {/* Action Buttons */}
              <div className="sticky bottom-0 bg-white pt-4 pb-2 border-t">
                <div className="flex gap-3">
                  <button
                    onClick={() => alert(`📊 Génération du rapport pour ${selectedSupplier.supplier}...`)}
                    className="flex-1 flex items-center justify-center gap-2 bg-blue-600 text-white px-4 py-3 rounded-lg font-semibold hover:bg-blue-700 transition-colors shadow-lg"
                  >
                    <FileBarChart className="h-5 w-5" /> Générer Rapport
                  </button>
                  <button
                    onClick={() => alert(`📤 Export des données de ${selectedSupplier.supplier}...`)}
                    className="flex items-center justify-center gap-2 bg-gray-100 text-gray-700 px-4 py-3 rounded-lg font-semibold hover:bg-gray-200 transition-colors"
                  >
                    <Download className="h-5 w-5" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}


    </div>
  );
}