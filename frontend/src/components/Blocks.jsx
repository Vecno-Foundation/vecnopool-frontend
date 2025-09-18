import React, { useState, useEffect } from 'react';
import axios from 'axios';

function Blocks({ address, ws }) {
  const [blocks, setBlocks] = useState([]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchBlocks = async () => {
    setLoading(true);
    try {
      const response = await axios.get('/api/blocks', {
        params: address ? { address } : {},
      });
      // Sort by daa_score descending and take the latest 10 blocks
      const sortedBlocks = response.data
        .sort((a, b) => b.daa_score - a.daa_score)
        .slice(0, 10);
      setBlocks(sortedBlocks);
      setError(null);
    } catch (error) {
      console.error('Error fetching blocks:', error);
      setError('Failed to fetch blocks');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBlocks();
  }, [address]);

  useEffect(() => {
    if (!ws) return;

    const handleMessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        if (message.type === 'BlocksUpdated') {
          fetchBlocks();
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
    <div className="container mx-auto p-4">
      <h2 className="text-2xl font-bold mb-4">Latest Mined Blocks</h2>
      <table className="min-w-full bg-white dark:bg-gray-800 rounded-lg shadow-md">
        <thead>
          <tr className="bg-gray-200 dark:bg-gray-700">
            <th className="py-2 px-4 border-b dark:border-gray-600 text-left">Block Hash</th>
            <th className="py-2 px-4 border-b dark:border-gray-600 text-left">DAA Score</th>
            <th className="py-2 px-4 border-b dark:border-gray-600 text-left">Amount</th>
            <th className="py-2 px-4 border-b dark:border-gray-600 text-left">Timestamp</th>
          </tr>
        </thead>
        <tbody>
          {blocks.map((block) => (
            <tr key={block.reward_block_hash} className="hover:bg-gray-50 dark:hover:bg-gray-600 transition">
              <td className="py-2 px-4 border-b dark:border-gray-600">
                <a
                  href={`https://vecnoscan.org/blocks/${block.reward_block_hash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-500 hover:underline"
                >
                  {block.reward_block_hash}
                </a>
              </td>
              <td className="py-2 px-4 border-b dark:border-gray-600">{block.daa_score}</td>
              <td className="py-2 px-4 border-b dark:border-gray-600">
                {(block.amount / 100000000).toFixed(8)}
              </td>
              <td className="py-2 px-4 border-b dark:border-gray-600">
                {new Date(block.timestamp * 1000).toLocaleString()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default Blocks;