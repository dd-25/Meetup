import { Module } from '@nestjs/common';
import { RedisService } from './redis.service';
import { ChatBatchService } from './chat-batch.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [RedisService, ChatBatchService],
  exports: [RedisService, ChatBatchService],
})
export class RedisModule {}
