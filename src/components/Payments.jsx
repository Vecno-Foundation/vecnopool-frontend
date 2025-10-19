import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import debounce from 'lodash/debounce';
import '../styles/mobile.css';

function Payments({ address, ws }) {
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [retryCount, setRetryCount] = useState(0);
  const maxRetries = 3;

  const fetchPayments = useCallback(async () => {
    setLoading(true);
    try {
      const url = address
        ? `/api/payments?address=${encodeURIComponent(address)}`
        : '/api/payments';
      console.log('Fetching payments from:', url);
      const response = await axios.get(url, { timeout: 15000 });
      console.log('Payments response:', response.data);
      if (!Array.isArray(response.data)) {
        throw new Error('Invalid payments API response: expected an array');
      }
      if (response.data.length === 0) {
        console.log('No payments returned for address:', address);
      }
      setPayments(response.data);
      setError(null);
      setRetryCount(0);
    } catch (error) {
      console.error('Error fetching payments:', error.message, error.response?.data);
      if (retryCount < maxRetries) {
        console.log(`Retrying fetchPayments (attempt ${retryCount + 2})`);
        setRetryCount(retryCount + 1);
        setTimeout(fetchPayments, 2000);
      } else {
        setError(`Failed to fetch payments after ${maxRetries} retries: ${error.message}`);
      }
    } finally {
      setLoading(false);
    }
  }, [address, retryCount]);

  const debouncedFetchPayments = useCallback(debounce(fetchPayments, 1000), [fetchPayments]);

  useEffect(() => {
    fetchPayments();
    const interval = setInterval(fetchPayments, 60000);
    return () => clearInterval(interval);
  }, [fetchPayments]);

  useEffect(() => {
    if (!ws) {
      console.warn('WebSocket prop is not provided');
      return;
    }
    console.log('WebSocket state:', ws.readyState);
    const handleMessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        console.log('WebSocket message:', message);
        if (message.type === 'PaymentAdded' && (!address || (message.data && message.data.includes(address)))) {
          setRetryCount(0);
          debouncedFetchPayments();
        }
      } catch (err) {
        console.error('WebSocket message error:', err);
      }
    };
    ws.onmessage = handleMessage;
    return () => { ws.onmessage = null; };
  }, [ws, address, debouncedFetchPayments]);

  if (error) return <div className="text-red-500 text-center">{error}</div>;
  if (loading) return (
    <div className="flex justify-center items-center h-64">
      <div className="spinner"></div>
    </div>
  );
  if (payments.length === 0) {
    return (
      <div className="container mx-auto p-4">
        <h2 className="text-2xl font-bold mb-4">Recent Payments</h2>
        <p className="text-gray-500 text-center">
          {address ? `No payments found for address ${address}.` : 'No payments available.'}
        </p>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4">
      <h2 className="text-2xl font-bold mb-4">Recent Payments</h2>
      <div className="table-container">
        <table className="payments-table min-w-full bg-white dark:bg-gray-800 rounded-lg shadow-md">
          <thead className="bg-gray-50 dark:bg-gray-700">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Address</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Amount</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Transaction ID</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Timestamp</th>
            </tr>
          </thead>
          <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
            {payments.map((payment) => (
              <tr key={payment.id}>
                <td data-label="Address" className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                  <a
                    href={`https://vecnoscan.org/addresses/${payment.address}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="truncated text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    {payment.address}
                  </a>
                </td>
                <td data-label="Amount" className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                  {(payment.amount / 1e8).toFixed(8)} VE
                </td>
                <td data-label="Transaction ID" className="px-6 py-4 whitespace-nowrap text-sm">
                  <a
                    href={`https://vecnoscan.org/txs/${payment.tx_id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="truncated text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    {payment.tx_id}
                  </a>
                </td>
                <td data-label="Timestamp" className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                  {new Date(payment.timestamp * 1000).toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default Payments;