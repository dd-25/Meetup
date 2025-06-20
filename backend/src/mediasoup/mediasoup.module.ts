import { Module } from '@nestjs/common';
import { MediasoupService } from './mediasoup.service';
import { MediasoupController } from './mediasoup.controller';
import { RedisModule } from 'src/redis/redis.module';

@Module({
  imports: [RedisModule],
  providers: [MediasoupService],
  controllers: [MediasoupController],
  exports: [MediasoupService],
})
export class MediasoupModule {}