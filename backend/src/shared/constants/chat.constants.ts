/**
 * Chat System Constants
 * Contains all hardcoded values used across the chat architecture
 */

// Message Retention Limits
export const CHAT_RETENTION = {
  TEAM_MESSAGES: 50,    // Keep last 50 messages for team chat
  ROOM_MESSAGES: 300,   // Keep last 300 messages for room chat
} as const;

// Default Limits for API Requests
export const CHAT_LIMITS = {
  TEAM_HISTORY_DEFAULT: 50,      // Default limit for team chat history
  ROOM_HISTORY_DEFAULT: 300,     // Default limit for room chat history
  TEAM_HISTORY_MAX: 100,         // Maximum limit for team chat history
  ROOM_HISTORY_MAX: 300,         // Maximum limit for room chat history
  DEAD_LETTER_DEFAULT: 50,       // Default limit for dead letter messages
} as const;

// Redis Key Patterns
export const REDIS_KEYS = {
  TEAM_CHAT: (teamId: string) => `team:${teamId}:chat`,
  ROOM_CHAT: (roomId: string) => `room:${roomId}:chat`,
  TEAM_MESSAGES_CHANNEL: (teamId: string) => `team:${teamId}:messages`,
  ROOM_MESSAGES_CHANNEL: (roomId: string) => `room:${roomId}:messages`,
  CLIENT_METADATA: (clientId: string) => `client:${clientId}`,
  ROOM_CLIENTS: (roomId: string) => `room:${roomId}:clients`,
  ROOM_TEAM: (roomId: string) => `room:${roomId}:team`,
  ROOM_UPDATED: (roomId: string) => `room:${roomId}:updatedAt`,
} as const;

// Socket.IO Room Names
export const SOCKET_ROOMS = {
  TEAM: (teamId: string) => `team-${teamId}`,
  ROOM: (roomId: string) => `room-${roomId}`,
} as const;

// Cache Expiration Times (in seconds)
export const CACHE_EXPIRATION = {
  TEAM_CHAT: 7 * 24 * 60 * 60,     // 7 days
  ROOM_CHAT: 24 * 60 * 60,         // 24 hours (room chats are temporary)
} as const;

// Default Media Types
export const MEDIA_TYPES = {
  TEXT: 'text/plain',
  IMAGE: 'image',
  VIDEO: 'video',
  AUDIO: 'audio',
  FILE: 'file',
} as const;
