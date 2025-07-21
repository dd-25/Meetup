/**
 * Redis Service Constants
 * Contains configuration values for Redis connections and operations
 */

// Connection Configuration
export const REDIS_CONFIG = {
  CONNECTION_TIMEOUT: 10000,    // 10 seconds
  RETRY_DELAY: 2000,           // 2 seconds  
  MAX_RETRIES_PER_REQUEST: 3,  // Maximum retries per request
  LAZY_CONNECT: true,          // Enable lazy connection
} as const;

// Redis Operation Constants
export const REDIS_OPERATIONS = {
  LIST_START: 0,               // Start index for list operations
  PING_TIMEOUT: 5000,         // Ping timeout for health checks
} as const;
