import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from './redis.service';
import { BatchProcessingResultDto } from '../chat/dto';

@Injectable()
export class ChatBatchService {
    private readonly logger = new Logger(ChatBatchService.name);
    private processingInterval: NodeJS.Timeout | null = null;
    private readonly PROCESSED_IDS_KEY = 'chat:processed:ids';
    private readonly ID_EXPIRY = 3600; // Keep processed IDs for 1 hour

    constructor(
        private readonly prismaService: PrismaService,
        private readonly redisService: RedisService,
    ) {
        // Start automatic processing every 10 seconds
        this.startAutoProcessing();
    }

    /**
     * Start automatic batch processing
     */
    private startAutoProcessing() {
        if (this.processingInterval) {
            return;
        }

        this.processingInterval = setInterval(async () => {
            try {
                await this.processPendingChatBatches();
            } catch (error) {
                this.logger.error('Error in scheduled chat batch processing:', error);
            }
        }, 10000); // Every 10 seconds
    }

    /**
     * Stop automatic batch processing
     */
    private stopAutoProcessing() {
        if (this.processingInterval) {
            clearInterval(this.processingInterval);
            this.processingInterval = null;
        }
    }

    /**
     * Process pending chat batches
     */
    async processPendingChatBatches() {
        try {
            const queueSize = await this.redisService.getChatBatchSize();
            if (queueSize === 0) {
                return; // No messages to process
            }

            this.logger.log(`Processing ${queueSize} pending chat messages`);
            const processed = await this.processChatBatch();
            this.logger.log(`Successfully processed ${processed} chat messages`);
        } catch (error) {
            this.logger.error('Error in scheduled chat batch processing:', error);
        }
    }

    /**
     * Process a batch of chat messages and write to database
     */
    async processChatBatch(): Promise<BatchProcessingResultDto> {
        try {
            // Get batch of messages from Redis
            const batchSize = 50;
            const messages = await this.redisService.getBatchMessages(batchSize);
            
            if (messages.length === 0) {
                return {
                    totalMessages: 0,
                    successfulInserts: 0,
                    duplicates: 0,
                    errors: 0
                };
            }

            // Remove processed messages from queue
            await this.redisService.removeBatchMessages(messages.length);

            // Parse and validate messages
            const parsedMessages = messages
                .map((msg, index) => {
                    try {
                        const parsed = JSON.parse(msg);
                        return { index, data: parsed, error: null };
                    } catch (error) {
                        this.logger.error(`Error parsing message at index ${index}:`, error);
                        return { index, data: null, error: error.message };
                    }
                })
                .filter(item => item.data !== null);

            const result: BatchProcessingResultDto = {
                totalMessages: messages.length,
                successfulInserts: 0,
                duplicates: 0,
                errors: messages.length - parsedMessages.length,
                errorDetails: []
            };

            if (parsedMessages.length === 0) {
                return result;
            }

            // Process messages in transaction with duplicate handling
            const processResult = await this.prismaService.$transaction(async (tx) => {
                let insertCount = 0;
                let duplicateCount = 0;
                const errors: string[] = [];

                for (const item of parsedMessages) {
                    const chat = item.data;
                    try {
                        // Check if message ID was already processed
                        const redisClient = this.redisService.getClient();
                        const wasProcessed = await redisClient.sismember(this.PROCESSED_IDS_KEY, chat.id);
                        
                        if (wasProcessed) {
                            duplicateCount++;
                            this.logger.log(`Skipping duplicate message ID: ${chat.id}`);
                            continue;
                        }

                        // Insert chat message with unique constraint handling
                        await tx.$executeRaw`
                            INSERT INTO "Chat" (id, content, "mediaUrl", "mediaType", "mimeType", "organizationId", "teamId", "userId", "createdAt", "updatedAt")
                            VALUES (${chat.id}, ${chat.content}, ${chat.mediaUrl}, ${chat.mediaType}, ${chat.mimeType}, ${chat.organizationId}, ${chat.teamId}, ${chat.senderId}, ${new Date(chat.createdAt)}, NOW())
                            ON CONFLICT (id) DO NOTHING
                        `;

                        // Mark message as processed
                        await redisClient.sadd(this.PROCESSED_IDS_KEY, chat.id);
                        await redisClient.expire(this.PROCESSED_IDS_KEY, this.ID_EXPIRY);

                        insertCount++;
                        this.logger.log(`Successfully inserted message: ${chat.id}`);
                        
                    } catch (error) {
                        this.logger.warn(`Failed to insert chat message ${chat.id}:`, error.message);
                        errors.push(`Message ${chat.id}: ${error.message}`);
                        
                        // If it's a unique constraint violation, count as duplicate
                        if (error.message.includes('unique') || error.message.includes('duplicate')) {
                            duplicateCount++;
                        }
                    }
                }

                return { insertCount, duplicateCount, errors };
            });

            result.successfulInserts = processResult.insertCount;
            result.duplicates += processResult.duplicateCount;
            result.errors += processResult.errors.length;
            result.errorDetails = processResult.errors;

            this.logger.log(`Batch processing completed: ${result.successfulInserts} inserted, ${result.duplicates} duplicates, ${result.errors} errors out of ${result.totalMessages} total`);
            return result;

        } catch (error) {
            this.logger.error('Error processing chat batch:', error);
            throw error;
        }
    }

    /**
     * Get batch processing statistics
     */
    async getStats() {
        const redisStats = await this.redisService.getBatchStats();
        // Use raw query to get count
        const totalChats = await this.prismaService.$queryRaw<[{ count: bigint }]>`SELECT COUNT(*) as count FROM "Chat"`;
        
        return {
            ...redisStats,
            totalChatsInDb: Number(totalChats[0]?.count || 0),
        };
    }

    /**
     * Manually trigger batch processing (useful for testing)
     */
    async triggerBatchProcessing(): Promise<BatchProcessingResultDto> {
        return await this.processChatBatch();
    }

    /**
     * Cleanup on service destruction
     */
    onModuleDestroy() {
        this.stopAutoProcessing();
    }
}
