import { Module } from '@nestjs/common';
import { MediasoupService } from './mediasoup.service';
import { RedisModule } from 'src/redis/redis.module';

@Module({
  imports: [RedisModule],
  providers: [MediasoupService],
  exports: [MediasoupService],
})
export class MediasoupModule {}