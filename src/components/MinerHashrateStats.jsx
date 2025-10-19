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
  if (n < 1000000000000) return [n / 1000000000000, 'Ghash/s'];
  if (n < 1000000000000000) return [n / 1000000000000, 'Thash/s'];
  return [n, 'hash/s'];
};

function MinerHashrateStats({ address }) {
  const [chartData, setChartData] = useState({
    labels: [],
    datasets: [
      {
        label: 'Pool Hashrate',
        data: [],
        borderColor: 'rgb(75, 192, 192)',
        backgroundColor: 'rgba(75, 192, 192, 0.5)',
        tension: 0.1,
        pointRadius: [],
        borderWidth: 2,
        yAxisID: 'y-hashrate',
        z: 2,
      },
      {
        label: 'Total Difficulty',
        data: [],
        borderColor: 'rgba(59, 130, 246, 0.7)',
        backgroundColor: 'rgba(59, 130, 246, 0.3)',
        tension: 0.1,
        pointRadius: [],
        borderWidth: 2,
        yAxisID: 'y-difficulty',
        z: 1,
      },
    ],
  });
  const [yAxisUnit, setYAxisUnit] = useState('Mhash/s');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [retryCount, setRetryCount] = useState(0);
  const maxRetries = 3;

  const API_BASE_URL = import.meta.env.MODE === 'development' ? '/api' : 'https://poolapi.vecnoscan.org/api';

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const now = new Date();
      const midnightToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const since = Math.floor(midnightToday.getTime() / 1000);
      const currentTenMinStart = Math.floor(now.getTime() / 1000 / 600) * 600;
      console.log('Fetching data:', { address, since, until: currentTenMinStart, retryCount });

      // Fetch shares for difficulty
      const sharesResponse = await axios.get(`${API_BASE_URL}/shares`, {
        params: address ? { address, since, until: currentTenMinStart } : { since, until: currentTenMinStart },
        timeout: 15000,
      });
      console.log('Shares API response:', sharesResponse.data);

      // Validate sharesResponse.data
      if (!Array.isArray(sharesResponse.data)) {
        console.warn('Invalid shares API response: expected an array, got:', sharesResponse.data);
        sharesResponse.data = [];
      }

      // Fetch hashrate
      const hashrateUrl = address
        ? `${API_BASE_URL}/hashrate?address=${encodeURIComponent(address)}&since=${since}&until=${currentTenMinStart}`
        : `${API_BASE_URL}/hashrate?since=${since}&until=${currentTenMinStart}`;
      const hashrateResponse = await axios.get(hashrateUrl, { timeout: 15000 });
      console.log('Hashrate API response:', hashrateResponse.data);

      if (!Array.isArray(hashrateResponse.data)) {
        console.warn('Invalid hashrate API response: expected an array, got:', hashrateResponse.data);
        hashrateResponse.data = [];
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

      // Process difficulty data
      const difficultyPoints = Array(interval_count).fill(0);
      sharesResponse.data.forEach((share) => {
        const index = Math.round((share.timestamp - since) / interval_secs);
        if (index >= 0 && index < interval_count) {
          difficultyPoints[index] += Number(share.difficulty || 0);
        }
      });

      // Process hashrate data
      const hashratePoints = Array(interval_count).fill(0);
      hashrateResponse.data.forEach((point) => {
        const pointTimestamp = point.timestamp;
        const index = Math.round((pointTimestamp - since) / interval_secs);
        if (index >= 0 && index < interval_count) {
          hashratePoints[index] = point.hashrate || 0;
        }
      });

      if (hashratePoints.every(val => val === 0)) {
        console.warn('No hashrate data available for the requested period');
      }
      if (difficultyPoints.every(val => val === 0)) {
        console.warn('No difficulty data available for the requested period');
      }

      // Determine hashrate unit
      const maxHashrate = Math.max(...hashratePoints, 0);
      const [_, targetUnit] = hashSuffix(maxHashrate);
      console.log(`Max hashrate: ${maxHashrate} hash/s, selected unit: ${targetUnit}`);

      const unitFactors = {
        'hash/s': 1,
        'Mhash/s': 1000000,
        'Ghash/s': 1000000000,
        'Thash/s': 1000000000000,
      };
      const convertedHashrate = hashratePoints.map(val => {
        if (val === 0) return 0;
        return val / unitFactors[targetUnit];
      });

      console.log('Processed data:', {
        labels,
        difficulty: difficultyPoints,
        hashrate: convertedHashrate,
        unit: targetUnit,
      });

      setChartData({
        labels,
        datasets: [
          {
            label: address ? `Miner Hashrate (${targetUnit})` : `Pool Hashrate (${targetUnit})`,
            data: convertedHashrate,
            borderColor: 'rgb(75, 192, 192)',
            backgroundColor: 'rgba(75, 192, 192, 0.5)',
            tension: 0.1,
            pointRadius: Array(interval_count).fill(5),
            borderWidth: 2,
            yAxisID: 'y-hashrate',
            z: 2,
          },
          {
            label: address ? `Miner Total Difficulty` : `Pool Total Difficulty`,
            data: difficultyPoints,
            borderColor: 'rgba(59, 130, 246, 0.7)',
            backgroundColor: 'rgba(59, 130, 246, 0.3)',
            tension: 0.1,
            pointRadius: Array(interval_count).fill(5),
            borderWidth: 1,
            yAxisID: 'y-difficulty',
            z: 1,
          },
        ],
      });

      setYAxisUnit(targetUnit);
      setError(null);
      setRetryCount(0);
    } catch (error) {
      console.error('Error fetching data:', error);
      if (retryCount < maxRetries) {
        console.log(`Retrying fetchData (attempt ${retryCount + 2})`);
        setRetryCount(retryCount + 1);
        setTimeout(fetchData, 2000);
      } else {
        setError(`Failed to fetch data after ${maxRetries} retries: ${error.message}`);
      }
    } finally {
      setLoading(false);
    }
  }, [address, retryCount]);

  const debouncedFetchData = useCallback(debounce(fetchData, 1000), [fetchData]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 60000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const chartOptions = {
    responsive: true,
    plugins: {
      legend: { position: 'top' },
      title: {
        display: true,
      },
      tooltip: {
        callbacks: {
          label: (context) => `${context.dataset.label}: ${context.parsed.y.toFixed(2)} ${context.dataset.label.includes('Hashrate') ? yAxisUnit : ''}`,
          afterLabel: () => (address ? `Address: ${address}\n Vecnoscan: https://vecnoscan.org/addresses/vecno:${address}` : ''),
        },
      },
    },
    scales: {
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
      'y-hashrate': {
        type: 'linear',
        display: true,
        position: 'left',
        title: { display: true, text: `Hashrate (${yAxisUnit})` },
        beginAtZero: true,
        ticks: {
          callback: (value) => `${value.toFixed(2)}`,
        },
      },
      'y-difficulty': {
        type: 'linear',
        display: true,
        position: 'right',
        title: { display: true, text: 'Total Difficulty' },
        beginAtZero: true,
        ticks: {
          callback: (value) => `${value.toFixed(2)}`,
        },
        grid: {
          drawOnChartArea: false,
        },
      },
    },
  };

  if (error) return <div className="text-red-500 text-center">{error}</div>;
  if (loading) return (
    <div className="flex justify-center items-center h-64">
      <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500"></div>
    </div>
  );
  if (!chartData.datasets[0].data.some(val => val !== 0) && !chartData.datasets[1].data.some(val => val !== 0)) {
    return <div className="text-center">No data available for the selected period.</div>;
  }

  return (
    <div className="container mx-auto p-4 bg-white dark:bg-gray-800 rounded-lg shadow-md">
      <h2 className="text-2xl font-semibold mb-4">{address ? 'Miner Performance' : 'Pool Performance'}</h2>
      <Line data={chartData} options={chartOptions} />
    </div>
  );
}

export default MinerHashrateStats;