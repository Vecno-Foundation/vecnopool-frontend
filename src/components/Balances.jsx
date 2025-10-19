import React, { useState, useEffect } from 'react';
import axios from 'axios';
import '../styles/mobile.css';

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
      console.log('Balances API response:', response.data);
      setBalances(response.data);
      setError(null);
    } catch (err) {
      console.error('Error fetching balances:', err);
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
        if (message.type === 'BalancesUpdated' && (!address || message.data === address)) {
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
  if (loading) return (
    <div className="flex justify-center">
      <div className="spinner"></div>
    </div>
  );

  if (balances.length === 0) {
    return (
      <div className="container mx-auto p-4">
        <h2 className="text-xl font-bold mb-4">
          {address ? 'Wallet Balances' : 'Top 20 Balances'}
        </h2>
        <p className="text-gray-500 text-center">
          {address ? `No balances found for address ${address}.` : 'No balances available.'}
        </p>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4">
      <h2 className="text-xl font-bold mb-4">
        {address ? 'Wallet Balances' : 'Top 20 Balances'}
      </h2>
      <div className="table-container">
        <table className="balances-table min-w-full bg-white dark:bg-gray-800 rounded-lg shadow-md">
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
                <td data-label="Address" className="border-b p-4">
                  <a
                    href={`https://vecnoscan.org/addresses/${balance.address}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="truncated text-blue-500 hover:underline"
                  >
                    {balance.address}
                  </a>
                </td>
                <td data-label="Available Balance" className="border-b p-4">
                  {(balance.available_balance / 100000000).toFixed(8)}
                </td>
                <td data-label="Total Earned" className="border-b p-4">
                  {(balance.total_earned_balance / 100000000).toFixed(8)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default Balances;