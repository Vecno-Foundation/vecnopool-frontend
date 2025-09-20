import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import debounce from 'lodash/debounce';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
);

const hashSuffix = (n) => {
  if (n < 1000) return [n, 'hash/s'];
  if (n < 1000000000) return [n / 1000000, 'Mhash/s'];
  if (n < 1000000000000) return [n / 1000000000, 'Ghash/s'];
  if (n < 1000000000000000) return [n / 1000000000000, 'Thash/s'];
  return [n, 'hash/s'];
};

function Hashrate({ address, ws }) {
  const [hashrateData, setHashrateData] = useState({
    labels: [],
    datasets: [
      {
        label: 'Pool Hashrate',
        data: [],
        borderColor: 'rgb(75, 192, 192)',
        backgroundColor: 'rgba(75, 192, 192, 0.5)',
        tension: 0.1,
        pointRadius: [],
      },
    ],
  });
  const [yAxisUnit, setYAxisUnit] = useState('Mhash/s');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [retryCount, setRetryCount] = useState(0);
  const maxRetries = 3;

  const fetchHashrate = useCallback(async () => {
    setLoading(true);
    try {
      const now = new Date();
      const midnightToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const since = Math.floor(midnightToday.getTime() / 1000);
      const currentTenMinStart = Math.floor(now.getTime() / 1000 / 600) * 600;
      console.log('Fetching hashrate:', { address, since, until: currentTenMinStart, retryCount });

      const url = address
        ? `/api/hashrate?address=${encodeURIComponent(address)}&since=${since}&until=${currentTenMinStart}`
        : `/api/hashrate?since=${since}&until=${currentTenMinStart}`;
      const response = await axios.get(url, { timeout: 15000 });
      console.log('Raw API response:', response.data);

      if (!Array.isArray(response.data)) {
        throw new Error('Invalid API response: expected an array');
      }

      const interval_secs = 600;
      const interval_count = Math.max(1, Math.floor((currentTenMinStart - since) / interval_secs));
      const labels = Array.from(
        { length: interval_count },
        (_, i) => {
          const timestamp = since + i * interval_secs;
          return new Date(timestamp * 1000).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
          });
        }
      );

      const data = Array(interval_count).fill(0);
      response.data.forEach((point) => {
        const pointTimestamp = point.timestamp;
        const index = Math.round((pointTimestamp - since) / interval_secs);
        if (index >= 0 && index < interval_count) {
          data[index] = point.hashrate; // hashrate in hash/s
        }
      });

      if (data.every(val => val === 0)) {
        console.warn('No hashrate data available for the requested period');
      }

      const maxHashrate = Math.max(...data, 0);
      const [_, targetUnit] = hashSuffix(maxHashrate);
      console.log(`Max hashrate: ${maxHashrate} hash/s, selected unit: ${targetUnit}`);

      const unitFactors = {
        'hash/s': 1,
        'Mhash/s': 1000000,
        'Ghash/s': 1000000000,
        'Thash/s': 1000000000000,
      };
      const convertedData = data.map(val => {
        if (val === 0) return 0;
        const [scaledValue, unit] = hashSuffix(val);
        console.log(`Converting ${val} hash/s -> ${scaledValue} ${unit}`);
        return val / unitFactors[targetUnit];
      });

      console.log('Processed hashrateData:', {
        labels,
        data: convertedData,
        unit: targetUnit,
      });

      setHashrateData({
        labels,
        datasets: [
          {
            label: address ? `Miner Hashrate (${targetUnit})` : `Pool Hashrate (${targetUnit})`,
            data: convertedData,
            borderColor: 'rgb(75, 192, 192)',
            backgroundColor: 'rgba(75, 192, 192, 0.5)',
            tension: 0.1,
            pointRadius: Array(interval_count).fill(5),
          },
        ],
      });
      setYAxisUnit(targetUnit);
      setError(null);
      setRetryCount(0);
    } catch (error) {
      console.error('Error fetching hashrate:', error);
      if (retryCount < maxRetries) {
        console.log(`Retrying fetchHashrate (attempt ${retryCount + 2})`);
        setRetryCount(retryCount + 1);
        setTimeout(fetchHashrate, 2000);
      } else {
        setError(`Failed to fetch hashrate data after ${maxRetries} retries: ${error.message}`);
      }
    } finally {
      setLoading(false);
    }
  }, [address, retryCount]);

  const debouncedFetchHashrate = useCallback(debounce(fetchHashrate, 1000), [fetchHashrate]);

  useEffect(() => {
    fetchHashrate();
    const interval = setInterval(fetchHashrate, 60000);
    return () => clearInterval(interval);
  }, [fetchHashrate]);

  useEffect(() => {
    if (!ws) {
      console.warn('WebSocket prop is not provided');
      return;
    }
    console.log('WebSocket state:', ws.readyState);
    const handleMessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        if (message.type === 'HashrateUpdated' && (!address || (message.data && message.data.includes(address)))) {
          setRetryCount(0);
          debouncedFetchHashrate();
        }
      } catch (err) {
        console.error('WebSocket message error:', err);
      }
    };
    ws.onmessage = handleMessage;
    return () => { ws.onmessage = null; };
  }, [ws, address, debouncedFetchHashrate]);

  if (error) return <div className="text-red-500 text-center">{error}</div>;
  if (loading) return (
    <div className="flex justify-center items-center h-64">
      <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500"></div>
    </div>
  );
  if (!hashrateData.datasets[0].data.some(val => val !== 0)) {
    return <div className="text-center">No hashrate data available for the selected period.</div>;
  }

  return (
    <div className="container mx-auto p-4 bg-white dark:bg-gray-800 rounded-lg shadow-md" style={{ minHeight: '400px' }}>
      <Line
        data={hashrateData}
        options={{
          responsive: true,
          plugins: {
            legend: { position: 'top' },
            title: {
              display: true,
              text: address ? 'Miner Hashrate Today' : 'Pool Hashrate Today',
            },
            tooltip: {
              callbacks: {
                label: (context) => `${context.dataset.label}: ${context.parsed.y.toFixed(2)} ${yAxisUnit}`,
                afterLabel: () => (address ? `Address: ${address}\nVecnoScan: https://vecnoscan.org/addresses/${address}` : ''),
              },
            },
          },
          scales: {
            y: {
              beginAtZero: true,
              title: { display: true, text: `Hashrate (${yAxisUnit})` },
              ticks: {
                callback: (value) => `${value.toFixed(2)}`,
              },
            },
            x: {
              title: { display: true, text: 'Time (10-min intervals)' },
              ticks: {
                callback: function (value, index) {
                  const hourInterval = index % 6 === 0;
                  return hourInterval ? this.getLabelForValue(value) : '';
                },
                maxRotation: 45,
                minRotation: 45,
              },
            },
          },
        }}
      />
    </div>
  );
}

export default Hashrate;