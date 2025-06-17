import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { createWorker, types } from 'mediasoup';
import Redis from 'ioredis';

const ROOM_EXPIRY = 90 * 1000; // 90 seconds
const CHECK_INTERVAL = 30 * 1000; // 30 seconds

interface RoomState {
  router: types.Router;
  transports: Map<string, types.WebRtcTransport>;
  producers: Map<string, types.Producer>;
  consumers: Map<string, types.Consumer>;
}

@Injectable()
export class MediasoupService implements OnModuleInit {
  private worker: types.Worker;
  private readonly rooms = new Map<string, RoomState>();
  private readonly redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379');
  private readonly logger = new Logger(MediasoupService.name);

  private readonly mediaCodecs: types.RtpCodecCapability[] = [
    {
      kind: 'audio',
      mimeType: 'audio/opus',
      clockRate: 48000,
      channels: 2,
    },
    {
      kind: 'video',
      mimeType: 'video/VP8',
      clockRate: 90000,
    },
  ];

  private globalRouterRtpCapabilities: types.RtpCapabilities;

  async onModuleInit() {
    this.worker = await createWorker();
    const router = await this.worker.createRouter({ mediaCodecs: this.mediaCodecs });
    this.globalRouterRtpCapabilities = router.rtpCapabilities;

    this.logger.log('Mediasoup worker and router initialized.');
    setInterval(() => this.cleanupInactiveRooms(), CHECK_INTERVAL);
  }

  getRtpCapabilities(): types.RtpCapabilities {
    return this.globalRouterRtpCapabilities;
  }

  hasRoom(roomId: string): boolean {
    return this.rooms.has(roomId);
  }

  async createRoom(roomId: string) {
    if (this.rooms.has(roomId)) return;
    const router = await this.worker.createRouter({ mediaCodecs: this.mediaCodecs });

    const roomState: RoomState = {
      router,
      transports: new Map(),
      producers: new Map(),
      consumers: new Map(),
    };

    this.rooms.set(roomId, roomState);
    await this.redis.set(`room:${roomId}:lastActivity`, Date.now().toString());
    this.logger.log(`Room created: ${roomId}`);
  }

  private async ensureRoom(roomId: string): Promise<RoomState> {
    if (!this.rooms.has(roomId)) {
      await this.createRoom(roomId);
    }
    return this.rooms.get(roomId)!;
  }

  private async updateActivity(roomId: string) {
    await this.redis.set(`room:${roomId}:lastActivity`, Date.now().toString());
  }

  async createTransport(roomId: string) {
    const room = await this.ensureRoom(roomId);
    const transport = await room.router.createWebRtcTransport({
      listenIps: [{ ip: '0.0.0.0', announcedIp: process.env.PUBLIC_IP || '127.0.0.1' }],
      enableUdp: true,
      enableTcp: true,
      preferUdp: true,
    });

    room.transports.set(transport.id, transport);
    await this.updateActivity(roomId);

    return {
      id: transport.id,
      iceParameters: transport.iceParameters,
      iceCandidates: transport.iceCandidates,
      dtlsParameters: transport.dtlsParameters,
    };
  }

  async connectTransport(roomId: string, transportId: string, dtlsParameters: any) {
    const room = this.rooms.get(roomId);
    if (!room) throw new Error('Room not found');
    const transport = room.transports.get(transportId);
    if (!transport) throw new Error('Transport not found');

    await transport.connect({ dtlsParameters });
    await this.updateActivity(roomId);
  }

  async produce(roomId: string, transportId: string, kind: string, rtpParameters: any): Promise<string> {
    const room = this.rooms.get(roomId);
    if (!room) throw new Error('Room not found');
    const transport = room.transports.get(transportId);
    if (!transport) throw new Error('Transport not found');

    const producer = await transport.produce({
      kind: kind as 'audio' | 'video',
      rtpParameters,
    });

    room.producers.set(producer.id, producer);
    await this.updateActivity(roomId);

    return producer.id;
  }

  async consume(roomId: string, transportId: string, producerId: string, rtpCapabilities: types.RtpCapabilities) {
    const room = this.rooms.get(roomId);
    if (!room) throw new Error('Room not found');
    const transport = room.transports.get(transportId);
    if (!transport) throw new Error('Transport not found');

    const canConsume = room.router.canConsume({ producerId, rtpCapabilities });
    if (!canConsume) throw new Error('Cannot consume this producer with the given RTP capabilities');

    const consumer = await transport.consume({
      producerId,
      rtpCapabilities,
      paused: false,
    });

    await consumer.resume();
    room.consumers.set(consumer.id, consumer);
    await this.updateActivity(roomId);

    return {
      id: consumer.id,
      kind: consumer.kind,
      rtpParameters: consumer.rtpParameters,
      producerId: consumer.producerId,
      producerPaused: consumer.producerPaused,
    };
  }

  async cleanupClient(roomId: string, transportIds: string[]) {
    const room = this.rooms.get(roomId);
    if (!room) return;

    for (const id of transportIds) {
      const transport = room.transports.get(id);
      if (transport) {
        transport.close();
        room.transports.delete(id);
      }
    }

    await this.updateActivity(roomId);
  }

  private async cleanupInactiveRooms() {
    const now = Date.now();

    for (const [roomId, room] of this.rooms) {
      const lastActivity = await this.redis.get(`room:${roomId}:lastActivity`);
      if (lastActivity && now - parseInt(lastActivity, 10) > ROOM_EXPIRY) {
        this.logger.log(`Cleaning up inactive room: ${roomId}`);

        room.transports.forEach(t => t.close());
        room.producers.forEach(p => p.close());
        room.consumers.forEach(c => c.close());
        room.router.close();

        this.rooms.delete(roomId);
        await this.redis.del(`room:${roomId}:lastActivity`);

        this.logger.log(`Room destroyed: ${roomId}`);
      }
    }
  }

  async resumeConsumer(roomId: string, consumerId: string) {
    const room = this.rooms.get(roomId);
    if (!room) throw new Error('Room not found');
    const consumer = room.consumers.get(consumerId);
    if (!consumer) throw new Error('Consumer not found');

    await consumer.resume();
  }

  getRouter(roomId: string): types.Router {
    const room = this.rooms.get(roomId);
    if (!room) throw new Error('Room not found');
    return room.router;
  }
}