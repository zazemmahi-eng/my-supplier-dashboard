'use client';
import { useState, useCallback } from 'react';
import axios from 'axios';
import { 
  Upload, FileText, Download, AlertCircle, CheckCircle, 
  Table, Calendar, Percent, Database 
} from 'lucide-react';

const API_BASE_URL = process.env.NEXT_PUBLIC_SUPPLIER_API_URL ?? 'http://127.0.0.1:8000';

interface UploadResult {
  success: boolean;
  message: string;
  summary?: {
    total_rows: number;
    suppliers: number;
    date_range: { start: string; end: string };
    supplier_list: string[];
  };
}

interface DataUploadLandingProps {
  onUploadSuccess: (result: UploadResult) => void;
}

export default function DataUploadLanding({ onUploadSuccess }: DataUploadLandingProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleFileUpload(files[0]);
    }
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleFileUpload(files[0]);
    }
  };

  const handleFileUpload = async (file: File) => {
    if (!file.name.endsWith('.csv')) {
      setError('Format invalide. Veuillez uploader un fichier .csv');
      return;
    }

    setIsUploading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await axios.post<UploadResult>(
        `${API_BASE_URL}/api/upload`,
        formData,
        { headers: { 'Content-Type': 'multipart/form-data' } }
      );

      onUploadSuccess(response.data);
    } catch (err) {
      if (axios.isAxiosError(err)) {
        const detail = err.response?.data?.detail;
        if (typeof detail === 'object' && detail.errors) {
          setError(detail.errors.join('\n'));
        } else {
          setError(detail || 'Erreur lors du téléchargement');
        }
      } else {
        setError('Erreur inconnue');
      }
    } finally {
      setIsUploading(false);
    }
  };

  const handleDownloadSample = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/api/sample-data/download`, {
        responseType: 'blob'
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'sample_suppliers.csv');
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch {
      setError('Impossible de télécharger le fichier exemple');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 p-8">
      <div className="mx-auto max-w-4xl">
        {/* Header */}
        <div className="mb-12 text-center">
          <div className="mb-4 inline-flex items-center justify-center rounded-full bg-blue-500/20 p-4">
            <Database className="h-12 w-12 text-blue-400" />
          </div>
          <h1 className="mb-4 text-4xl font-bold text-white">
            Dashboard Prédictif Fournisseurs
          </h1>
          <p className="text-lg text-blue-200">
            Analysez les performances de vos fournisseurs et prédisez les retards de livraison
          </p>
        </div>

        {/* Required Schema */}
        <div className="mb-8 rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-sm">
          <h2 className="mb-4 flex items-center gap-2 text-xl font-semibold text-white">
            <Table className="h-5 w-5 text-blue-400" />
            Format de données requis
          </h2>
          <p className="mb-4 text-gray-300">
            Votre fichier CSV doit contenir les colonnes suivantes :
          </p>
          
          <div className="mb-6 overflow-hidden rounded-lg border border-white/10">
            <table className="w-full text-left text-sm">
              <thead className="bg-blue-900/50">
                <tr>
                  <th className="px-4 py-3 font-semibold text-blue-200">Colonne</th>
                  <th className="px-4 py-3 font-semibold text-blue-200">Type</th>
                  <th className="px-4 py-3 font-semibold text-blue-200">Description</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                <tr className="bg-white/5">
                  <td className="px-4 py-3 font-mono text-green-400">supplier</td>
                  <td className="px-4 py-3 text-gray-300">Texte</td>
                  <td className="px-4 py-3 text-gray-300">Nom ou ID du fournisseur</td>
                </tr>
                <tr>
                  <td className="px-4 py-3 font-mono text-green-400">date_promised</td>
                  <td className="px-4 py-3 text-gray-300">Date (YYYY-MM-DD)</td>
                  <td className="px-4 py-3 text-gray-300">Date de livraison promise</td>
                </tr>
                <tr className="bg-white/5">
                  <td className="px-4 py-3 font-mono text-green-400">date_delivered</td>
                  <td className="px-4 py-3 text-gray-300">Date (YYYY-MM-DD)</td>
                  <td className="px-4 py-3 text-gray-300">Date de livraison effective</td>
                </tr>
                <tr>
                  <td className="px-4 py-3 font-mono text-green-400">defects</td>
                  <td className="px-4 py-3 text-gray-300">Décimal (0.0-1.0)</td>
                  <td className="px-4 py-3 text-gray-300">Taux de défauts (ex: 0.05 = 5%)</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Sample Preview */}
          <div className="rounded-lg bg-slate-800/50 p-4">
            <p className="mb-2 text-sm font-medium text-gray-400">Exemple de fichier CSV :</p>
            <pre className="overflow-x-auto text-sm text-green-400">
{`supplier,date_promised,date_delivered,defects
Fournisseur A,2024-01-01,2024-01-03,0.02
Fournisseur A,2024-01-05,2024-01-06,0.01
Fournisseur B,2024-01-02,2024-01-10,0.05`}
            </pre>
          </div>
        </div>

        {/* Upload Zone */}
        <div className="mb-6">
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`
              relative cursor-pointer rounded-2xl border-2 border-dashed p-12 text-center transition-all
              ${isDragging 
                ? 'border-blue-400 bg-blue-500/20' 
                : 'border-white/30 bg-white/5 hover:border-blue-400/50 hover:bg-white/10'
              }
              ${isUploading ? 'pointer-events-none opacity-50' : ''}
            `}
          >
            <input
              type="file"
              accept=".csv"
              onChange={handleFileSelect}
              className="absolute inset-0 cursor-pointer opacity-0"
              disabled={isUploading}
            />
            
            {isUploading ? (
              <div className="flex flex-col items-center">
                <div className="mb-4 h-12 w-12 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
                <p className="text-lg font-medium text-white">Analyse en cours...</p>
              </div>
            ) : (
              <>
                <Upload className="mx-auto mb-4 h-12 w-12 text-blue-400" />
                <p className="mb-2 text-lg font-medium text-white">
                  Glissez-déposez votre fichier CSV ici
                </p>
                <p className="text-gray-400">ou cliquez pour sélectionner</p>
              </>
            )}
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mb-6 flex items-start gap-3 rounded-lg border border-red-500/30 bg-red-500/10 p-4">
            <AlertCircle className="h-5 w-5 flex-shrink-0 text-red-400" />
            <div>
              <p className="font-medium text-red-300">Erreur de validation</p>
              <pre className="mt-1 whitespace-pre-wrap text-sm text-red-200">{error}</pre>
            </div>
          </div>
        )}

        {/* Download Sample Button */}
        <div className="text-center">
          <button
            onClick={handleDownloadSample}
            className="inline-flex items-center gap-2 rounded-lg border border-white/20 bg-white/5 px-6 py-3 font-medium text-white transition-colors hover:bg-white/10"
          >
            <Download className="h-5 w-5" />
            Télécharger un fichier exemple
          </button>
        </div>

        {/* Features */}
        <div className="mt-12 grid gap-6 md:grid-cols-3">
          <div className="rounded-xl border border-white/10 bg-white/5 p-6 text-center">
            <CheckCircle className="mx-auto mb-3 h-8 w-8 text-green-400" />
            <h3 className="mb-2 font-semibold text-white">Analyse de Risque</h3>
            <p className="text-sm text-gray-400">
              Scoring automatique basé sur les retards et défauts
            </p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 p-6 text-center">
            <Calendar className="mx-auto mb-3 h-8 w-8 text-blue-400" />
            <h3 className="mb-2 font-semibold text-white">Prédictions</h3>
            <p className="text-sm text-gray-400">
              3 méthodes: moyenne glissante, régression, lissage exponentiel
            </p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 p-6 text-center">
            <Percent className="mx-auto mb-3 h-8 w-8 text-purple-400" />
            <h3 className="mb-2 font-semibold text-white">KPIs Globaux</h3>
            <p className="text-sm text-gray-400">
              Taux de retard, défauts moyens, conformité
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
