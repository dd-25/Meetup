/**
 * Chat Gateway Constants
 * Contains configuration values for Socket.IO gateway and WebSocket operations
 */

// WebSocket Gateway Configuration
export const GATEWAY_CONFIG = {
  NAMESPACE: '/', // Changed from '/chat' to default namespace to share with video gateway
  CORS_ORIGIN: '*',
  CORS_CREDENTIALS: true,
  TRANSPORTS: ['websocket', 'polling'] as const,
} as const;

// Connection Management
export const CONNECTION_CONFIG = {
  TIMEOUT: 5000,               // 5 seconds timeout for operations
  RECONNECT_ATTEMPTS: 3,       // Maximum reconnection attempts
  PING_INTERVAL: 25000,        // 25 seconds ping interval
  PING_TIMEOUT: 5000,         // 5 seconds ping timeout
} as const;

// Event Names
export const CHAT_EVENTS = {
  // Connection Events
  CONNECTED: 'connected',
  CONNECTION_ERROR: 'connection-error',
  
  // Team Chat Events
  JOIN_TEAM_CHAT: 'join-team-chat',
  LEAVE_TEAM_CHAT: 'leave-team-chat',
  SEND_TEAM_MESSAGE: 'send-team-message',
  TEAM_MESSAGE: 'team-message',
  JOINED_TEAM_CHAT: 'joined-team-chat',
  LEFT_TEAM_CHAT: 'left-team-chat',
  TEAM_USER_JOINED: 'team-user-joined',
  TEAM_USER_LEFT: 'team-user-left',
  TEAM_USER_STATUS: 'team-user-status',
  GET_TEAM_CHAT_HISTORY: 'get-team-chat-history',
  TEAM_CHAT_HISTORY: 'team-chat-history',
  
  // Room Chat Events
  JOIN_ROOM_CHAT: 'join-room-chat',
  LEAVE_ROOM_CHAT: 'leave-room-chat',
  SEND_ROOM_MESSAGE: 'send-room-message',
  ROOM_MESSAGE: 'room-message',
  JOINED_ROOM_CHAT: 'joined-room-chat',
  LEFT_ROOM_CHAT: 'left-room-chat',
  ROOM_USER_JOINED: 'room-user-joined',
  ROOM_USER_LEFT: 'room-user-left',
  ROOM_USER_STATUS: 'room-user-status',
  GET_ROOM_CHAT_HISTORY: 'get-room-chat-history',
  ROOM_CHAT_HISTORY: 'room-chat-history',
  
  // Status and Utility Events
  GET_CHAT_STATUS: 'get-chat-status',
  CHAT_STATUS: 'chat-status',
  MESSAGE_SENT: 'message-sent',
  ERROR: 'error',
  
  // Notification Events
  TEAM_NOTIFICATION: 'team-notification',
  ROOM_NOTIFICATION: 'room-notification',
  BATCH_PROCESSED: 'batch-processed',
} as const;

// Message Status Types
export const MESSAGE_STATUS = {
  PERSISTED: 'persisted',
  CACHED_ONLY: 'cached-only',
  DELIVERED: 'delivered',
} as const;

// User Status Types
export const USER_STATUS = {
  ONLINE: 'online' as const,
  OFFLINE: 'offline' as const,
} as const;
