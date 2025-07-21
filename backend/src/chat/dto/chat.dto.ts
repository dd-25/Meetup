import { IsString, IsUUID, IsOptional, IsDateString, IsInt, Min, Max, IsIn } from 'class-validator';
import { CHAT_LIMITS } from '../../shared/constants';

export class CreateChatMessageDto {
    @IsOptional()
    @IsUUID()
    id?: string;

    @IsUUID()
    teamId: string;

    @IsUUID()
    userId: string;

    @IsString()
    content: string;

    @IsOptional()
    @IsString()
    url?: string;

    @IsOptional()
    @IsString()
    mediaType?: string;

    @IsOptional()
    @IsDateString()
    createdAt?: string;

    @IsOptional()
    @IsString()
    userName?: string;
}

export class CreateRoomChatMessageDto {
    @IsOptional()
    @IsUUID()
    id?: string;

    @IsUUID()
    roomId: string;

    @IsUUID()
    userId: string;

    @IsString()
    content: string;

    @IsOptional()
    @IsString()
    url?: string;

    @IsOptional()
    @IsString()
    mediaType?: string;

    @IsOptional()
    @IsDateString()
    createdAt?: string;

    @IsOptional()
    @IsString()
    userName?: string;
}

export class ChatMessageDto {
    id: string;
    teamId: string;
    userId: string;
    content: string;
    url?: string;
    mediaType: string;
    createdAt: Date;
    retryCount?: number;
    userName?: string;
}

export class RoomChatMessageDto {
    id: string;
    roomId: string;
    userId: string;
    content: string;
    url?: string;
    mediaType: string;
    createdAt: Date;
    userName?: string;
}

export class BatchProcessingStatsDto {
    teamId: string;
    messageCount: number;
    pendingBatch: boolean;
    lastProcessedAt?: Date;
}

export class DeadLetterMessageDto {
    originalMessage: ChatMessageDto;
    error: string;
    failedAt: Date;
    retryCount: number;
}

export class KafkaHealthDto {
    status: 'healthy' | 'unhealthy';
    connected: boolean;
    batches: BatchProcessingStatsDto[];
    topicInfo?: any;
}

export class ChatHistoryRequestDto {
    @IsOptional()
    @IsInt()
    @Min(1)
    @Max(CHAT_LIMITS.TEAM_HISTORY_MAX)
    limit?: number;

    @IsOptional()
    @IsString()
    before?: string; // Message ID for pagination
}

export class RoomChatHistoryRequestDto {
    @IsOptional()
    @IsInt()
    @Min(1)
    @Max(CHAT_LIMITS.ROOM_HISTORY_MAX)
    limit?: number;

    @IsOptional()
    @IsString()
    before?: string; // Message ID for pagination
}
