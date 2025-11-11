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
  ArrowUpRight,
  ArrowDownRight
} from 'lucide-react';

export default function SupplierDashboardPage() {
  const [selectedPeriod, setSelectedPeriod] = useState('30d');
  const [kpis, setKpis] = useState<any>(null);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [actions, setActions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Charger les données depuis FastAPI
  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await axios.get('http://127.0.0.1:8000/api/dashboard/data');
        setKpis(response.data.kpis_globaux);
        setSuppliers(response.data.suppliers);
        setActions(response.data.actions);
      } catch (error) {
        console.error('Erreur lors de la récupération des données :', error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'good':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'warning':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'alert':
        return 'bg-red-100 text-red-800 border-red-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
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

  if (loading) {
    return <div className="p-6">Chargement des données...</div>;
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">
              Tableau de Bord Prédictif Fournisseurs
            </h1>
            <p className="mt-2 text-gray-600">
              Vue d'ensemble des risques de retard et défauts qualité
            </p>
          </div>
          {/* Sélecteur de période */}
          <div className="flex gap-2">
            {['7d', '30d', '90d'].map((period) => (
              <button
                key={period}
                onClick={() => setSelectedPeriod(period)}
                className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                  selectedPeriod === period
                    ? 'bg-blue-600 text-white'
                    : 'bg-white text-gray-700 hover:bg-gray-100'
                }`}
              >
                {period === '7d' && '7 jours'}
                {period === '30d' && '30 jours'}
                {period === '90d' && '90 jours'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* KPIs Globaux */}
      <div className="mb-8 grid grid-cols-1 gap-6 md:grid-cols-4">
        <div className="rounded-lg bg-white p-6 shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Taux de défauts moyen</p>
              <p className="mt-2 text-3xl font-bold text-gray-900">{kpis?.taux_defaut}%</p>
            </div>
            <div className="rounded-full bg-orange-100 p-3">
              <AlertTriangle className="h-6 w-6 text-orange-600" />
            </div>
          </div>
        </div>
        <div className="rounded-lg bg-white p-6 shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Retard moyen (jours)</p>
              <p className="mt-2 text-3xl font-bold text-gray-900">
                {kpis?.taux_retard}
              </p>
            </div>
            <div className="rounded-full bg-blue-100 p-3">
              <Clock className="h-6 w-6 text-blue-600" />
            </div>
          </div>
        </div>
        <div className="rounded-lg bg-white p-6 shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Nombre de fournisseurs</p>
              <p className="mt-2 text-3xl font-bold text-gray-900">{kpis?.nb_fournisseurs}</p>
            </div>
            <div className="rounded-full bg-purple-100 p-3">
              <Package className="h-6 w-6 text-purple-600" />
            </div>
          </div>
        </div>
        <div className="rounded-lg bg-white p-6 shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Nombre de commandes</p>
              <p className="mt-2 text-3xl font-bold text-gray-900">{kpis?.nb_commandes}</p>
            </div>
            <div className="rounded-full bg-green-100 p-3">
              <Activity className="h-6 w-6 text-green-600" />
            </div>
          </div>
        </div>
      </div>
           {/* Graphique prédictions */}
<div className="mb-8">
  <h2 className="text-xl font-bold text-gray-900 mb-4">Prédictions fournisseurs</h2>
  <SupplierPredictions />
</div>

      {/* Fournisseurs */}
      <div className="lg:col-span-2">
        {suppliers.map((supplier) => (
          <div key={supplier.supplier} className={`rounded-lg border-2 p-4 mb-4 ${getStatusColor(supplier.niveau_risque)}`}>
            <h3 className="font-semibold text-gray-900">{supplier.supplier}</h3>
            <p>Taux de défauts : {(supplier.taux_defaut * 100).toFixed(2)}%</p>
            <p>Retard moyen : {supplier.retard_moyen.toFixed(1)} jours</p>
          </div>
        ))}
      </div>

      {/* Actions */}
      <div className="lg:col-span-1">
        {actions.map((action) => (
          <div key={action.supplier} className="rounded-lg border p-4 mb-4">
            <h4 className="font-semibold">{action.supplier}</h4>
            <p>{action.action}</p>
            <p>{action.niveau_risque}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
