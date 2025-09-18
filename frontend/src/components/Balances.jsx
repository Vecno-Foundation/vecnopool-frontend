import React, { useState, useEffect } from 'react';
import axios from 'axios';

function Balances({ address, ws }) {
  const [balances, setBalances] = useState([]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchBalances = async () => {
    setLoading(true);
    try {
      const response = await axios.get('/api/balances', {
        params: address ? { address } : {},
      });
      setBalances(response.data);
      setError(null);
    } catch (err) {
      setError('Failed to fetch balances');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBalances();
  }, [address]);

  useEffect(() => {
    if (!ws) return;

    const handleMessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        if (message.type === 'BalancesUpdated') {
          fetchBalances();
        }
      } catch (err) {
        console.error('WebSocket message error:', err);
      }
    };

    ws.onmessage = handleMessage;

    return () => {
      ws.onmessage = null;
    };
  }, [ws, address]);

  if (error) return <div className="text-red-500">{error}</div>;
  if (loading) return <div className="flex justify-center"><div className="spinner"></div></div>;

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full border-collapse bg-white dark:bg-gray-800 rounded-lg shadow-md">
        <thead>
          <tr className="bg-gray-200 dark:bg-gray-700">
            <th className="border-b p-4 text-left">Address</th>
            <th className="border-b p-4 text-left">Available Balance</th>
            <th className="border-b p-4 text-left">Total Earned Balance</th>
          </tr>
        </thead>
        <tbody>
          {balances.map((balance) => (
            <tr key={balance.address} className="hover:bg-gray-50 dark:hover:bg-gray-600 transition">
              <td className="border-b p-4">{balance.address}</td>
              <td className="border-b p-4">{(balance.available_balance / 100000000).toFixed(8)}</td>
              <td className="border-b p-4">{(balance.total_earned_balance / 100000000).toFixed(8)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default Balances;