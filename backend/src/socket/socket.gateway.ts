import {
  WebSocketGateway, SubscribeMessage, WebSocketServer,
  OnGatewayConnection, OnGatewayDisconnect, MessageBody, ConnectedSocket
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { MediasoupService } from '../mediasoup/mediasoup.service';
import { RedisService } from '../redis/redis.service';
import { ForbiddenException, Logger } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { Prisma } from '@prisma/client';

interface ClientMeta {
  roomId: string;
  transportIds: string[];
}

@WebSocketGateway({ cors: true })
export class SocketGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;

  private logger = new Logger(SocketGateway.name);

  constructor(
    private readonly ms: MediasoupService,
    private readonly rd: RedisService,
    private readonly prisma: PrismaService,
  ) { }

  async handleConnection(client: Socket) {
    this.logger.log(`Client connected: ${client.id}`);
  }

  async handleDisconnect(client: Socket) {
    const meta = await this.rd.getJson<ClientMeta>(`client:${client.id}`);
    if (meta) {
      await this.ms.cleanupClient(meta.roomId, meta.transportIds);
      await this.rd.srem(`room:${meta.roomId}:producers`, client.id);
      await this.rd.del(`client:${client.id}`);
    }
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  @SubscribeMessage('join-room')
  async joinRoom(@ConnectedSocket() client: Socket, @MessageBody() { roomId, teamId, userId }: { roomId: string, teamId: string, userId: string }) {

    if (!roomId || !userId || (!teamId && 0)) { // for now ignoring the teamId
      client.emit('error', 'Missing roomId or userId');
      return;
    }

    // const membership = await this.prisma.teamMembership.findFirst({
    //   where: {
    //     teamId,
    //     userId,
    //   },
    // });

    // if (!membership) {
    //   throw new ForbiddenException('User does not belong to the team');
    // }

    const existing = this.ms.hasRoom(roomId);
    if (!existing) {
      console.log(`Creating new Mediasoup room: ${roomId}`);
      await this.ms.createRoom(roomId);
    }

    client.join(roomId);
    const meta: ClientMeta = { roomId, transportIds: [] };
    await this.rd.setJson(`client:${client.id}`, meta);

    client.emit('joined', { roomId, clientId: client.id });
    client.to(roomId).emit('user-joined', { userId, clientId: client.id });

    const producerIds = await this.rd.smembers(`room:${roomId}:producers`);
    if (producerIds.length > 0) {
      client.emit('producer-list', producerIds);
    }
  }

  @SubscribeMessage('create-send-transport')
  async createSend(@ConnectedSocket() client: Socket) {
    const meta = await this.rd.getJson<ClientMeta>(`client:${client.id}`);
    if (!meta?.roomId) {
      return { error: 'Client metadata missing' };
    }

    const params = await this.ms.createTransport(meta.roomId);
    meta.transportIds.push(params.id);
    await this.rd.setJson(`client:${client.id}`, meta);

    return params;
  }

  @SubscribeMessage('connect-send-transport')
  async connectSendTransport(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { transportId: string; dtlsParameters: any },
  ) {
    const meta = await this.rd.getJson<ClientMeta>(`client:${client.id}`);
    if (!meta?.roomId) {
      client.emit('error', 'Client metadata missing');
      return;
    }

    try {
      await this.ms.connectTransport(meta.roomId, data.transportId, data.dtlsParameters);
      client.emit('send-transport-connected');
    } catch (err) {
      client.emit('error', 'Failed to connect send transport');
    }
  }

  @SubscribeMessage('produce')
  async produce(@ConnectedSocket() client: Socket, @MessageBody() body: any) {
    const { transportId, kind, rtpParameters } = body || {};
    if (!transportId || !kind || !rtpParameters) return client.emit('error', 'Missing parameters');

    const meta = await this.rd.getJson<ClientMeta>(`client:${client.id}`);
    if (!meta?.roomId) return client.emit('error', 'Client metadata missing');

    const pid = await this.ms.produce(meta.roomId, transportId, kind, rtpParameters);
    await this.rd.sadd(`room:${meta.roomId}:producers`, pid);

    client.emit('produced', { producerId: pid });
    client.to(meta.roomId).emit('new-producer', { producerId: pid, clientId: client.id });
  }

  @SubscribeMessage('create-recv-transport')
  async createRecv(@ConnectedSocket() client: Socket) {
    const meta = await this.rd.getJson<ClientMeta>(`client:${client.id}`);
    if (!meta?.roomId) return client.emit('error', 'Client metadata missing');

    const params = await this.ms.createTransport(meta.roomId);
    meta.transportIds.push(params.id);
    await this.rd.setJson(`client:${client.id}`, meta);

    client.emit('recv-transport-created', params);
  }

  @SubscribeMessage('connect-recv-transport')
  async connRecv(@ConnectedSocket() client: Socket, @MessageBody() body: any) {
    const { transportId, dtlsParameters } = body || {};
    if (!transportId || !dtlsParameters) return client.emit('error', 'Missing parameters');

    const meta = await this.rd.getJson<ClientMeta>(`client:${client.id}`);
    if (!meta?.roomId) return client.emit('error', 'Client metadata missing');

    await this.ms.connectTransport(meta.roomId, transportId, dtlsParameters);
    client.emit('connected');
  }

  @SubscribeMessage('consume')
  async consume(@ConnectedSocket() client: Socket, @MessageBody() body: any) {
    const { transportId, producerId, rtpCapabilities } = body || {};
    if (!transportId || !producerId || !rtpCapabilities) {
      return client.emit('error', 'Missing parameters');
    }

    const meta = await this.rd.getJson<ClientMeta>(`client:${client.id}`);
    if (!meta?.roomId) return client.emit('error', 'Client metadata missing');

    const consumer = await this.ms.consume(meta.roomId, transportId, producerId, rtpCapabilities);
    client.emit('consumed', consumer);
  }

  @SubscribeMessage('get-producers')
  async listProducers(@ConnectedSocket() client: Socket) {
    const meta = await this.rd.getJson<ClientMeta>(`client:${client.id}`);
    if (!meta?.roomId) return client.emit('error', 'Client metadata missing');

    const list = await this.rd.smembers(`room:${meta.roomId}:producers`);
    client.emit('producer-list', list);
  }

  @SubscribeMessage('leave-room')
  async leaveRoom(@ConnectedSocket() client: Socket) {
    const meta = await this.rd.getJson<ClientMeta>(`client:${client.id}`);
    if (!meta) return;

    await this.ms.cleanupClient(meta.roomId, meta.transportIds);
    await this.rd.srem(`room:${meta.roomId}:producers`, client.id);
    await this.rd.del(`client:${client.id}`);

    client.leave(meta.roomId);
    client.to(meta.roomId).emit('user-left', { clientId: client.id });
  }

  @SubscribeMessage('get-rtp-capabilities')
  async getRtpCapabilities(
    @ConnectedSocket() client: Socket,
    @MessageBody() _: any,
  ): Promise<any> {
    const meta = await this.rd.getJson<ClientMeta>(`client:${client.id}`);
    if (!meta?.roomId) return { error: 'Client metadata missing' };

    const router = this.ms.getRouter(meta.roomId);
    return router.rtpCapabilities;
  }

  @SubscribeMessage('resume-consumer')
  async resumeConsumer(@ConnectedSocket() client: Socket, @MessageBody() { consumerId }: any) {
    const meta = await this.rd.getJson<ClientMeta>(`client:${client.id}`);
    if (!meta?.roomId) return client.emit('error', 'Client metadata missing');

    await this.ms.resumeConsumer(meta.roomId, consumerId);
    client.emit('consumer-resumed', { consumerId });
  }
}