import { Injectable, Logger } from '@nestjs/common';
import Redis from 'ioredis';
import { BatchChatMessageDto, BatchStatsDto } from '../chat/dto';

@Injectable()
export class RedisService {
  private readonly logger = new Logger(RedisService.name);
  private redis: Redis;
  private readonly CHAT_BATCH_KEY = 'chat:batch:pending';
  private readonly PROCESSED_IDS_KEY = 'chat:processed:ids'; // Track processed message IDs
  private readonly BATCH_SIZE = 50; // Process 50 messages at once
  private readonly BATCH_TIMEOUT = 5000; // Process every 5 seconds
  private readonly ID_EXPIRY = 3600; // Keep processed IDs for 1 hour
  private batchTimer: NodeJS.Timeout | null = null;

  onModuleInit() {
    const redisUrl = process.env.REDIS_URL;

    if (!redisUrl) {
      throw new Error('REDIS_URL is not defined in environment variables.');
    }

    this.redis = new Redis(redisUrl);

    this.redis.on('connect', () => {
      console.log('Redis connected successfully');
    });

    this.redis.on('error', (err) => {
      console.error('Redis connection error:', err);
    });
  }

  getClient(): Redis {
    if (!this.redis) {
      throw new Error('Redis client not initialized.');
    }
    return this.redis;
  }

  async setClientMetadata(clientId: string, data: { userId: string; roomId: string; teamId: string }) {
    await this.redis.hmset(`client:${clientId}`, data as any);
  }

  async getClientMetadata(clientId: string): Promise<{ userId: string; roomId: string; teamId: string }> {
    const data = await this.redis.hgetall(`client:${clientId}`);
    return data as any;
  }

  async addClientToRoom(roomId: string, clientId: string) {
    await this.redis.sadd(`room:${roomId}:clients`, clientId);
    await this.redis.set(`room:${roomId}:updatedAt`, Date.now().toString());
  }

  async removeClientFromRoom(clientId: string, roomId: string) {
    await this.redis.srem(`room:${roomId}:clients`, clientId);
    await this.redis.del(`client:${clientId}`);
    await this.redis.set(`room:${roomId}:updatedAt`, Date.now().toString());
  }

  async getClientsInRoom(roomId: string): Promise<string[]> {
    return await this.redis.smembers(`room:${roomId}:clients`);
  }

  async createRoom(roomId: string, teamId: string) {
    await this.redis.set(`room:${roomId}:team`, teamId);
    await this.redis.set(`room:${roomId}:updatedAt`, Date.now().toString());
  }

  async roomExists(roomId: string): Promise<boolean> {
    return (await this.redis.exists(`room:${roomId}:team`)) === 1;
  }

  async getRoomLastUpdated(roomId: string): Promise<number> {
    const timestamp = await this.redis.get(`room:${roomId}:updatedAt`);
    return timestamp ? parseInt(timestamp) : 0;
  }

  async deleteRoom(roomId: string) {
    await this.redis.del(`room:${roomId}:team`);
    await this.redis.del(`room:${roomId}:clients`);
    await this.redis.del(`room:${roomId}:updatedAt`);
  }

  /**
   * Add a persistent chat message to the batch queue for DB write
   */
  async addChatToBatch(chatMessage: BatchChatMessageDto): Promise<boolean> {
    try {
      // Check if message was already processed
      const isProcessed = await this.redis.sismember(this.PROCESSED_IDS_KEY, chatMessage.id);
      if (isProcessed) {
        this.logger.log(`Message ${chatMessage.id} already processed, skipping`);
        return false;
      }

      // Add message to Redis list for batch processing
      await this.redis.lpush(this.CHAT_BATCH_KEY, JSON.stringify(chatMessage));

      this.logger.log(`Added chat message ${chatMessage.id} to batch queue. Queue size: ${await this.getChatBatchSize()}`);

      // Start batch processing timer if not already running
      this.startBatchTimer();

      // Check if we should process immediately due to batch size
      const queueSize = await this.getChatBatchSize();
      if (queueSize >= this.BATCH_SIZE) {
        this.logger.log(`Batch size reached (${this.BATCH_SIZE}), processing immediately`);
        await this.processChatBatch();
      }
      
      return true;
    } catch (error) {
      this.logger.error('Error adding chat to batch:', error);
      throw error;
    }
  }

  /**
   * Get current batch queue size
   */
  async getChatBatchSize(): Promise<number> {
    return await this.redis.llen(this.CHAT_BATCH_KEY);
  }

  /**
   * Process batch of chat messages and write to database
   */
  async processChatBatch(): Promise<number> {
    try {
      // Clear the timer since we're processing now
      if (this.batchTimer) {
        clearTimeout(this.batchTimer);
        this.batchTimer = null;
      }

      // Get all messages from the batch queue
      const messages = await this.redis.lrange(this.CHAT_BATCH_KEY, 0, this.BATCH_SIZE - 1);

      if (messages.length === 0) {
        return 0;
      }

      // Remove processed messages from queue
      await this.redis.ltrim(this.CHAT_BATCH_KEY, messages.length, -1);

      // Parse messages
      const chatData = messages
        .map((msg) => {
          try {
            return JSON.parse(msg);
          } catch (error) {
            this.logger.error('Error parsing chat message:', error);
            return null;
          }
        })
        .filter(Boolean);

      if (chatData.length === 0) {
        return 0;
      }

      this.logger.log(`Processing batch of ${chatData.length} chat messages`);

      // TODO: Implement actual database write using PrismaService
      // For now, we'll emit an event that can be handled by a service that has Prisma access
      // You can inject PrismaService here and implement the actual database write

      // Example of what the database write would look like:
      // await this.prisma.chat.createMany({
      //   data: chatData.map(chat => ({
      //     content: chat.content,
      //     mediaUrl: chat.mediaUrl,
      //     mediaType: chat.mediaType,
      //     mimeType: chat.mimeType,
      //     organizationId: chat.organizationId,
      //     teamId: chat.teamId,
      //     userId: chat.userId,
      //     createdAt: new Date(chat.createdAt),
      //   }))
      // });

      // For now, just log the batch (replace with actual DB write)
      this.logger.log(`Would write ${chatData.length} messages to database:`, {
        count: chatData.length,
        firstMessage: chatData[0],
        lastMessage: chatData[chatData.length - 1],
      });

      // Restart timer if there are more messages in queue
      const remainingMessages = await this.getChatBatchSize();
      if (remainingMessages > 0) {
        this.startBatchTimer();
      }

      return chatData.length;
    } catch (error) {
      this.logger.error('Error processing chat batch:', error);
      throw error;
    }
  }

  /**
   * Start the batch processing timer
   */
  private startBatchTimer() {
    if (this.batchTimer) {
      return; // Timer already running
    }

    this.batchTimer = setTimeout(async () => {
      try {
        await this.processChatBatch();
      } catch (error) {
        this.logger.error('Error in batch timer:', error);
      }
    }, this.BATCH_TIMEOUT);
  }

  /**
   * Force process all pending chat messages (useful for shutdown)
   */
  async flushChatBatch(): Promise<number> {
    let totalProcessed = 0;
    let batchCount = 0;

    while (true) {
      const processed = await this.processChatBatch();
      if (processed === 0) {
        break;
      }
      totalProcessed += processed;
      batchCount++;

      // Safety check to prevent infinite loop
      if (batchCount > 100) {
        this.logger.warn('Stopped flushing after 100 batches');
        break;
      }
    }

    this.logger.log(`Flushed ${totalProcessed} chat messages in ${batchCount} batches`);
    return totalProcessed;
  }

  /**
   * Get messages from batch queue (for external processing)
   */
  async getBatchMessages(count: number = 50): Promise<string[]> {
    return await this.redis.lrange(this.CHAT_BATCH_KEY, 0, count - 1);
  }

  /**
   * Remove processed messages from batch queue
   */
  async removeBatchMessages(count: number): Promise<void> {
    await this.redis.ltrim(this.CHAT_BATCH_KEY, count, -1);
  }

  /**
   * Get batch queue statistics
   */
  async getBatchStats() {
    return {
      queueSize: await this.getChatBatchSize(),
      timerActive: !!this.batchTimer,
      batchSize: this.BATCH_SIZE,
      batchTimeout: this.BATCH_TIMEOUT,
    };
  }

  async onModuleDestroy() {
    try {
      // Clear batch timer
      if (this.batchTimer) {
        clearTimeout(this.batchTimer);
        this.batchTimer = null;
      }

      // Process any remaining chat messages before shutdown
      await this.flushChatBatch();

      // Close Redis connection
      if (this.redis) {
        await this.redis.disconnect();
        this.logger.log('Redis connection closed successfully');
      }
    } catch (error) {
      this.logger.error('Error during Redis service shutdown:', error);
    }
  }
}