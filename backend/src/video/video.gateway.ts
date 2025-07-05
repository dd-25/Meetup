import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { MediasoupService } from '../mediasoup/mediasoup.service';
import { RedisService } from '../redis/redis.service';
import { 
  ConnectTransportDto, 
  ProduceDto, 
  ConsumeDto, 
  JoinRoomDto, 
  LeaveRoomDto 
} from '../mediasoup/dto';
import { SocketEvents, TransportDirection, ProducerKind } from '../shared/enums';
import { ClientMetadata } from '../shared/types';

@WebSocketGateway({ cors: {
  origin: '*',
} })
export class SocketGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(SocketGateway.name);
  private server: Server;

  constructor(
    private readonly mediasoupService: MediasoupService,
    private readonly redisService: RedisService,
  ) {}

  afterInit(server: Server) {
    this.server = server;
  }

  async handleConnection(client: Socket) {
    this.logger.log(`Client connected: ${client.id}`);
  }

  async handleDisconnect(client: Socket) {
    this.logger.warn(`Client disconnected: ${client.id}`);

    const metadata = await this.redisService.getClientMetadata(client.id);
    if (!metadata?.roomId) return;

    const { roomId } = metadata;

    await this.mediasoupService.removeClient(client.id);
    await this.redisService.removeClientFromRoom(client.id, roomId);

    const remainingClients = await this.redisService.getClientsInRoom(roomId);
    if (remainingClients.length === 0) {
      this.logger.warn(`Room ${roomId} is now empty.`);
    }
  }

  @SubscribeMessage(SocketEvents.JOIN_ROOM)
  async joinRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: JoinRoomDto & { userId: string; teamId: string },
  ) {
    const { roomId, userId, teamId } = body;
    this.logger.log(`join-room: ${client.id} joining ${roomId} as ${userId}`);

    // TODO: Replace with DB check
    const userInTeam = true;
    if (!userInTeam) {
      client.emit(SocketEvents.ERROR, 'User not in team');
      return;
    }

    // Create room in Redis if not exists
    const alreadyExists = await this.redisService.roomExists(roomId);
    if (!alreadyExists) {
      await this.redisService.createRoom(roomId, teamId);
      await this.mediasoupService.createRoom(roomId);
      this.logger.log(`Created room ${roomId} for team ${teamId}`);
      // add room to the DB
    }

    // Set client metadata
    await this.redisService.setClientMetadata(client.id, { userId, roomId, teamId });
    await this.redisService.addClientToRoom(roomId, client.id);

    const allClients = await this.redisService.getClientsInRoom(roomId);
    const otherClients = allClients.filter(id => id !== client.id);

    for (const peerId of otherClients) {
      this.server.to(peerId).emit('new-peer', { clientId: client.id });
    }

    client.emit(SocketEvents.ROOM_JOINED, { roomId, clientId: client.id });
  }

  @SubscribeMessage('get-rtp-capabilities')
  async getRtpCapabilities(@ConnectedSocket() client: Socket) {
    const metadata = await this.redisService.getClientMetadata(client.id);
    if (!metadata?.roomId) {
      return client.emit(SocketEvents.ERROR, 'Client not in room');
    }

    try {
      const caps = await this.mediasoupService.getRtpCapabilities(metadata.roomId);
      client.emit('get-rtp-capabilities', caps);
    } catch (err) {
      this.logger.error('get-rtp-capabilities error:', err);
      client.emit(SocketEvents.ERROR, 'Room not found or mediasoup error');
    }
  }

  @SubscribeMessage(SocketEvents.CREATE_SEND_TRANSPORT)
  async createSendTransport(@ConnectedSocket() client: Socket) {
    const metadata = await this.redisService.getClientMetadata(client.id);
    if (!metadata?.roomId) {
      return client.emit(SocketEvents.ERROR, 'Client not in room');
    }

    const params = await this.mediasoupService.createWebRtcTransport(
      metadata.roomId,
      client.id,
      TransportDirection.SEND,
    );
    client.emit(SocketEvents.PARAMETERS, params);
  }

  @SubscribeMessage(SocketEvents.CONNECT_SEND_TRANSPORT)
  async connectSendTransport(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: ConnectTransportDto,
  ) {
    await this.mediasoupService.connectTransport(client.id, body.transportId, body.dtlsParameters);
    client.emit(SocketEvents.SEND_TRANSPORT_CONNECTED);
  }

  @SubscribeMessage(SocketEvents.PRODUCE)
  async produce(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: ProduceDto,
  ) {
    const metadata = await this.redisService.getClientMetadata(client.id);
    if (!metadata?.roomId) {
      return client.emit(SocketEvents.ERROR, 'No room found for producer');
    }

    const producerId = await this.mediasoupService.produce(
      metadata.roomId,
      client.id,
      body.transportId,
      body.kind,
      body.rtpParameters,
    );

    const clients = await this.redisService.getClientsInRoom(metadata.roomId);
    for (const cid of clients) {
      if (cid !== client.id) {
        this.server.to(cid).emit('new-producer', { producerId });
      }
    }

    client.emit('produced', { producerId });
  }

  @SubscribeMessage(SocketEvents.CREATE_RECV_TRANSPORT)
  async createRecvTransport(@ConnectedSocket() client: Socket) {
    const metadata = await this.redisService.getClientMetadata(client.id);
    if (!metadata?.roomId) {
      return client.emit(SocketEvents.ERROR, 'No room for recv transport');
    }

    const params = await this.mediasoupService.createWebRtcTransport(
      metadata.roomId,
      client.id,
      TransportDirection.RECV,
    );
    client.emit('recv-transport-created', params);
  }

  @SubscribeMessage(SocketEvents.CONNECT_RECV_TRANSPORT)
  async connectRecvTransport(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: ConnectTransportDto,
  ) {
    await this.mediasoupService.connectTransport(client.id, body.transportId, body.dtlsParameters);
    client.emit(SocketEvents.RECV_TRANSPORT_CONNECTED);
  }

  @SubscribeMessage(SocketEvents.CONSUME)
  async consume(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: ConsumeDto,
  ) {
    const metadata = await this.redisService.getClientMetadata(client.id);
    if (!metadata?.roomId) return client.emit(SocketEvents.ERROR, 'Client not in room');
    try {
      const consumerParams = await this.mediasoupService.consume(
        metadata.roomId,
        client.id,
        body.producerId,
        body.rtpCapabilities,
      );
      client.emit('consumed', consumerParams);
    } catch (err) {
      client.emit(SocketEvents.ERROR, `Failed to consume: ${err.message}`);
    }
  }

  @SubscribeMessage('get-producers')
  async getProducers(@ConnectedSocket() client: Socket) {
    const metadata = await this.redisService.getClientMetadata(client.id);
    if (!metadata?.roomId) return;

    const producers = await this.mediasoupService.getProducers(metadata.roomId, client.id);
    client.emit('producer-list', producers);
  }

  @SubscribeMessage(SocketEvents.LEAVE_ROOM)
  async leaveRoom(@ConnectedSocket() client: Socket) {
    const metadata = await this.redisService.getClientMetadata(client.id);
    if (!metadata?.roomId) return;

    const { roomId } = metadata;

    await this.mediasoupService.removeClient(client.id);
    await this.redisService.removeClientFromRoom(client.id, roomId);

    const clients = await this.redisService.getClientsInRoom(roomId);
    for (const cid of clients) {
      this.server.to(cid).emit('peer-left', { clientId: client.id });
    }

    if (clients.length === 0) {
      this.logger.warn(`Room ${roomId} is now empty after client left.`);
    }
  }
}