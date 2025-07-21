import React, { useState, useEffect, useRef } from 'react';

// Deterministic UUID v4 generator based on input string
// This ensures the same string always generates the same UUID
const generateDeterministicUUID = (input) => {
  // Simple hash function to create deterministic randomness
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  
  // Use the hash to create a consistent UUID
  const random = () => {
    hash = (hash * 9301 + 49297) % 233280;
    return hash / 233280;
  };
  
  const template = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx';
  return template.replace(/[xy]/g, function(c) {
    const r = (random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
};

const RoomChat = ({ socket, roomId, userId, userName, joined }) => {
  const [messages, setMessages] = useState([]);
  const [messageInput, setMessageInput] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [chatHistory, setChatHistory] = useState([]);
  const [connectionStatus, setConnectionStatus] = useState('connecting');
  const [roomUsers, setRoomUsers] = useState(new Set());
  const messagesEndRef = useRef(null);

  // Generate consistent UUIDs based on the original IDs
  const roomUUID = generateDeterministicUUID(`room:${roomId}`);
  const userUUID = generateDeterministicUUID(`user:${userId}`);

  // Auto scroll to bottom when new messages arrive
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (!socket || !joined) {
      console.log('🗨️ Chat not ready - socket:', !!socket, 'joined:', joined);
      return;
    }

    console.log('🗨️ Setting up chat for room:', roomId, 'user:', userId);
    console.log('🔑 Using UUIDs - roomUUID:', roomUUID, 'userUUID:', userUUID);

    // Join room chat when the component mounts and user has joined the room
    const joinRoomChat = () => {
      if (isConnected) {
        console.log('🗨️ Already connected to chat, skipping join');
        return;
      }
      
      console.log('🗨️ Joining room chat for room:', roomId, 'with userId:', userId, 'userName:', userName);
      const joinData = {
        roomId, // Use original string ID for room operations (shared with video service)
        userId, // Use original string ID for user identification
        userName: userName || `User-${userId}`
      };
      console.log('📤 Emitting join-room-chat with data:', joinData);
      socket.emit('join-room-chat', joinData);
    };

    // Socket event listeners for chat
    console.log('🔧 Setting up socket event listeners...');
    
    socket.on('joined-room-chat', (data) => {
      console.log('✅ Successfully joined room chat:', data);
      console.log('✅ Chat history received:', data.chatHistory?.length || 0, 'messages');
      if (!isConnected) { // Only set if not already connected
        clearTimeout(fallbackTimer); // Cancel fallback timer
        setIsConnected(true);
        setConnectionStatus('connected');
        setChatHistory(data.chatHistory || []);
        console.log('✅ Chat service connected successfully!');
      }
    });

    socket.on('error', (error) => {
      console.error('❌ Socket error received:', error);
      if (error.event && error.event.includes('room-chat')) {
        console.error('❌ Room chat error:', error);
        
        // If room doesn't exist, retry after a delay
        if (error.message && error.message.includes('Room does not exist')) {
          console.log('🔄 Room not found, retrying in 2 seconds...');
          setTimeout(() => {
            console.log('🔄 Retrying join room chat...');
            joinRoomChat();
          }, 2000);
        } else {
          alert(`Chat Error: ${error.message}`);
        }
      }
    });

    // Fallback: if no chat service, simulate connection after 10 seconds
    const fallbackTimer = setTimeout(() => {
      if (!isConnected) {
        console.log('⚠️ Chat service not responding after 10 seconds, enabling P2P chat mode');
        setIsConnected(true);
        setConnectionStatus('p2p');
        // Add a welcome message
        setMessages(prev => [...prev, {
          id: `welcome-${Date.now()}`,
          content: `Welcome to room ${roomId}! Using P2P chat mode - messages will be shared with other participants.`,
          isSystem: true,
          timestamp: new Date().toISOString()
        }]);
        // Set up P2P messaging using the existing socket
        setupP2PMessaging();
      }
    }, 10000); // Increased to 10 seconds to give backend more time

    const setupP2PMessaging = () => {
      // Join a socket.io room for this room
      socket.emit('join-p2p-chat-room', { roomId, userId, userName: userName || `User-${userId}` });
      
      // Listen for P2P chat messages
      socket.on('p2p-room-message', (messageData) => {
        console.log('📨 P2P message received:', messageData);
        if (messageData.roomId === roomId && messageData.userId !== userId) {
          const newMessage = {
            id: `p2p-${Date.now()}-${Math.random()}`,
            content: messageData.content,
            userId: messageData.userId,
            userName: messageData.userName,
            createdAt: messageData.timestamp,
            isP2P: true
          };
          setMessages(prev => [...prev, newMessage]);
        }
      });

      // Listen for user joining
      socket.on('p2p-user-joined', (userData) => {
        if (userData.roomId === roomId && userData.userId !== userId) {
          setRoomUsers(prev => new Set([...prev, userData.userId]));
          const systemMessage = {
            id: `system-joined-${Date.now()}`,
            content: `${userData.userName || userData.userId} joined the room`,
            isSystem: true,
            timestamp: new Date().toISOString()
          };
          setMessages(prev => [...prev, systemMessage]);
        }
      });
    };

    socket.on('room-message', (message) => {
      console.log('📨 New room message received:', message);
      console.log('📨 Message details - id:', message.id, 'content:', message.content, 'userId:', message.userId, 'roomId:', message.roomId);
      const formattedMessage = {
        id: message.id,
        content: message.content,
        userId: message.userId,
        userName: message.userName,
        createdAt: message.createdAt,
        roomId: message.roomId
      };
      console.log('📨 Adding formatted message to state:', formattedMessage);
      setMessages(prev => {
        console.log('📨 Previous messages count:', prev.length);
        const newMessages = [...prev, formattedMessage];
        console.log('📨 New messages count:', newMessages.length);
        return newMessages;
      });
    });

    socket.on('room-user-joined', (data) => {
      console.log('👋 User joined room chat:', data);
      const systemMessage = {
        id: `system-joined-${data.userId}-${data.timestamp || Date.now()}`, // Use server timestamp for uniqueness
        content: `${data.userName || data.userId} joined the chat`,
        isSystem: true,
        timestamp: data.timestamp || new Date().toISOString()
      };
      setMessages(prev => {
        // Check if we already have this message to prevent duplicates
        const existingMessage = prev.find(msg => 
          msg.id === systemMessage.id || 
          (msg.isSystem && msg.content === systemMessage.content && 
           Math.abs(new Date(msg.timestamp).getTime() - new Date(systemMessage.timestamp).getTime()) < 1000)
        );
        if (existingMessage) {
          console.log('👋 Skipping duplicate user joined message');
          return prev;
        }
        return [...prev, systemMessage];
      });
    });

    socket.on('room-user-left', (data) => {
      console.log('👋 User left room chat:', data);
      const systemMessage = {
        id: `system-left-${data.userId}-${Date.now()}`, // Include userId and different prefix for uniqueness
        content: `${data.userName || data.userId} left the chat`,
        isSystem: true,
        timestamp: data.timestamp || new Date().toISOString()
      };
      setMessages(prev => [...prev, systemMessage]);
    });

    socket.on('message-sent', (data) => {
      if (data.type === 'room') {
        console.log('✅ Room message sent successfully:', data);
      }
    });

    socket.on('room-chat-history', (data) => {
      console.log('📜 Room chat history received:', data);
      setChatHistory(data.messages || []);
    });

    socket.on('error', (error) => {
      console.error('❌ Socket error received:', error);
      if (error.event && error.event.includes('room-chat')) {
        console.error('❌ Room chat error:', error);
        alert(`Chat Error: ${error.message}`);
      }
    });

    socket.on('connect_error', (error) => {
      console.error('❌ Socket connection error:', error);
    });

    socket.on('disconnect', (reason) => {
      console.warn('⚠️ Socket disconnected:', reason);
      setIsConnected(false);
    });

    // Test if socket is working
    socket.emit('ping', (response) => {
      console.log('🏓 Socket ping response:', response);
    });

    // Debug: Listen to all events to see what we're receiving
    const originalEmit = socket.emit;
    const originalOn = socket.on;
    
    console.log('🔍 Debugging socket events...');
    socket.onAny((eventName, ...args) => {
      console.log('📡 Socket event received:', eventName, args);
    });

    // Join the room chat with a small delay to ensure video room is created first
    const joinTimer = setTimeout(() => {
      if (!isConnected) { // Only join if not already connected
        joinRoomChat();
      }
    }, 1000); // 1 second delay to let video room setup complete

    // Cleanup
    return () => {
      clearTimeout(fallbackTimer);
      clearTimeout(joinTimer);
      if (socket && isConnected) {
        socket.emit('leave-room-chat', { roomId, userId }); // Use original IDs
        socket.off('joined-room-chat');
        socket.off('room-message');
        socket.off('room-user-joined');
        socket.off('room-user-left');
        socket.off('message-sent');
        socket.off('room-chat-history');
        socket.off('connect_error');
        socket.off('disconnect');
        socket.off('p2p-room-message');
        socket.off('p2p-user-joined');
        socket.off('error');
        socket.offAny(); // Remove the debug listener
      }
    };
  }, [socket, roomId, userId, userName, joined, roomUUID, userUUID]);

  // Auto scroll when messages change
  useEffect(() => {
    scrollToBottom();
  }, [messages, chatHistory]);

  const sendMessage = () => {
    if (!messageInput.trim() || !socket || !isConnected) return;

    const messageData = {
      roomId,
      userId,
      userName: userName || `User-${userId}`,
      content: messageInput.trim(),
      mediaType: 'text/plain',
      timestamp: new Date().toISOString()
    };

    console.log('📤 Sending message:', messageData);
    
    if (connectionStatus === 'basic') {
      // In basic mode, just add message locally
      const localMessage = {
        id: `local-${Date.now()}`,
        content: messageData.content,
        userId: messageData.userId,
        userName: messageData.userName,
        createdAt: messageData.timestamp,
        isLocal: true
      };
      setMessages(prev => [...prev, localMessage]);
    } else if (connectionStatus === 'p2p') {
      // In P2P mode, broadcast to other users in the room
      socket.emit('p2p-room-message', messageData);
      
      // Add our own message to the chat
      const ownMessage = {
        id: `own-${Date.now()}`,
        content: messageData.content,
        userId: messageData.userId,
        userName: messageData.userName,
        createdAt: messageData.timestamp,
        isOwn: true
      };
      setMessages(prev => [...prev, ownMessage]);
    } else {
      // Try to send via proper chat service
      const messagePayload = {
        // Don't include id - let backend generate it
        roomId, // Use original string ID (backend will convert to UUID internally)
        userId, // Use original string ID (backend will convert to UUID internally)
        userName: messageData.userName,
        content: messageData.content,
        mediaType: 'text/plain', // Match the DTO expectation
        createdAt: messageData.timestamp
      };
      console.log('📤 Sending message via chat service:', messagePayload);
      socket.emit('send-room-message', messagePayload);
      
      // Don't add optimistic update since backend is working correctly
    }
    
    setMessageInput('');
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const formatTimestamp = (timestamp) => {
    return new Date(timestamp).toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (!joined) {
    return (
      <div style={styles.chatContainer}>
        <div style={styles.chatHeader}>
          <h4>💬 Room Chat</h4>
          <span style={styles.status}>Join room to start chatting</span>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.chatContainer}>
      <div style={styles.chatHeader}>
        <h4>💬 Room Chat</h4>
        <span style={styles.status}>
          {connectionStatus === 'connected' && '🟢 Chat Service'}
          {connectionStatus === 'basic' && '🟡 Basic Mode'}
          {connectionStatus === 'p2p' && '🔵 P2P Mode'}
          {connectionStatus === 'connecting' && '🔴 Connecting...'}
        </span>
      </div>

      <div style={styles.messagesContainer}>
        {/* Display chat history */}
        {chatHistory.map((message) => (
          <div key={`history-${message.id}`} style={styles.messageWrapper}>
            <div style={{
              ...styles.message,
              ...(message.userId === userId ? styles.ownMessage : styles.otherMessage),
              opacity: 0.7
            }}>
              <div style={styles.messageHeader}>
                <span style={styles.userName}>
                  {message.userName || message.userId}
                </span>
                <span style={styles.timestamp}>
                  {formatTimestamp(message.createdAt)}
                </span>
              </div>
              <div style={styles.messageContent}>{message.content}</div>
            </div>
          </div>
        ))}

        {/* Display current session messages */}
        {messages.map((message) => (
          <div key={message.id} style={styles.messageWrapper}>
            {message.isSystem ? (
              <div style={styles.systemMessage}>
                <span style={styles.systemText}>{message.content}</span>
                <span style={styles.timestamp}>
                  {formatTimestamp(message.timestamp)}
                </span>
              </div>
            ) : (
              <div style={{
                ...styles.message,
                ...(message.userId === userId ? styles.ownMessage : styles.otherMessage),
                ...(message.isLocal ? { opacity: 0.8, borderLeft: '3px solid #ffc107' } : {}),
                ...(message.isP2P ? { borderLeft: '3px solid #17a2b8' } : {}),
                ...(message.isOwn ? styles.ownMessage : {})
              }}>
                <div style={styles.messageHeader}>
                  <span style={styles.userName}>
                    {message.userName || message.userId}
                    {message.isLocal && ' (local)'}
                    {message.isP2P && ' (p2p)'}
                    {message.isOwn && ' (you)'}
                  </span>
                  <span style={styles.timestamp}>
                    {formatTimestamp(message.createdAt)}
                  </span>
                </div>
                <div style={styles.messageContent}>{message.content}</div>
              </div>
            )}
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      <div style={styles.inputContainer}>
        <textarea
          value={messageInput}
          onChange={(e) => setMessageInput(e.target.value)}
          onKeyPress={handleKeyPress}
          placeholder={isConnected ? "Type a message..." : "Connecting to chat..."}
          disabled={!isConnected}
          style={styles.messageInput}
          rows={2}
        />
        <button 
          onClick={sendMessage} 
          disabled={!messageInput.trim() || !isConnected}
          style={{
            ...styles.sendButton,
            ...((!messageInput.trim() || !isConnected) ? styles.sendButtonDisabled : {})
          }}
        >
          Send
        </button>
      </div>
    </div>
  );
};

const styles = {
  chatContainer: {
    width: '350px',
    height: '500px',
    border: '1px solid #ddd',
    borderRadius: '8px',
    display: 'flex',
    flexDirection: 'column',
    backgroundColor: '#fff',
    boxShadow: '0 2px 10px rgba(0,0,0,0.1)'
  },
  chatHeader: {
    padding: '15px',
    borderBottom: '1px solid #eee',
    backgroundColor: '#f8f9fa',
    borderRadius: '8px 8px 0 0',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  status: {
    fontSize: '12px',
    fontWeight: 'normal'
  },
  messagesContainer: {
    flex: 1,
    padding: '10px',
    overflowY: 'auto',
    backgroundColor: '#fafafa'
  },
  messageWrapper: {
    marginBottom: '10px'
  },
  message: {
    maxWidth: '80%',
    padding: '8px 12px',
    borderRadius: '12px',
    wordWrap: 'break-word'
  },
  ownMessage: {
    backgroundColor: '#007bff',
    color: 'white',
    marginLeft: 'auto',
    borderBottomRightRadius: '4px'
  },
  otherMessage: {
    backgroundColor: '#e9ecef',
    color: '#333',
    marginRight: 'auto',
    borderBottomLeftRadius: '4px'
  },
  messageHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    marginBottom: '4px',
    fontSize: '11px',
    opacity: 0.8
  },
  userName: {
    fontWeight: 'bold'
  },
  timestamp: {
    fontSize: '10px',
    opacity: 0.7
  },
  messageContent: {
    fontSize: '14px',
    lineHeight: '1.4'
  },
  systemMessage: {
    textAlign: 'center',
    padding: '8px',
    backgroundColor: '#fff3cd',
    borderRadius: '12px',
    fontSize: '12px',
    color: '#856404',
    fontStyle: 'italic',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  systemText: {
    flex: 1
  },
  inputContainer: {
    padding: '15px',
    borderTop: '1px solid #eee',
    display: 'flex',
    gap: '10px',
    alignItems: 'flex-end',
    backgroundColor: '#fff'
  },
  messageInput: {
    flex: 1,
    border: '1px solid #ddd',
    borderRadius: '20px',
    padding: '8px 15px',
    fontSize: '14px',
    resize: 'none',
    outline: 'none',
    fontFamily: 'inherit'
  },
  sendButton: {
    padding: '8px 20px',
    backgroundColor: '#007bff',
    color: 'white',
    border: 'none',
    borderRadius: '20px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: 'bold',
    transition: 'background-color 0.2s'
  },
  sendButtonDisabled: {
    backgroundColor: '#6c757d',
    cursor: 'not-allowed'
  }
};

export default RoomChat;
