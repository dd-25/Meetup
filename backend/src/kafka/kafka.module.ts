import { Module } from '@nestjs/common';
import { KafkaService } from './kafka.service';
import { RedisModule } from '../redis/redis.module';

@Module({
    imports: [RedisModule],
    providers: [KafkaService],
    exports: [KafkaService],
})
export class KafkaModule { }