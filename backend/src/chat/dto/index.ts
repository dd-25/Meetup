// Export all chat-related DTOs from a single location
export * from './chat.dto';

// Re-export commonly used DTOs with descriptive names
export { CreateChatMessageDto as ChatInput } from './chat.dto';
export { ChatMessageResponseDto as ChatOutput } from './chat.dto';
export { KafkaMessageDto as InternalChatMessage } from './chat.dto';
export { BatchProcessingResultDto as BatchResult } from './chat.dto';
export { MessageSentConfirmationDto as SendConfirmation } from './chat.dto';
