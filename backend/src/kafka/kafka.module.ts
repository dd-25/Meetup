import { Module } from '@nestjs/common';
import { KafkaService } from './kafka.service';
import { KafkaController } from './kafka.controller';
import { RedisModule } from '../redis/redis.module';

@Module({
    imports: [RedisModule],
    controllers: [KafkaController],
    providers: [KafkaService],
    exports: [KafkaService],
})
export class KafkaModule { }