import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS_CONFIG } from './constants';
import { CHAT_RETENTION, CACHE_EXPIRATION, REDIS_KEYS, MEDIA_TYPES } from '../shared/constants';

export interface TeamChatMessage {
  id: string;
  teamId: string;
  userId: string;
  content: string;
  url?: string;
  mediaType: string;
  createdAt: string;
  userName?: string;
}

export interface RoomChatMessage {
  id: string;
  roomId: string;
  userId: string;
  content: string;
  url?: string;
  mediaType: string;
  createdAt: string;
  userName?: string;
}

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private redis: Redis;
  private pubClient: Redis;
  private subClient: Redis;
  private isConnected: boolean = false;

  // Using constants from configuration files
  private readonly TEAM_CHAT_RETENTION = CHAT_RETENTION.TEAM_MESSAGES;
  private readonly ROOM_CHAT_RETENTION = CHAT_RETENTION.ROOM_MESSAGES;
  private readonly CONNECTION_TIMEOUT = REDIS_CONFIG.CONNECTION_TIMEOUT;
  private readonly RETRY_DELAY_MS = REDIS_CONFIG.RETRY_DELAY;

  async onModuleInit() {
    try {
      await this.connectToRedis();
      this.isConnected = true;
      this.logger.log('Redis service initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize Redis service:', error);
      this.isConnected = false;
      // Don't throw - allow application to start without Redis
    }
  }

  async onModuleDestroy() {
    try {
      if (this.redis) await this.redis.disconnect();
      if (this.pubClient) await this.pubClient.disconnect();
      if (this.subClient) await this.subClient.disconnect();
      this.logger.log('Redis connections closed');
    } catch (error) {
      this.logger.error('Error closing Redis connections:', error);
    }
  }

  private async connectToRedis(): Promise<void> {
    const redisUrl = process.env.REDIS_URL;

    if (!redisUrl) {
      throw new Error('REDIS_URL is not defined in environment variables.');
    }

    // Main Redis client for general operations
    this.redis = new Redis(redisUrl, {
      connectTimeout: this.CONNECTION_TIMEOUT,
      lazyConnect: REDIS_CONFIG.LAZY_CONNECT,
      maxRetriesPerRequest: REDIS_CONFIG.MAX_RETRIES_PER_REQUEST,
    });

    // Separate clients for pub/sub to avoid blocking
    this.pubClient = new Redis(redisUrl, {
      connectTimeout: this.CONNECTION_TIMEOUT,
      lazyConnect: REDIS_CONFIG.LAZY_CONNECT,
    });

    this.subClient = new Redis(redisUrl, {
      connectTimeout: this.CONNECTION_TIMEOUT,
      lazyConnect: REDIS_CONFIG.LAZY_CONNECT,
    });

    // Connect all clients
    await Promise.all([
      this.redis.connect(),
      this.pubClient.connect(),
      this.subClient.connect(),
    ]);

    // Set up event handlers
    this.redis.on('connect', () => {
      this.logger.log('Redis main client connected');
    });

    this.redis.on('error', (err) => {
      this.logger.error('Redis main client error:', err);
      this.isConnected = false;
    });

    this.pubClient.on('error', (err) => {
      this.logger.error('Redis pub client error:', err);
    });

    this.subClient.on('error', (err) => {
      this.logger.error('Redis sub client error:', err);
    });

    this.logger.log('All Redis clients connected successfully');
  }

  get connected(): boolean {
    return this.isConnected && this.redis?.status === 'ready';
  }

  getClient(): Redis {
    if (!this.connected) {
      throw new Error('Redis client not available.');
    }
    return this.redis;
  }

  // ============================================
  // Team Chat Methods (Permanent Chat)
  // ============================================

  async addTeamChatMessage(message: TeamChatMessage): Promise<void> {
    if (!this.connected) {
      this.logger.warn('Redis not connected - unable to cache team message');
      return;
    }

    try {
      const key = REDIS_KEYS.TEAM_CHAT(message.teamId);
      const messageData = JSON.stringify(message);

      // Use pipeline for atomic operations
      const pipeline = this.redis.pipeline();
      
      // Add message to list (newest first)
      pipeline.lpush(key, messageData);
      
      // Trim to keep only the latest N messages
      pipeline.ltrim(key, 0, this.TEAM_CHAT_RETENTION - 1);
      
      // Set expiration using constant
      pipeline.expire(key, CACHE_EXPIRATION.TEAM_CHAT);

      await pipeline.exec();

      this.logger.debug(`Cached team message ${message.id} for team ${message.teamId}`);
    } catch (error) {
      this.logger.error('Failed to cache team message:', error);
    }
  }

  async getTeamChatHistory(teamId: string, limit: number = CHAT_RETENTION.TEAM_MESSAGES): Promise<TeamChatMessage[]> {
    if (!this.connected) {
      this.logger.warn('Redis not connected - returning empty team chat history');
      return [];
    }

    try {
      const key = REDIS_KEYS.TEAM_CHAT(teamId);
      const messages = await this.redis.lrange(key, 0, limit - 1);
      
      return messages.map(msg => JSON.parse(msg)).reverse(); // Reverse to get chronological order
    } catch (error) {
      this.logger.error('Failed to get team chat history:', error);
      return [];
    }
  }

  async publishTeamMessage(message: TeamChatMessage): Promise<void> {
    if (!this.connected) {
      this.logger.warn('Redis not connected - unable to publish team message');
      return;
    }

    try {
      const channel = REDIS_KEYS.TEAM_MESSAGES_CHANNEL(message.teamId);
      await this.pubClient.publish(channel, JSON.stringify(message));
      this.logger.debug(`Published team message to channel ${channel}`);
    } catch (error) {
      this.logger.error('Failed to publish team message:', error);
    }
  }

  // ============================================
  // Room Chat Methods (Temporary Chat)
  // ============================================

  async addRoomChatMessage(message: RoomChatMessage): Promise<void> {
    if (!this.connected) {
      this.logger.warn('Redis not connected - unable to cache room message');
      return;
    }

    try {
      const key = REDIS_KEYS.ROOM_CHAT(message.roomId);
      this.logger.log(`💾 Redis: Storing message ${message.id} with key: ${key}, roomId: ${message.roomId}`);
      const messageData = JSON.stringify(message);

      // Use pipeline for atomic operations
      const pipeline = this.redis.pipeline();
      
      // Add message to list (newest first)
      pipeline.lpush(key, messageData);
      
      // Trim to keep only the latest N messages
      pipeline.ltrim(key, 0, this.ROOM_CHAT_RETENTION - 1);
      
      // Set expiration using constant
      pipeline.expire(key, CACHE_EXPIRATION.ROOM_CHAT);

      await pipeline.exec();

      this.logger.debug(`💾 Redis: Cached room message ${message.id} for room ${message.roomId}`);
    } catch (error) {
      this.logger.error('Failed to cache room message:', error);
    }
  }

  async getRoomChatHistory(roomId: string, limit: number = CHAT_RETENTION.ROOM_MESSAGES): Promise<RoomChatMessage[]> {
    if (!this.connected) {
      this.logger.warn('Redis not connected - returning empty room chat history');
      return [];
    }

    try {
      const key = REDIS_KEYS.ROOM_CHAT(roomId);
      this.logger.log(`📜 Redis: Getting room chat history with key: ${key}, limit: ${limit}`);
      const messages = await this.redis.lrange(key, 0, limit - 1);
      this.logger.log(`📜 Redis: Found ${messages.length} raw messages for room ${roomId}`);
      
      const parsedMessages = messages.map(msg => JSON.parse(msg)).reverse(); // Reverse to get chronological order
      this.logger.log(`📜 Redis: Returning ${parsedMessages.length} parsed messages`);
      return parsedMessages;
    } catch (error) {
      this.logger.error('Failed to get room chat history:', error);
      return [];
    }
  }

  async publishRoomMessage(message: RoomChatMessage): Promise<void> {
    if (!this.connected) {
      this.logger.warn('Redis not connected - unable to publish room message');
      return;
    }

    try {
      const channel = REDIS_KEYS.ROOM_MESSAGES_CHANNEL(message.roomId);
      await this.pubClient.publish(channel, JSON.stringify(message));
      this.logger.debug(`Published room message to channel ${channel}`);
    } catch (error) {
      this.logger.error('Failed to publish room message:', error);
    }
  }

  async clearRoomChat(roomId: string): Promise<void> {
    if (!this.connected) {
      this.logger.warn('Redis not connected - unable to clear room chat');
      return;
    }

    try {
      const key = REDIS_KEYS.ROOM_CHAT(roomId);
      await this.redis.del(key);
      this.logger.log(`Cleared chat history for room ${roomId}`);
    } catch (error) {
      this.logger.error('Failed to clear room chat:', error);
    }
  }

  // ============================================
  // Subscription Methods for Cross-Server Communication
  // ============================================

  async subscribeToTeamMessages(teamId: string, callback: (message: TeamChatMessage) => void): Promise<void> {
    if (!this.connected) {
      this.logger.warn('Redis not connected - unable to subscribe to team messages');
      return;
    }

    try {
      const channel = REDIS_KEYS.TEAM_MESSAGES_CHANNEL(teamId);
      await this.subClient.subscribe(channel);
      
      this.subClient.on('message', (receivedChannel, data) => {
        if (receivedChannel === channel) {
          try {
            const message: TeamChatMessage = JSON.parse(data);
            callback(message);
          } catch (error) {
            this.logger.error('Failed to parse team message:', error);
          }
        }
      });

      this.logger.log(`Subscribed to team messages for team ${teamId}`);
    } catch (error) {
      this.logger.error('Failed to subscribe to team messages:', error);
    }
  }

  async subscribeToRoomMessages(roomId: string, callback: (message: RoomChatMessage) => void): Promise<void> {
    if (!this.connected) {
      this.logger.warn('Redis not connected - unable to subscribe to room messages');
      return;
    }

    try {
      const channel = REDIS_KEYS.ROOM_MESSAGES_CHANNEL(roomId);
      await this.subClient.subscribe(channel);
      
      this.subClient.on('message', (receivedChannel, data) => {
        if (receivedChannel === channel) {
          try {
            const message: RoomChatMessage = JSON.parse(data);
            callback(message);
          } catch (error) {
            this.logger.error('Failed to parse room message:', error);
          }
        }
      });

      this.logger.log(`Subscribed to room messages for room ${roomId}`);
    } catch (error) {
      this.logger.error('Failed to subscribe to room messages:', error);
    }
  }

  async unsubscribeFromTeam(teamId: string): Promise<void> {
    if (!this.connected) return;

    try {
      const channel = REDIS_KEYS.TEAM_MESSAGES_CHANNEL(teamId);
      await this.subClient.unsubscribe(channel);
      this.logger.log(`Unsubscribed from team ${teamId}`);
    } catch (error) {
      this.logger.error('Failed to unsubscribe from team:', error);
    }
  }

  async unsubscribeFromRoom(roomId: string): Promise<void> {
    if (!this.connected) return;

    try {
      const channel = REDIS_KEYS.ROOM_MESSAGES_CHANNEL(roomId);
      await this.subClient.unsubscribe(channel);
      this.logger.log(`Unsubscribed from room ${roomId}`);
    } catch (error) {
      this.logger.error('Failed to unsubscribe from room:', error);
    }
  }

  // ============================================
  // Legacy/Additional Methods (maintaining compatibility)
  // ============================================

  async setClientMetadata(clientId: string, data: { userId: string; roomId: string; teamId: string }) {
    if (!this.connected) return;

    try {
      await this.redis.hmset(REDIS_KEYS.CLIENT_METADATA(clientId), data as any);
    } catch (error) {
      this.logger.error('Failed to set client metadata:', error);
    }
  }

  async getClientMetadata(clientId: string): Promise<{ userId: string; roomId: string; teamId: string } | null> {
    if (!this.connected) return null;

    try {
      const data = await this.redis.hgetall(REDIS_KEYS.CLIENT_METADATA(clientId));
      return Object.keys(data).length > 0 ? data as any : null;
    } catch (error) {
      this.logger.error('Failed to get client metadata:', error);
      return null;
    }
  }

  async addClientToRoom(roomId: string, clientId: string) {
    if (!this.connected) return;

    try {
      await this.redis.sadd(REDIS_KEYS.ROOM_CLIENTS(roomId), clientId);
      await this.redis.set(REDIS_KEYS.ROOM_UPDATED(roomId), Date.now().toString());
    } catch (error) {
      this.logger.error('Failed to add client to room:', error);
    }
  }

  async removeClientFromRoom(clientId: string, roomId: string) {
    if (!this.connected) return;

    try {
      await this.redis.srem(REDIS_KEYS.ROOM_CLIENTS(roomId), clientId);
      await this.redis.del(REDIS_KEYS.CLIENT_METADATA(clientId));
      await this.redis.set(REDIS_KEYS.ROOM_UPDATED(roomId), Date.now().toString());
    } catch (error) {
      this.logger.error('Failed to remove client from room:', error);
    }
  }

  async getClientsInRoom(roomId: string): Promise<string[]> {
    if (!this.connected) return [];

    try {
      return await this.redis.smembers(REDIS_KEYS.ROOM_CLIENTS(roomId));
    } catch (error) {
      this.logger.error('Failed to get clients in room:', error);
      return [];
    }
  }

  async createRoom(roomId: string, teamId: string) {
    if (!this.connected) return;

    try {
      await this.redis.set(REDIS_KEYS.ROOM_TEAM(roomId), teamId);
      await this.redis.set(REDIS_KEYS.ROOM_UPDATED(roomId), Date.now().toString());
    } catch (error) {
      this.logger.error('Failed to create room:', error);
    }
  }

  async roomExists(roomId: string): Promise<boolean> {
    if (!this.connected) return false;

    try {
      return (await this.redis.exists(REDIS_KEYS.ROOM_TEAM(roomId))) === 1;
    } catch (error) {
      this.logger.error('Failed to check if room exists:', error);
      return false;
    }
  }

  async getRoomLastUpdated(roomId: string): Promise<number> {
    if (!this.connected) return 0;

    try {
      const timestamp = await this.redis.get(REDIS_KEYS.ROOM_UPDATED(roomId));
      return timestamp ? parseInt(timestamp) : 0;
    } catch (error) {
      this.logger.error('Failed to get room last updated:', error);
      return 0;
    }
  }

  async deleteRoom(roomId: string) {
    if (!this.connected) return;

    try {
      // Also clear the room chat when deleting room
      await this.clearRoomChat(roomId);
      
      await this.redis.del(REDIS_KEYS.ROOM_TEAM(roomId));
      await this.redis.del(REDIS_KEYS.ROOM_CLIENTS(roomId));
      await this.redis.del(REDIS_KEYS.ROOM_UPDATED(roomId));
      
      this.logger.log(`Deleted room ${roomId} and its chat history`);
    } catch (error) {
      this.logger.error('Failed to delete room:', error);
    }
  }

  // ============================================
  // Health and Monitoring
  // ============================================

  async getHealth(): Promise<{ status: string; connected: boolean; memory?: any }> {
    try {
      if (!this.connected) {
        return { status: 'unhealthy', connected: false };
      }

      // Test Redis connectivity
      await this.redis.ping();
      
      // Get memory info
      const memoryInfo = await this.redis.info('memory');
      
      return {
        status: 'healthy',
        connected: true,
        memory: memoryInfo,
      };
    } catch (error) {
      this.logger.error('Redis health check failed:', error);
      return { status: 'unhealthy', connected: false };
    }
  }
}