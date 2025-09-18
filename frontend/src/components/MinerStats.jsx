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

function MinerStats({ address, ws }) {
  const [shares, setShares] = useState([]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchShares = async () => {
    setLoading(true);
    try {
      // Calculate time range: 00:00 today to start of current 10-minute interval
      const now = new Date();
      const midnightToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const since = Math.floor(midnightToday.getTime() / 1000);
      const currentTenMinStart = Math.floor(now.getTime() / 1000 / 600) * 600; // Start of current 10-min interval
      const response = await axios.get('/api/shares', {
        params: address ? { address, since, until: currentTenMinStart } : { since, until: currentTenMinStart },
      });
      console.log('Shares API response:', response.data);
      setShares(response.data);
      setError(null);
    } catch (err) {
      console.error('Error fetching shares:', err);
      setError('Failed to fetch share data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchShares();
    const interval = setInterval(fetchShares, 60000); // Refresh every minute
    return () => clearInterval(interval);
  }, [address]);

  useEffect(() => {
    if (!ws) return;

    const handleMessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        if (message.type === 'HashrateUpdated') {
          fetchShares();
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

  // Aggregate shares into 10-minute buckets up to the last completed interval
  const now = new Date();
  const midnightToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const since = Math.floor(midnightToday.getTime() / 1000);
  const currentTenMinStart = Math.floor(now.getTime() / 1000 / 600) * 600; // Start of current 10-min interval
  const tenMinInterval = 600; // 10 minutes in seconds
  const totalIntervals = 24 * 6; // 144 intervals (24 hours * 6 intervals/hour)
  const currentIntervalIndex = Math.floor((currentTenMinStart - since) / tenMinInterval); // Index of current interval
  const tenMinTimestamps = Array.from(
    { length: currentIntervalIndex },
    (_, i) => since + i * tenMinInterval
  );

  const tenMinDifficulties = tenMinTimestamps.map((intervalStart) => {
    const intervalEnd = intervalStart + tenMinInterval;
    const totalDifficulty = shares
      .filter((share) => share.timestamp >= intervalStart && share.timestamp < intervalEnd)
      .reduce((sum, share) => sum + Number(share.difficulty), 0);
    return { timestamp: intervalStart, difficulty: totalDifficulty };
  });

  const labels = tenMinTimestamps.map((timestamp) =>
    new Date(timestamp * 1000).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })
  );

  const difficulties = tenMinDifficulties.map((point) => point.difficulty);

  const chartData = {
    labels,
    datasets: [
      {
        label: address ? 'Miner Total Difficulty' : 'Pool Total Difficulty',
        data: difficulties,
        fill: false,
        borderColor: 'rgba(59, 130, 246, 1)',
        backgroundColor: 'rgba(59, 130, 246, 0.5)',
        tension: 0.1,
        pointRadius: Array(currentIntervalIndex).fill(5),
      },
    ],
  };

  const chartOptions = {
    responsive: true,
    plugins: {
      legend: { position: 'top' },
      title: {
        display: true,
        text: address ? 'Miner Total Difficulty Today' : 'Pool Total Difficulty Today',
      },
      tooltip: {
        callbacks: {
          label: (context) => `${context.dataset.label}: ${context.parsed.y.toFixed(2)}`,
        },
      },
    },
    scales: {
      x: {
        title: { display: true, text: 'Time (10-min intervals)' },
        ticks: {
          // Show fewer labels to avoid clutter (e.g., every hour)
          callback: function (value, index) {
            const hourInterval = index % 6 === 0; // Show label every hour (6 * 10-min intervals)
            return hourInterval ? this.getLabelForValue(value) : '';
          },
          maxRotation: 45,
          minRotation: 45,
        },
      },
      y: {
        title: { display: true, text: 'Total Difficulty' },
        beginAtZero: true,
        ticks: {
          callback: (value) => `${value.toFixed(2)}`,
        },
      },
    },
  };

  if (error) return <div className="text-red-500">{error}</div>;
  if (loading) return (
    <div className="flex justify-center">
      <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500"></div>
    </div>
  );

  return (
    <div className="container mx-auto p-4 bg-white dark:bg-gray-800 rounded-lg shadow-md">
      <Line data={chartData} options={chartOptions} />
    </div>
  );
}

export default MinerStats;