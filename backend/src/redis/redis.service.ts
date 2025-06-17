import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleInit {
  private readonly logger = new Logger(RedisService.name);
  private redis: Redis;

  async onModuleInit() {
    const url = process.env.REDIS_URL ?? 'redis://localhost:6379';
    this.redis = new Redis(url);
    this.logger.log(`Redis connected: ${url}`);
  }

  async setJson(key: string, val: any) {
    await this.redis.set(key, JSON.stringify(val));
  }

  async getJson<T>(key: string): Promise<T | null> {
    const data = await this.redis.get(key);
    return data ? JSON.parse(data) : null;
  }

  async del(key: string) {
    await this.redis.del(key);
  }

  async sadd(key: string, member: string) {
    await this.redis.sadd(key, member);
  }

  async srem(key: string, member: string) {
    await this.redis.srem(key, member);
  }

  async smembers(key: string): Promise<string[]> {
    return await this.redis.smembers(key);
  }
}