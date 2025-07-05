import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { KafkaService } from '../kafka/kafka.service';
import { 
  CreateChatMessageDto, 
  TempChatMessageDto, 
  PersistentChatMessageDto,
  MessageSentConfirmationDto 
} from './dto';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(private readonly kafkaService: KafkaService) {}

  async sendMessage(data: CreateChatMessageDto): Promise<MessageSentConfirmationDto> {
    // Generate unique ID for the message to prevent duplicates
    const messageId = uuidv4();
    const timestamp = data.createdAt || new Date().toISOString();
    
    const basePayload = {
      id: messageId,
      content: data.content,
      mediaUrl: data.mediaUrl,
      mediaType: data.mediaType,
      mimeType: data.mimeType,
      organizationId: data.organizationId,
      teamId: data.teamId,
      senderId: data.senderId,
      createdAt: timestamp,
    };

    if (data.isTemporary) {
      // Temporary messages require roomId
      if (!data.roomId) {
        throw new BadRequestException('Room ID is required for temporary messages');
      }
      
      const tempMessagePayload: TempChatMessageDto = {
        ...basePayload,
        roomId: data.roomId,
      };
      
      await this.kafkaService.produceTempChat(tempMessagePayload);
      this.logger.log(`Sent temporary chat message with ID: ${messageId}`);
    } else {
      // Persistent messages are team-wide
      const persistentMessagePayload: PersistentChatMessageDto = {
        ...basePayload,
        roomId: data.roomId, // Optional for persistent messages
      };
      
      await this.kafkaService.producePersistentChat(persistentMessagePayload);
      this.logger.log(`Sent persistent chat message with ID: ${messageId}`);
    }

    return { 
      messageId, 
      status: 'sent' as const,
      timestamp
    };
  }
}
