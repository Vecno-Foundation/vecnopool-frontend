import React, { useState, useEffect } from 'react';
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
  if (n < 1000000) return [n / 1000, 'Khash/s'];
  if (n < 1000000000) return [n / 1000000, 'Mhash/s'];
  if (n < 1000000000000) return [n / 1000000000, 'Ghash/s'];
  if (n < 1000000000000000) return [n / 1000000000000, 'Thash/s'];
  return [n / 1000000000000000, 'Phash/s'];
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
  const [yAxisUnit, setYAxisUnit] = useState('Ghash/s');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchHashrate = async () => {
    setLoading(true);
    try {
      const now = new Date();
      const midnightToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const since = Math.floor(midnightToday.getTime() / 1000);
      const currentTenMinStart = Math.floor(now.getTime() / 1000 / 600) * 600;
      console.log('Time range:', { since, currentTenMinStart });
      const url = address
        ? `/api/hashrate?address=${encodeURIComponent(address)}&since=${since}&until=${currentTenMinStart}`
        : `/api/hashrate?since=${since}&until=${currentTenMinStart}`;
      const response = await axios.get(url);
      console.log('Hashrate API response:', response.data);

      const tenMinInterval = 600;
      const currentIntervalIndex = Math.floor((currentTenMinStart - since) / tenMinInterval);
      const tenMinTimestamps = Array.from(
        { length: currentIntervalIndex },
        (_, i) => since + i * tenMinInterval
      );
      const labels = tenMinTimestamps.map((timestamp) =>
        new Date(timestamp * 1000).toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        })
      );

      const tenMinData = Array(currentIntervalIndex).fill(0);
      const tenMinUnits = Array(currentIntervalIndex).fill('hash/s');
      const intervalCounts = Array(currentIntervalIndex).fill(0);
      response.data.forEach((point) => {
        const pointTimestamp = point.timestamp;
        const intervalsDiff = Math.floor((pointTimestamp - since) / tenMinInterval);
        if (intervalsDiff >= 0 && intervalsDiff < currentIntervalIndex) {
          const index = intervalsDiff;
          const [value, unit] = hashSuffix(point.hashrate);
          tenMinData[index] += value;
          intervalCounts[index] += 1;
          tenMinUnits[index] = unit;
        }
      });

      for (let i = 0; i < currentIntervalIndex; i++) {
        if (intervalCounts[i] > 0) {
          tenMinData[i] /= intervalCounts[i];
        }
      }

      const pointRadii = Array(currentIntervalIndex).fill(5);

      const unitCounts = tenMinUnits.reduce((acc, unit) => {
        acc[unit] = (acc[unit] || 0) + 1;
        return acc;
      }, {});
      const mostCommonUnit = Object.keys(unitCounts).reduce(
        (a, b) => (unitCounts[a] > unitCounts[b] ? a : b),
        'Ghash/s'
      );

      const convertedData = tenMinData.map((value, index) => {
        const currentUnit = tenMinUnits[index];
        if (currentUnit === mostCommonUnit || intervalCounts[index] === 0) return value;
        const unitFactors = {
          'hash/s': 1,
          'Khash/s': 1000,
          'Mhash/s': 1000000,
          'Ghash/s': 1000000000,
          'Thash/s': 1000000000000,
          'Phash/s': 1000000000000000,
        };
        const valueInHashes = value * unitFactors[currentUnit];
        const [convertedValue] = hashSuffix(valueInHashes);
        return convertedValue;
      });

      console.log('Processed hashrateData:', {
        labels,
        data: convertedData,
        unit: mostCommonUnit,
      });

      setYAxisUnit(mostCommonUnit);
      setHashrateData({
        labels,
        datasets: [
          {
            label: address ? `Miner Hashrate (${mostCommonUnit})` : `Pool Hashrate (${mostCommonUnit})`,
            data: convertedData,
            borderColor: 'rgb(75, 192, 192)',
            backgroundColor: 'rgba(75, 192, 192, 0.5)',
            tension: 0.1,
            pointRadius: pointRadii,
          },
        ],
      });
      setError(null);
    } catch (error) {
      console.error('Error fetching hashrate:', error);
      setError('Failed to fetch hashrate');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHashrate();
    const interval = setInterval(fetchHashrate, 30000);
    return () => clearInterval(interval);
  }, [address]);

  useEffect(() => {
    if (!ws) return;

    const handleMessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        if (message.type === 'HashrateUpdated' && (!address || message.data === address)) {
          fetchHashrate();
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
      <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500"></div>
    </div>
  );

  return (
    <div className="container mx-auto p-4 bg-white dark:bg-gray-800 rounded-lg shadow-md">
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
                afterLabel: () => (address ? `Address: ${address}\nVecnoScan: https://vecnoscan.org/addresses/vecno:${address}` : ''),
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