// src/App.jsx

import React, { useState, useEffect } from 'react';
import MinerStats from './components/MinerStats.jsx';
import Balances from './components/Balances.jsx';
import Blocks from './components/Blocks.jsx';
import Hashrate from './components/Hashrate.jsx';

function App() {
  const [address, setAddress] = useState('');
  const [theme, setTheme] = useState('light');
  const [ws, setWs] = useState(null);

  useEffect(() => {
    document.documentElement.className = theme;
  }, [theme]);

  useEffect(() => {
    const websocket = new WebSocket('ws://localhost:8080/ws');
    websocket.onopen = () => console.log('WebSocket connected');
    websocket.onclose = () => console.log('WebSocket disconnected');
    websocket.onerror = (error) => console.error('WebSocket error:', error);
    setWs(websocket);

    return () => {
      websocket.close();
    };
  }, []);

  const toggleTheme = () => {
    setTheme(theme === 'light' ? 'dark' : 'light');
  };

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900 text-gray-900 dark:text-gray-100 transition-colors duration-300">
      <div className="container mx-auto p-4 sm:p-6">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold">Vecno Mining Pool Dashboard</h1>
        </div>
        <div className="mb-6 bg-white dark:bg-gray-800 p-4 rounded-lg shadow-md">
          <label htmlFor="address" className="block text-lg font-medium mb-2">
            Filter by Miner Address
          </label>
          <input
            id="address"
            type="text"
            value={address}
            onChange={(e) => setAddress(e.target.value.trim())}
            className="border border-gray-300 dark:border-gray-600 rounded-lg p-2 w-full bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500"
            placeholder="Enter miner address (e.g., vecno:qqtsqwxa...)"
          />
        </div>
        <div className="space-y-8">
          <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow-md">
            <h2 className="text-2xl font-semibold mb-4">Pool Hashrate</h2>
            <Hashrate address={address} ws={ws} />
          </div>
          <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow-md">
            <h2 className="text-2xl font-semibold mb-4">Miner Statistics</h2>
            <MinerStats address={address} ws={ws} />
          </div>
          <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow-md">
            <h2 className="text-2xl font-semibold mb-4">Balances</h2>
            <Balances address={address} ws={ws} />
          </div>
          <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow-md">
            <h2 className="text-2xl font-semibold mb-4">Mined Blocks</h2>
            <Blocks address={address} ws={ws} />
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;