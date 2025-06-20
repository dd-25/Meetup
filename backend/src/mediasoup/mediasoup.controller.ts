import {
  Controller,
  Get,
  Query,
  BadRequestException,
  Post,
  Body,
} from '@nestjs/common';
import { MediasoupService } from './mediasoup.service';

@Controller('mediasoup')
export class MediasoupController {
  constructor(private service: MediasoupService) {}

  // @Get('rtp-capabilities')
  // getCaps(@Query('roomId') roomId: string) {
  //   if (!roomId) throw new BadRequestException('Missing roomId');
  //   return { routerRtpCapabilities: this.service.getRtpCapabilities() };
  // }

  // @Get('create-transport')
  // async createTransport(@Query('roomId') roomId: string) {
  //   if (!roomId) throw new BadRequestException('Missing roomId');
  //   return this.service.createTransport(roomId);
  // }

  // @Post('connect-transport')
  // async connectTransport(@Body() body: any) {
  //   const { roomId, transportId, dtlsParameters } = body;
  //   if (!roomId || !transportId || !dtlsParameters)
  //     throw new BadRequestException('Missing required fields');
  //   return this.service.connectTransport(roomId, transportId, dtlsParameters);
  // }

  // @Post('produce')
  // async produce(@Body() body: any) {
  //   const { roomId, transportId, kind, rtpParameters } = body;
  //   if (!roomId || !transportId || !kind || !rtpParameters)
  //     throw new BadRequestException('Missing required fields');
  //   return this.service.produce(roomId, transportId, kind, rtpParameters);
  // }

  // @Post('consume')
  // async consume(@Body() body: any) {
  //   const { roomId, transportId, producerId, rtpCapabilities } = body;
  //   if (!roomId || !transportId || !producerId || !rtpCapabilities)
  //     throw new BadRequestException('Missing required fields');
  //   return this.service.consume(roomId, transportId, producerId, rtpCapabilities);
  // }

  // @Post('resume-consumer')
  // async resumeConsumer(@Body() body: any) {
  //   const { roomId, consumerId } = body;
  //   if (!roomId || !consumerId)
  //     throw new BadRequestException('Missing roomId or consumerId');
  //   await this.service.resumeConsumer(roomId, consumerId);
  //   return { success: true };
  // }

  // @Post('leave-room')
  // async leaveRoom(@Body() body: any) {
  //   const { roomId, transportIds } = body;
  //   if (!roomId || !Array.isArray(transportIds))
  //     throw new BadRequestException('Missing roomId or transportIds');
  //   await this.service.cleanupClient(roomId, transportIds);
  //   return { success: true };
  // }
}