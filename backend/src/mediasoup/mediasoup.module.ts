import { Module } from '@nestjs/common';
import { MediasoupService } from './mediasoup.service';
import { MediasoupController } from './mediasoup.controller';

@Module({
  providers: [MediasoupService],
  controllers: [MediasoupController],
  exports: [MediasoupService],
})
export class MediasoupModule {}