import { IsString, IsOptional, IsBoolean, IsUUID, IsDateString, IsNumber } from 'class-validator';

// Base chat message interface for common properties
export class BaseChatMessageDto {
    @IsOptional()
    @IsString()
    content?: string;

    @IsOptional()
    @IsString()
    mediaUrl?: string;

    @IsOptional()
    @IsString()
    mediaType?: string;

    @IsOptional()
    @IsString()
    mimeType?: string;

    @IsUUID()
    organizationId: string;

    @IsUUID()
    teamId: string;

    @IsUUID()
    senderId: string;

    @IsOptional()
    @IsDateString()
    createdAt?: string;
}

// DTO for creating new chat messages (from frontend)
export class CreateChatMessageDto extends BaseChatMessageDto {
    @IsOptional()
    @IsUUID()
    roomId?: string; // Required for temporary chats

    @IsBoolean()
    isTemporary: boolean;
}

// DTO for chat messages with unique ID (used internally)
export class ChatMessageWithIdDto extends BaseChatMessageDto {
    @IsString()
    id: string; // Unique message ID for deduplication

    @IsOptional()
    @IsUUID()
    roomId?: string;
}

// DTO for batch processing to database
export class BatchChatMessageDto extends ChatMessageWithIdDto {
    declare createdAt: string; // Required for batch processing (override optional)
}

// DTO for API responses
export class ChatMessageResponseDto extends ChatMessageWithIdDto {
    @IsBoolean()
    isTemporary: boolean;

    declare createdAt: string; // Required for responses (override optional)

    @IsOptional()
    @IsDateString()
    updatedAt?: string;
}

// DTO for temporary chat messages (room-scoped)
export class TempChatMessageDto extends ChatMessageWithIdDto {
    @IsUUID()
    declare roomId: string; // Required for temp chats
}

// DTO for persistent chat messages (team-scoped)
export class PersistentChatMessageDto extends ChatMessageWithIdDto {
    // No roomId for persistent chats as they are team-wide
}

// DTO for Kafka message processing
export class KafkaMessageDto extends ChatMessageWithIdDto {
    @IsOptional()
    @IsString()
    topic?: string;

    @IsOptional()
    partition?: number;

    @IsOptional()
    offset?: string;
}

// DTO for batch processing results
export class BatchProcessingResultDto {
    @IsNumber()
    totalMessages: number;

    @IsNumber()
    successfulInserts: number;

    @IsNumber()
    duplicates: number;

    @IsNumber()
    errors: number;

    @IsOptional()
    errorDetails?: string[];
}

// DTO for batch statistics
export class BatchStatsDto {
    @IsNumber()
    queueSize: number;

    @IsBoolean()
    timerActive: boolean;

    @IsNumber()
    batchSize: number;

    @IsNumber()
    batchTimeout: number;

    @IsOptional()
    @IsNumber()
    totalChatsInDb?: number;
}

// DTO for chat room management
export class JoinChatRoomDto {
    @IsUUID()
    roomId: string;

    @IsOptional()
    @IsUUID()
    teamId?: string;
}

// DTO for message sent confirmation
export class MessageSentConfirmationDto {
    @IsString()
    messageId: string;

    @IsString()
    status: 'sent' | 'failed' | 'pending';

    @IsDateString()
    timestamp: string;

    @IsOptional()
    @IsString()
    error?: string;
}
