'use client';
import { useState, useEffect } from 'react';
import axios from 'axios';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine
} from 'recharts';
import { TrendingUp, TrendingDown, Minus, AlertCircle } from 'lucide-react';

const API_BASE_URL = process.env.NEXT_PUBLIC_SUPPLIER_API_URL ?? 'http://127.0.0.1:8000';

interface Prediction {
  supplier: string;
  predicted_defect: number;
  predicted_delay: number;
  tendance_defects: string;
  tendance_delays: string;
  confiance: string;
}

export default function SupplierPredictions() {
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [loading, setLoading] = useState(true);
  const [chartType, setChartType] = useState<'line' | 'bar'>('line');

  useEffect(() => {
    const fetchPredictions = async () => {
      try {
        const response = await axios.get(`${API_BASE_URL}/api/predictions`);
        setPredictions(response.data.predictions);
      } catch (error) {
        console.error('Erreur chargement prédictions:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchPredictions();
  }, []);

  const getTendanceIcon = (tendance: string) => {
    if (tendance === 'hausse') return <TrendingUp className="h-4 w-4 text-red-500" />;
    if (tendance === 'baisse') return <TrendingDown className="h-4 w-4 text-green-500" />;
    return <Minus className="h-4 w-4 text-gray-400" />;
  };

  const getConfianceColor = (confiance: string) => {
    if (confiance === 'élevée') return 'text-green-600';
    if (confiance === 'moyenne') return 'text-yellow-600';
    return 'text-red-600';
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center rounded-lg bg-white shadow">
        <div className="text-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent mx-auto"></div>
          <p className="mt-2 text-gray-600">Chargement des prédictions...</p>
        </div>
      </div>
    );
  }

  if (predictions.length === 0) {
    return (
      <div className="rounded-lg bg-yellow-50 p-6 text-center">
        <AlertCircle className="mx-auto h-12 w-12 text-yellow-600" />
        <p className="mt-2 text-gray-700">Aucune prédiction disponible</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Sélecteur de type de graphique */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900">
          Prédictions par moyenne glissante
        </h3>
        <div className="flex gap-2">
          <button
            onClick={() => setChartType('line')}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              chartType === 'line'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            Courbes
          </button>
          <button
            onClick={() => setChartType('bar')}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              chartType === 'bar'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            Barres
          </button>
        </div>
      </div>

      {/* Graphique */}
      <div className="rounded-lg bg-white p-6 shadow">
        <ResponsiveContainer width="100%" height={400}>
          {chartType === 'line' ? (
            <LineChart data={predictions}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis
                dataKey="supplier"
                tick={{ fill: '#6b7280', fontSize: 12 }}
                tickLine={{ stroke: '#d1d5db' }}
              />
              <YAxis
                tick={{ fill: '#6b7280', fontSize: 12 }}
                tickLine={{ stroke: '#d1d5db' }}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#fff',
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px',
                  boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
                }}
              />
              <Legend
                wrapperStyle={{ paddingTop: '20px' }}
                iconType="line"
              />
              <ReferenceLine y={5} stroke="#fbbf24" strokeDasharray="3 3" label="Seuil" />
              <Line
                type="monotone"
                dataKey="predicted_defect"
                stroke="#ef4444"
                strokeWidth={3}
                name="Défauts prédits (%)"
                dot={{ fill: '#ef4444', r: 5 }}
                activeDot={{ r: 7 }}
              />
              <Line
                type="monotone"
                dataKey="predicted_delay"
                stroke="#3b82f6"
                strokeWidth={3}
                name="Retard prédit (jours)"
                dot={{ fill: '#3b82f6', r: 5 }}
                activeDot={{ r: 7 }}
              />
            </LineChart>
          ) : (
            <BarChart data={predictions}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis
                dataKey="supplier"
                tick={{ fill: '#6b7280', fontSize: 12 }}
              />
              <YAxis tick={{ fill: '#6b7280', fontSize: 12 }} />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#fff',
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px'
                }}
              />
              <Legend wrapperStyle={{ paddingTop: '20px' }} />
              <Bar dataKey="predicted_defect" fill="#ef4444" name="Défauts prédits (%)" />
              <Bar dataKey="predicted_delay" fill="#3b82f6" name="Retard prédit (jours)" />
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>

      {/* Tableau des prédictions */}
      <div className="rounded-lg bg-white shadow overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Fournisseur
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Défauts prédits
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Retard prédit
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Tendance défauts
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Tendance retards
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Confiance
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 bg-white">
            {predictions.map((pred) => (
              <tr key={pred.supplier} className="hover:bg-gray-50 transition-colors">
                <td className="whitespace-nowrap px-6 py-4">
                  <span className="font-medium text-gray-900">{pred.supplier}</span>
                </td>
                <td className="whitespace-nowrap px-6 py-4">
                  <span className={`font-semibold ${
                    pred.predicted_defect > 5 ? 'text-red-600' :
                    pred.predicted_defect > 3 ? 'text-yellow-600' :
                    'text-green-600'
                  }`}>
                    {pred.predicted_defect.toFixed(2)}%
                  </span>
                </td>
                <td className="whitespace-nowrap px-6 py-4">
                  <span className={`font-semibold ${
                    pred.predicted_delay > 3 ? 'text-red-600' :
                    pred.predicted_delay > 1 ? 'text-yellow-600' :
                    'text-green-600'
                  }`}>
                    {pred.predicted_delay.toFixed(1)} jours
                  </span>
                </td>
                <td className="whitespace-nowrap px-6 py-4">
                  <div className="flex items-center gap-2">
                    {getTendanceIcon(pred.tendance_defects)}
                    <span className="text-sm capitalize">{pred.tendance_defects}</span>
                  </div>
                </td>
                <td className="whitespace-nowrap px-6 py-4">
                  <div className="flex items-center gap-2">
                    {getTendanceIcon(pred.tendance_delays)}
                    <span className="text-sm capitalize">{pred.tendance_delays}</span>
                  </div>
                </td>
                <td className="whitespace-nowrap px-6 py-4">
                  <span className={`text-sm font-medium capitalize ${getConfianceColor(pred.confiance)}`}>
                    {pred.confiance}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}