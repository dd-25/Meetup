import { Injectable } from '@nestjs/common';
import Redis from 'ioredis';

@Injectable()
export class RedisService {
  private redis: Redis;

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
}