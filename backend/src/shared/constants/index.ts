// Application-wide constants

export const ERROR_MESSAGES = {
  // Generic
  INTERNAL_SERVER_ERROR: 'An internal server error occurred',
  VALIDATION_FAILED: 'Validation failed',
  UNAUTHORIZED: 'Unauthorized access',
  FORBIDDEN: 'Access forbidden',
  NOT_FOUND: 'Resource not found',

  // User-related
  USER_NOT_FOUND: 'User not found',
  USER_ALREADY_EXISTS: 'User already exists',
  INVALID_CREDENTIALS: 'Invalid credentials',
  USER_UPDATE_FAILED: 'Failed to update user',

  // Organization-related
  ORGANIZATION_NOT_FOUND: 'Organization not found',
  ORGANIZATION_UPDATE_FAILED: 'Failed to update organization',
  ORGANIZATION_DELETE_FAILED: 'Failed to delete organization',
  INSUFFICIENT_ORG_PERMISSIONS: 'Insufficient organization permissions',

  // Team-related
  TEAM_NOT_FOUND: 'Team not found',
  TEAM_UPDATE_FAILED: 'Failed to update team',
  TEAM_DELETE_FAILED: 'Failed to delete team',
  INSUFFICIENT_TEAM_PERMISSIONS: 'Insufficient team permissions',

  // Room-related
  ROOM_NOT_FOUND: 'Room not found',
  ROOM_UPDATE_FAILED: 'Failed to update room',
  ROOM_DELETE_FAILED: 'Failed to delete room',

  // MediaSoup-related
  TRANSPORT_NOT_FOUND: 'Transport not found',
  ROOM_CREATION_FAILED: 'Failed to create room',
  PRODUCER_CREATION_FAILED: 'Failed to create producer',
  CONSUMER_CREATION_FAILED: 'Failed to create consumer',

  // Chat-related
  CHAT_SEND_FAILED: 'Failed to send chat message',
  CHAT_BATCH_PROCESSING_FAILED: 'Failed to process chat batch',
} as const;

export const SUCCESS_MESSAGES = {
  // Generic
  OPERATION_SUCCESSFUL: 'Operation completed successfully',
  
  // User-related
  USER_CREATED: 'User created successfully',
  USER_UPDATED: 'User updated successfully',
  USER_DELETED: 'User deleted successfully',
  
  // Organization-related
  ORGANIZATION_CREATED: 'Organization created successfully',
  ORGANIZATION_UPDATED: 'Organization updated successfully',
  ORGANIZATION_DELETED: 'Organization deleted successfully',
  
  // Team-related
  TEAM_CREATED: 'Team created successfully',
  TEAM_UPDATED: 'Team updated successfully',
  TEAM_DELETED: 'Team deleted successfully',
  
  // Room-related
  ROOM_CREATED: 'Room created successfully',
  ROOM_UPDATED: 'Room updated successfully',
  ROOM_DELETED: 'Room deleted successfully',
  
  // Chat-related
  MESSAGE_SENT: 'Message sent successfully',
  BATCH_PROCESSED: 'Batch processed successfully',
} as const;

export const HTTP_STATUS_CODES = {
  OK: 200,
  CREATED: 201,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  INTERNAL_SERVER_ERROR: 500,
} as const;

export const VALIDATION_RULES = {
  // Password requirements
  MIN_PASSWORD_LENGTH: 6,
  MAX_PASSWORD_LENGTH: 128,
  
  // Name requirements
  MIN_NAME_LENGTH: 1,
  MAX_NAME_LENGTH: 100,
  
  // Content requirements
  MAX_CHAT_MESSAGE_LENGTH: 2000,
  
  // File upload limits
  MAX_FILE_SIZE: 10 * 1024 * 1024, // 10MB
  ALLOWED_IMAGE_TYPES: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
  ALLOWED_VIDEO_TYPES: ['video/mp4', 'video/webm', 'video/ogg'],
  ALLOWED_AUDIO_TYPES: ['audio/mp3', 'audio/wav', 'audio/ogg'],
} as const;

export const RATE_LIMITS = {
  // API rate limits
  DEFAULT_REQUESTS_PER_MINUTE: 60,
  AUTH_REQUESTS_PER_MINUTE: 10,
  CHAT_MESSAGES_PER_MINUTE: 30,
  
  // Batch processing limits
  MAX_BATCH_SIZE: 100,
  BATCH_PROCESSING_INTERVAL: 10000, // 10 seconds
} as const;

export const CACHE_KEYS = {
  USER_PREFIX: 'user:',
  ORGANIZATION_PREFIX: 'org:',
  TEAM_PREFIX: 'team:',
  ROOM_PREFIX: 'room:',
  CLIENT_METADATA_PREFIX: 'client:',
  CHAT_BATCH_QUEUE: 'chat:batch:queue',
  PROCESSED_MESSAGES: 'chat:processed:ids',
} as const;

export const REDIS_EXPIRY = {
  SHORT: 300, // 5 minutes
  MEDIUM: 1800, // 30 minutes
  LONG: 3600, // 1 hour
  VERY_LONG: 86400, // 24 hours
} as const;
