import { Module } from '@nestjs/common';
import { ChatGateway } from './chat.gateway';
import { KafkaModule } from '../kafka/kafka.module';
import { RedisModule } from '../redis/redis.module';

@Module({
    imports: [KafkaModule, RedisModule],
    providers: [ChatGateway],
    exports: [ChatGateway],
})
export class ChatModule { }
