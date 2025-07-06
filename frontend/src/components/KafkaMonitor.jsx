import React, { useState, useEffect } from 'react';

const KafkaMonitor = () => {
  const [health, setHealth] = useState(null);
  const [topics, setTopics] = useState([]);
  const [consumerGroups, setConsumerGroups] = useState([]);
  const [selectedTopic, setSelectedTopic] = useState('');
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Mock auth token - in real app, this would come from auth context
  const authToken = 'your-jwt-token';

  const apiCall = async (endpoint) => {
    const response = await fetch(`http://localhost:3000/admin/kafka${endpoint}`, {
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json',
      },
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    return response.json();
  };

  const fetchHealth = async () => {
    try {
      setLoading(true);
      const result = await apiCall('/health');
      setHealth(result.data);
      setError('');
    } catch (err) {
      setError(`Failed to fetch health: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const fetchTopics = async () => {
    try {
      setLoading(true);
      const result = await apiCall('/topics');
      setTopics(result.data);
      setError('');
    } catch (err) {
      setError(`Failed to fetch topics: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const fetchConsumerGroups = async () => {
    try {
      setLoading(true);
      const result = await apiCall('/consumer-groups');
      setConsumerGroups(result.data);
      setError('');
    } catch (err) {
      setError(`Failed to fetch consumer groups: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const fetchMessages = async (topic, limit = 10, offset = 0) => {
    try {
      setLoading(true);
      const result = await apiCall(`/topics/${topic}/messages?limit=${limit}&offset=${offset}`);
      setMessages(result.data.messages);
      setError('');
    } catch (err) {
      setError(`Failed to fetch messages: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHealth();
    fetchTopics();
    fetchConsumerGroups();
  }, []);

  const handleTopicSelect = (topic) => {
    setSelectedTopic(topic);
    fetchMessages(topic);
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <h1 className="text-3xl font-bold mb-6">Kafka Monitor</h1>
      
      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          {error}
        </div>
      )}
      
      {loading && (
        <div className="flex justify-center items-center py-4">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
        </div>
      )}

      {/* Health Status */}
      <div className="bg-white rounded-lg shadow-md p-6 mb-6">
        <h2 className="text-xl font-semibold mb-4">Health Status</h2>
        {health ? (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="text-center">
              <div className={`text-2xl font-bold ${health.connected ? 'text-green-500' : 'text-red-500'}`}>
                {health.status}
              </div>
              <div className="text-sm text-gray-600">Status</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-500">
                {health.brokers?.length || 0}
              </div>
              <div className="text-sm text-gray-600">Brokers</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-purple-500">
                {Math.floor(health.uptime / 60)}m
              </div>
              <div className="text-sm text-gray-600">Uptime</div>
            </div>
            <div className="text-center">
              <div className={`text-2xl font-bold ${health.connected ? 'text-green-500' : 'text-red-500'}`}>
                {health.connected ? '✓' : '✗'}
              </div>
              <div className="text-sm text-gray-600">Connected</div>
            </div>
          </div>
        ) : (
          <div>Loading health status...</div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Topics */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-xl font-semibold mb-4">Topics</h2>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {topics.map((topic, index) => (
              <div
                key={index}
                className={`p-3 border rounded cursor-pointer transition-colors ${
                  selectedTopic === topic.name 
                    ? 'bg-blue-100 border-blue-500' 
                    : 'hover:bg-gray-50'
                }`}
                onClick={() => handleTopicSelect(topic.name)}
              >
                <div className="font-medium">{topic.name}</div>
                <div className="text-sm text-gray-600">
                  {topic.partitions} partitions, RF: {topic.replicationFactor}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Consumer Groups */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-xl font-semibold mb-4">Consumer Groups</h2>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {consumerGroups.map((group, index) => (
              <div key={index} className="p-3 border rounded">
                <div className="font-medium">{group.groupId}</div>
                <div className="text-sm text-gray-600">
                  State: {group.state} | Members: {group.members}
                </div>
                {group.topics.length > 0 && (
                  <div className="text-xs text-gray-500 mt-1">
                    Topics: {group.topics.join(', ')}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Messages */}
      {selectedTopic && (
        <div className="bg-white rounded-lg shadow-md p-6 mt-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold">Messages from "{selectedTopic}"</h2>
            <button
              onClick={() => fetchMessages(selectedTopic)}
              className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 transition-colors"
            >
              Refresh
            </button>
          </div>
          
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {messages.length === 0 ? (
              <div className="text-gray-500 text-center py-8">
                No messages found or topic is empty
              </div>
            ) : (
              messages.map((message, index) => (
                <div key={index} className="border rounded p-4 bg-gray-50">
                  <div className="flex justify-between items-start mb-2">
                    <div className="text-sm text-gray-600">
                      Partition: {message.partition} | Offset: {message.offset}
                    </div>
                    <div className="text-sm text-gray-600">
                      {new Date(message.timestamp).toLocaleString()}
                    </div>
                  </div>
                  {message.key && (
                    <div className="text-sm mb-2">
                      <span className="font-medium">Key:</span> {message.key}
                    </div>
                  )}
                  <div className="bg-white p-3 rounded border">
                    <pre className="text-sm overflow-x-auto">
                      {JSON.stringify(message.value, null, 2)}
                    </pre>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default KafkaMonitor;
