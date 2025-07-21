/**
 * Kafka Service Constants
 * Contains configuration values for Kafka topics, batching, and timeouts
 */

// Topic Names
export const KAFKA_TOPICS = {
  CHAT_MESSAGES: 'chat-messages',
  DEAD_LETTER_QUEUE: 'chat-messages-dlq',
} as const;

// Consumer Configuration
export const KAFKA_CONSUMER = {
  GROUP_ID: 'chat-processor-group',
  SESSION_TIMEOUT: 30000,      // 30 seconds
  HEARTBEAT_INTERVAL: 3000,    // 3 seconds
} as const;

// Producer Configuration
export const KAFKA_PRODUCER = {
  MAX_IN_FLIGHT_REQUESTS: 1,
  IDEMPOTENT: true,
  TRANSACTION_TIMEOUT: 30000,   // 30 seconds
} as const;

// Connection Configuration
export const KAFKA_CONNECTION = {
  INITIAL_RETRY_TIME: 100,     // 100ms
  MAX_RETRIES: 5,              // Maximum connection retries
} as const;

// Batch Processing
export const KAFKA_BATCH = {
  SIZE: 100,                   // Batch size for processing messages
  MAX_RETRIES: 3,              // Maximum retries for batch processing
  RETRY_DELAY_BASE: 1000,      // Base delay for exponential backoff (1 second)
  MAX_RETRY_DELAY: 30000,      // Maximum retry delay (30 seconds)
} as const;

// Topic Configuration
export const KAFKA_TOPIC_CONFIG = {
  CHAT_PARTITIONS: 10,         // Number of partitions for chat messages topic
  DLQ_PARTITIONS: 3,           // Number of partitions for dead letter queue
  REPLICATION_FACTOR: 1,       // Replication factor for topics
  
  // Chat Messages Topic Settings
  CHAT_RETENTION_MS: '86400000',    // 24 hours (in milliseconds)
  CHAT_MAX_MESSAGE_BYTES: '1048576', // 1MB
  
  // Dead Letter Queue Settings  
  DLQ_RETENTION_MS: '604800000',     // 7 days (in milliseconds)
  DLQ_CLEANUP_POLICY: 'compact',     // Keep failed messages longer
  CHAT_CLEANUP_POLICY: 'delete',     // Regular cleanup for chat messages
} as const;

// Default Environment Values
export const KAFKA_DEFAULTS = {
  CLIENT_ID: 'meetup-chat-service',
  BROKER: 'localhost:9092',
  DEAD_LETTER_LIMIT: 50,
} as const;
