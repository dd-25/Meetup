import { Injectable, Logger } from '@nestjs/common';
import * as mediasoup from 'mediasoup';
import { Worker, Router, WebRtcTransport, Producer, Consumer } from 'mediasoup/node/lib/types';
import { RedisService } from '../redis/redis.service';

interface RoomData {
  router: Router;
  transports: Map<string, WebRtcTransport>;
  producers: Map<string, Producer>;
  consumers: Map<string, Consumer>;
}

@Injectable()
export class MediasoupService {
  private logger = new Logger(MediasoupService.name);
  private workers: Worker[] = [];
  private rooms: Map<string, RoomData> = new Map();

  constructor(private readonly redisService: RedisService) {
    this.initWorker();
  }

  private async initWorker() {
    const worker = await mediasoup.createWorker({
      rtcMinPort: 10000,
      rtcMaxPort: 10100,
    });

    worker.on('died', () => {
      this.logger.error('Mediasoup worker died, exiting...');
      process.exit(1);
    });

    this.workers.push(worker);
    this.logger.log('Mediasoup worker initialized');
  }

  async createRoom(roomId: string) {
    if (this.rooms.has(roomId)) return;

    const worker = this.workers[0]; // Simple case: use first worker
    const router = await worker.createRouter({
      mediaCodecs: [
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
          parameters: {},
        },
      ],
    });

    this.rooms.set(roomId, {
      router,
      transports: new Map(),
      producers: new Map(),
      consumers: new Map(),
    });

    this.logger.log(`Room created: ${roomId}`);
  }

  private async getOrCreateRoom(roomId: string): Promise<RoomData> {
    let room = this.rooms.get(roomId);
    if (!room) {
      const exists = await this.redisService.roomExists(roomId);
      if (!exists) throw new Error('Room not found');
      await this.createRoom(roomId);
      room = this.rooms.get(roomId);
      if (!room) {
        throw new Error(`Room ${roomId} could not be rehydrated`);
      }
      this.logger.warn(`Room ${roomId} rehydrated from Redis`);
    }
    return room;
  }

  async getRtpCapabilities(roomId: string) {
    const room = await this.getOrCreateRoom(roomId);
    return room.router.rtpCapabilities;
  }

  async createWebRtcTransport(roomId: string, clientId: string, direction: 'send' | 'recv') {
    const room = await this.getOrCreateRoom(roomId);
    const transport = await room.router.createWebRtcTransport({
      listenIps: [{ ip: '0.0.0.0', announcedIp: '127.0.0.1' }],
      enableUdp: true,
      enableTcp: true,
      preferUdp: true,
    });

    room.transports.set(`${clientId}-${direction}`, transport);

    this.logger.log(`Created ${direction} transport for ${clientId} in ${roomId}`);

    return {
      id: transport.id,
      iceParameters: transport.iceParameters,
      iceCandidates: transport.iceCandidates,
      dtlsParameters: transport.dtlsParameters,
    };
  }

  async connectTransport(clientId: string, transportId: string, dtlsParameters: any) {
    for (const room of this.rooms.values()) {
      const transport = Array.from(room.transports.values()).find(t => t.id === transportId);
      if (transport) {
        await transport.connect({ dtlsParameters });
        this.logger.log(`Connected transport ${transportId} for ${clientId}`);
        return;
      }
    }
    throw new Error('Transport not found');
  }

  async produce(
    roomId: string,
    clientId: string,
    transportId: string,
    kind: string,
    rtpParameters: any,
  ): Promise<string> {
    const room = await this.getOrCreateRoom(roomId);
    const transport = room.transports.get(`${clientId}-send`);
    if (!transport) throw new Error('Send transport not found');

    const producer = await transport.produce({
      kind: kind as mediasoup.types.MediaKind,
      rtpParameters,
      appData: { clientId },
    });

    room.producers.set(producer.id, producer);
    this.logger.log(`${kind} producer created for ${clientId} in ${roomId}`);
    return producer.id;
  }

  async consume(
    roomId: string,
    clientId: string,
    producerId: string,
    rtpCapabilities: any,
  ) {
    const room = await this.getOrCreateRoom(roomId);

    const router = room.router;
    if (!router.canConsume({ producerId, rtpCapabilities })) {
      throw new Error('Cannot consume this producer with the given RTP capabilities');
    }

    const transport = room.transports.get(`${clientId}-recv`);
    if (!transport) throw new Error('Recv transport not found');

    const consumer = await transport.consume({
      producerId,
      rtpCapabilities,
      paused: false,
    });

    room.consumers.set(consumer.id, consumer);
    this.logger.log(`Consumer created for ${clientId} (producer: ${producerId})`);

    return {
      id: consumer.id,
      producerId,
      kind: consumer.kind,
      rtpParameters: consumer.rtpParameters,
    };
  }

  async getProducers(roomId: string, excludeClientId: string): Promise<string[]> {
    const room = await this.getOrCreateRoom(roomId);
    return Array.from(room.producers.values())
      .filter((p) => p.appData?.clientId !== excludeClientId)
      .map((p) => p.id);
  }

  async removeClient(clientId: string) {
    for (const [roomId, room] of this.rooms.entries()) {
      const sendTransport = room.transports.get(`${clientId}-send`);
      const recvTransport = room.transports.get(`${clientId}-recv`);

      // Close and delete producers
      for (const [producerId, producer] of room.producers.entries()) {
        if (producer.appData?.clientId === clientId) {
          await producer.close();
          room.producers.delete(producerId);
          this.logger.log(`Closed producer ${producerId} for ${clientId}`);
        }
      }

      // Close and delete consumers
      for (const [consumerId, consumer] of room.consumers.entries()) {
        if (consumer.appData?.clientId === clientId) {
          await consumer.close();
          room.consumers.delete(consumerId);
          this.logger.log(`Closed consumer ${consumerId} for ${clientId}`);
        }
      }

      // Close transports
      if (sendTransport) {
        await sendTransport.close();
        room.transports.delete(`${clientId}-send`);
        this.logger.log(`Closed send transport for ${clientId}`);
      }
      if (recvTransport) {
        await recvTransport.close();
        room.transports.delete(`${clientId}-recv`);
        this.logger.log(`Closed recv transport for ${clientId}`);
      }

      // If room is empty, optionally destroy
      if (
        room.transports.size === 0 &&
        room.producers.size === 0 &&
        room.consumers.size === 0
      ) {
        await room.router.close();
        this.rooms.delete(roomId);
        this.logger.warn(`Destroyed room ${roomId} (empty after ${clientId} left)`);
      }
    }
  }
}