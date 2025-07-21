import {
    Controller,
    Get,
    Post,
    Body,
    Param,
    Query,
    UseGuards,
    HttpException,
    HttpStatus,
    Logger
} from '@nestjs/common';
import { KafkaService } from './kafka.service';
import { CreateChatMessageDto, KafkaHealthDto } from '../chat/dto';
import { CHAT_LIMITS, MEDIA_TYPES } from '../shared/constants';
import { v4 as uuidv4 } from 'uuid';

@Controller('kafka')
export class KafkaController {
    private readonly logger = new Logger(KafkaController.name);

    constructor(private readonly kafkaService: KafkaService) { }

    @Get('health')
    async getHealth(): Promise<KafkaHealthDto> {
        try {
            return await this.kafkaService.getHealth();
        } catch (error) {
            this.logger.error('Failed to get Kafka health:', error);
            throw new HttpException(
                'Failed to get Kafka health status',
                HttpStatus.SERVICE_UNAVAILABLE
            );
        }
    }

    @Get('topic-info')
    async getTopicInfo() {
        try {
            return await this.kafkaService.getTopicInfo();
        } catch (error) {
            this.logger.error('Failed to get topic info:', error);
            throw new HttpException(
                'Failed to get topic information',
                HttpStatus.SERVICE_UNAVAILABLE
            );
        }
    }

    @Get('dead-letter-messages')
    async getDeadLetterMessages(@Query('limit') limit?: string): Promise<any[]> {
        try {
            const limitNum = limit ? parseInt(limit, 10) : CHAT_LIMITS.DEAD_LETTER_DEFAULT;
            return await this.kafkaService.getDeadLetterMessages(limitNum);
        } catch (error) {
            this.logger.error('Failed to get dead letter messages:', error);
            throw new HttpException(
                'Failed to get dead letter messages',
                HttpStatus.INTERNAL_SERVER_ERROR
            );
        }
    }

    @Post('publish-message')
    async publishMessage(@Body() messageDto: CreateChatMessageDto) {
        try {
            if (!this.kafkaService.connected) {
                throw new HttpException(
                    'Kafka service is not connected',
                    HttpStatus.SERVICE_UNAVAILABLE
                );
            }

            // Generate ID if not provided
            const messageId = messageDto.id || uuidv4();

            const chatMessage = {
                id: messageId,
                teamId: messageDto.teamId,
                userId: messageDto.userId,
                content: messageDto.content,
                url: messageDto.url,
                mediaType: messageDto.mediaType || MEDIA_TYPES.TEXT,
                createdAt: messageDto.createdAt ? new Date(messageDto.createdAt) : new Date(),
            };

            const result = await this.kafkaService.publishChatMessage(chatMessage);

            if (!result) {
                throw new HttpException(
                    'Failed to publish message to Kafka',
                    HttpStatus.INTERNAL_SERVER_ERROR
                );
            }

            return {
                success: true,
                messageId: messageId,
                metadata: result,
            };
        } catch (error) {
            this.logger.error('Failed to publish message:', error);
            if (error instanceof HttpException) {
                throw error;
            }
            throw new HttpException(
                'Failed to publish message',
                HttpStatus.INTERNAL_SERVER_ERROR
            );
        }
    }

    @Post('force-process-batches')
    async forceProcessBatches() {
        try {
            await this.kafkaService.forceProcessPendingBatches();
            return {
                success: true,
                message: 'Pending batches processed successfully',
            };
        } catch (error) {
            this.logger.error('Failed to force process batches:', error);
            throw new HttpException(
                'Failed to process pending batches',
                HttpStatus.INTERNAL_SERVER_ERROR
            );
        }
    }

    @Get('batches/stats')
    async getBatchStats() {
        try {
            const health = await this.kafkaService.getHealth();
            return {
                totalBatches: health.batches.length,
                batches: health.batches,
                connected: health.connected,
            };
        } catch (error) {
            this.logger.error('Failed to get batch stats:', error);
            throw new HttpException(
                'Failed to get batch statistics',
                HttpStatus.INTERNAL_SERVER_ERROR
            );
        }
    }
}
