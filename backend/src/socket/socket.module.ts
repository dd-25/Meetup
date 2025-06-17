import { Module } from '@nestjs/common';
import { SocketGateway } from './socket.gateway';
import { MediasoupModule } from '../mediasoup/mediasoup.module';
import { RedisModule } from '../redis/redis.module';

@Module({
  imports: [RedisModule, MediasoupModule],
  providers: [SocketGateway],
})
export class SocketModule {}