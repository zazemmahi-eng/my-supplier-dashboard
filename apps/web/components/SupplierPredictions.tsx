'use client';

import { useEffect, useState } from 'react';
import axios from 'axios';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

export default function SupplierPredictions() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchPredictions = async () => {
      try {
        const res = await axios.get('http://127.0.0.1:8000/api/predictions'); // Endpoint FastAPI pour les prédictions
        setData(res.data.predictions);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchPredictions();
  }, []);

  if (loading) return <div>Chargement des prédictions...</div>;

  return (
    <div className="mt-8" style={{ width: '100%', height: 300 }}>
      <ResponsiveContainer>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="supplier" />
          <YAxis />
          <Tooltip />
          <Legend />
          <Line type="monotone" dataKey="predicted_defect" stroke="#FF0000" name="Défauts (%)"/>
          <Line type="monotone" dataKey="predicted_delay" stroke="#0000FF" name="Retard (jours)"/>
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
