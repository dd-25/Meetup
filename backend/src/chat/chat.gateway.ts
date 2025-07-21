/**
 * ========================
 * Chat Architecture Design
 * ========================
 * 
 * This service handles both **permanent (team-level)** chat and **temporary (room-level)** chat 
 * for a scalable, real-time video conferencing application using NestJS, Redis, Kafka, and Socket.IO.
 * 
 * ───────────────────────────────────────────────────────────────────────────────
 * 🧩 Components Involved:
 * - Kafka: For decoupled, asynchronous, persistent message ingestion and batch processing.
 * - Redis: For fast in-memory caching of recent messages, Pub/Sub for real-time cross-server communication.
 * - Socket.IO: For real-time delivery of messages to currently connected users.
 * - PostgreSQL (or any DB): For long-term storage of permanent (team) chat.
 * 
 * ───────────────────────────────────────────────────────────────────────────────
 * 📦 Permanent Chat (Team Chat)
 * - Scope: Shared among all members of a given team (organization-level context).
 * - Flow:
 *   1. User sends a message to their team's chat.
 *   2. The message is:
 *      a. Sent to Kafka for durable ingestion.
 *      b. Published to Redis Pub/Sub for real-time propagation to other nodes.
 *      c. Cached in Redis under the team key (`team:{teamId}:chat`) — only latest 50 messages retained.
 *   3. Socket.IO broadcasts the message to all connected users in that team.
 *   4. A Kafka consumer asynchronously:
 *      a. Batches and writes messages to the database (every N seconds or N messages).
 * 
 *   🔁 When a new user joins:
 *   - The last 50 messages are fetched from Redis (no DB query needed).
 * 
 * ───────────────────────────────────────────────────────────────────────────────
 * ⚡ Temporary Chat (Room Chat)
 * - Scope: Private to users in a single video call room.
 * - Flow:
 *   1. User sends a message to their current room chat.
 *   2. The message is:
 *      a. Cached in Redis under the room key (`room:{roomId}:chat`) — latest 300 messages retained.
 *      b. Published to Redis Pub/Sub for real-time propagation across distributed Socket.IO servers.
 *   3. Socket.IO broadcasts the message to all users in the same room.
 * 
 *   🔁 When a new user joins a room:
 *   - The last 300 messages are fetched from Redis.
 *   - No DB persistence occurs, as this chat is ephemeral and tied to room lifetime.
 * 
 * ───────────────────────────────────────────────────────────────────────────────
 * 🌐 Scalability & Distribution
 * - Redis Pub/Sub is used to propagate messages across multiple app instances/nodes for both chat types.
 * - Kafka ensures fault tolerance and decoupling of ingestion and database writes.
 * - Redis stores only the recent N messages to minimize memory usage.
 * - Socket.IO channels are segregated by roomId or teamId to ensure message isolation.
 * 
 * ───────────────────────────────────────────────────────────────────────────────
 * 📌 Summary:
 * - Team chat = persistent (Kafka + DB + Redis [50 messages]) + broadcast to team
 * - Room chat = temporary (Redis [300 messages]) + broadcast to room
 * - Redis Pub/Sub = real-time delivery across distributed systems
 * - Kafka = buffer + scalable batch DB write
 * 
 * This architecture enables high throughput, low latency, and scalable real-time messaging.
 */

import {
    WebSocketGateway,
    SubscribeMessage,
    MessageBody,
    ConnectedSocket,
    WebSocketServer,
    OnGatewayConnection,
    OnGatewayDisconnect,
    OnGatewayInit,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger, UsePipes, ValidationPipe } from '@nestjs/common';
import { KafkaService } from '../kafka/kafka.service';
import { RedisService, TeamChatMessage, RoomChatMessage } from '../redis/redis.service';
import { 
    CreateChatMessageDto, 
    CreateRoomChatMessageDto, 
    ChatHistoryRequestDto, 
    RoomChatHistoryRequestDto 
} from './dto';
import { v4 as uuidv4 } from 'uuid';
import { 
    GATEWAY_CONFIG, 
    CHAT_EVENTS, 
    MESSAGE_STATUS, 
    USER_STATUS 
} from './constants';
import { 
    CHAT_LIMITS, 
    SOCKET_ROOMS, 
    MEDIA_TYPES,
    CHAT_RETENTION 
} from '../shared/constants';

interface ConnectedUser {
    userId: string;
    userName?: string;
    teamIds: Set<string>;
    roomIds: Set<string>;
    connectedAt: Date;
}

@WebSocketGateway({
    cors: {
        origin: GATEWAY_CONFIG.CORS_ORIGIN,
        credentials: GATEWAY_CONFIG.CORS_CREDENTIALS,
    },
    namespace: GATEWAY_CONFIG.NAMESPACE,
    transports: GATEWAY_CONFIG.TRANSPORTS,
})
@UsePipes(new ValidationPipe({ transform: true }))
export class ChatGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
    @WebSocketServer()
    server: Server;

    private readonly logger = new Logger(ChatGateway.name);
    private connectedUsers: Map<string, ConnectedUser> = new Map();
    private userSocketMap: Map<string, Set<string>> = new Map(); // userId -> Set of socketIds
    private subscriptions: Map<string, Set<string>> = new Map(); // socketId -> Set of subscription keys

    constructor(
        private readonly kafkaService: KafkaService,
        private readonly redisService: RedisService,
    ) {}

    afterInit(server: Server) {
        this.logger.log('Chat Gateway initialized');
        this.setupRedisSubscriptions();
    }

    async handleConnection(client: Socket) {
        try {
            this.logger.log(`Client connected: ${client.id}`);
            
            // Initialize tracking for this socket
            this.subscriptions.set(client.id, new Set());
            
            // Send connection confirmation
            client.emit(CHAT_EVENTS.CONNECTED, {
                success: true,
                socketId: client.id,
                timestamp: new Date().toISOString(),
                message: 'Connected to chat service',
            });

        } catch (error) {
            this.logger.error('Error in handleConnection:', error);
            client.emit(CHAT_EVENTS.CONNECTION_ERROR, {
                message: 'Failed to establish connection',
                error: error.message,
            });
        }
    }

    async handleDisconnect(client: Socket) {
        try {
            this.logger.log(`Client disconnected: ${client.id}`);
            
            const userInfo = this.connectedUsers.get(client.id);
            if (userInfo) {
                // Remove user from socket mapping
                const userSockets = this.userSocketMap.get(userInfo.userId);
                if (userSockets) {
                    userSockets.delete(client.id);
                    if (userSockets.size === 0) {
                        this.userSocketMap.delete(userInfo.userId);
                    }
                }

                // Leave all rooms and teams
                    for (const teamId of userInfo.teamIds) {
                        await client.leave(SOCKET_ROOMS.TEAM(teamId));
                        this.notifyTeamUserStatus(teamId, userInfo.userId, USER_STATUS.OFFLINE);
                    }

                for (const roomId of userInfo.roomIds) {
                    await client.leave(SOCKET_ROOMS.ROOM(roomId));
                    this.notifyRoomUserStatus(roomId, userInfo.userId, USER_STATUS.OFFLINE);
                    
                    // Update Redis client tracking
                    await this.redisService.removeClientFromRoom(client.id, roomId);
                }

                // Clean up subscriptions
                const socketSubscriptions = this.subscriptions.get(client.id);
                if (socketSubscriptions) {
                    // Unsubscribe from Redis channels if needed
                    this.subscriptions.delete(client.id);
                }

                this.connectedUsers.delete(client.id);
            }

        } catch (error) {
            this.logger.error('Error in handleDisconnect:', error);
        }
    }

    private async setupRedisSubscriptions() {
        // This would be enhanced to handle cross-server message propagation
        // For now, we'll handle it within the same instance
        this.logger.log('Redis subscriptions setup completed');
    }

    // ============================================
    // Team Chat Handlers (Permanent Chat)
    // ============================================

    @SubscribeMessage(CHAT_EVENTS.JOIN_TEAM_CHAT)
    async handleJoinTeamChat(
        @MessageBody() data: { userId: string; teamId: string; userName?: string },
        @ConnectedSocket() client: Socket,
    ) {
        try {
            const { userId, teamId, userName } = data;
            
            // Validate input
            if (!userId || !teamId) {
                throw new Error('userId and teamId are required');
            }

            // Join the team's chat room
            await client.join(SOCKET_ROOMS.TEAM(teamId));
            
            // Track user's teams
            let userInfo = this.connectedUsers.get(client.id);
            if (!userInfo) {
                userInfo = {
                    userId,
                    userName,
                    teamIds: new Set(),
                    roomIds: new Set(),
                    connectedAt: new Date(),
                };
                this.connectedUsers.set(client.id, userInfo);
            }
            
            userInfo.teamIds.add(teamId);
            userInfo.userName = userName || userInfo.userName;

            // Track user socket mapping
            if (!this.userSocketMap.has(userId)) {
                this.userSocketMap.set(userId, new Set());
            }
            this.userSocketMap.get(userId)!.add(client.id);

            this.logger.log(`User ${userId} (${userName}) joined team chat ${teamId}`);
            
            // Get chat history from Redis
            const chatHistory = await this.redisService.getTeamChatHistory(teamId, CHAT_RETENTION.TEAM_MESSAGES);
            
            // Send confirmation and history to the user
            client.emit(CHAT_EVENTS.JOINED_TEAM_CHAT, {
                success: true,
                teamId,
                userId,
                chatHistory,
                message: `Successfully joined team ${teamId} chat`,
                timestamp: new Date().toISOString(),
            });

            // Notify others in the team
            client.to(SOCKET_ROOMS.TEAM(teamId)).emit(CHAT_EVENTS.TEAM_USER_JOINED, {
                userId,
                userName,
                teamId,
                timestamp: new Date().toISOString(),
            });

        } catch (error) {
            this.logger.error('Error joining team chat:', error);
            client.emit(CHAT_EVENTS.ERROR, {
                event: CHAT_EVENTS.JOIN_TEAM_CHAT,
                message: 'Failed to join team chat',
                error: error.message,
            });
        }
    }

    @SubscribeMessage(CHAT_EVENTS.LEAVE_TEAM_CHAT)
    async handleLeaveTeamChat(
        @MessageBody() data: { userId: string; teamId: string },
        @ConnectedSocket() client: Socket,
    ) {
        try {
            const { userId, teamId } = data;
            
            // Leave the team's chat room
            await client.leave(`team-${teamId}`);
            
            // Update tracked teams
            const userInfo = this.connectedUsers.get(client.id);
            if (userInfo) {
                userInfo.teamIds.delete(teamId);
            }

            this.logger.log(`User ${userId} left team chat ${teamId}`);
            
            // Notify others in the team
            client.to(SOCKET_ROOMS.TEAM(teamId)).emit(CHAT_EVENTS.TEAM_USER_LEFT, {
                userId,
                teamId,
                timestamp: new Date().toISOString(),
            });

            // Send confirmation to the user
            client.emit(CHAT_EVENTS.LEFT_TEAM_CHAT, {
                success: true,
                teamId,
                message: `Successfully left team ${teamId} chat`,
            });

        } catch (error) {
            this.logger.error('Error leaving team chat:', error);
            client.emit(CHAT_EVENTS.ERROR, {
                event: CHAT_EVENTS.LEAVE_TEAM_CHAT,
                message: 'Failed to leave team chat',
                error: error.message,
            });
        }
    }

    @SubscribeMessage(CHAT_EVENTS.SEND_TEAM_MESSAGE)
    async handleSendTeamMessage(
        @MessageBody() data: CreateChatMessageDto,
        @ConnectedSocket() client: Socket,
    ) {
        try {
            // Generate ID if not provided
            const messageId = data.id || uuidv4();
            
            const userInfo = this.connectedUsers.get(client.id);
            if (!userInfo) {
                throw new Error('User not properly connected');
            }

            // Verify user is in the team
            if (!userInfo.teamIds.has(data.teamId)) {
                throw new Error('User not in this team chat');
            }

            const teamMessage: TeamChatMessage = {
                id: messageId,
                teamId: data.teamId,
                userId: data.userId,
                content: data.content,
                url: data.url,
                mediaType: data.mediaType || MEDIA_TYPES.TEXT,
                createdAt: new Date().toISOString(),
                userName: data.userName || userInfo.userName,
            };

            // 1. Publish to Kafka for persistence (if available)
            let kafkaResult: any = null;
            if (this.kafkaService.connected) {
                const kafkaMessage = {
                    ...teamMessage,
                    createdAt: new Date(teamMessage.createdAt),
                };
                kafkaResult = await this.kafkaService.publishChatMessage(kafkaMessage);
                
                if (kafkaResult) {
                    this.logger.log(`Team message ${messageId} published to Kafka`);
                }
            }

            // 2. Cache in Redis
            await this.redisService.addTeamChatMessage(teamMessage);

            // 3. Publish to Redis for cross-server propagation
            await this.redisService.publishTeamMessage(teamMessage);

            // 4. Broadcast to all users in the team room
            this.server.to(SOCKET_ROOMS.TEAM(data.teamId)).emit(CHAT_EVENTS.TEAM_MESSAGE, {
                ...teamMessage,
                status: kafkaResult ? 'persisted' : 'cached-only',
            });

            // 5. Confirm to sender
            client.emit(CHAT_EVENTS.MESSAGE_SENT, {
                success: true,
                messageId,
                type: 'team',
                timestamp: teamMessage.createdAt,
                kafkaStatus: kafkaResult ? 'published' : 'unavailable',
            });

        } catch (error) {
            this.logger.error('Error sending team message:', error);
            client.emit(CHAT_EVENTS.ERROR, {
                event: CHAT_EVENTS.SEND_TEAM_MESSAGE,
                message: 'Failed to send team message',
                error: error.message,
            });
        }
    }

    @SubscribeMessage(CHAT_EVENTS.GET_TEAM_CHAT_HISTORY)
    async handleGetTeamChatHistory(
        @MessageBody() data: { teamId: string; limit?: number },
        @ConnectedSocket() client: Socket,
    ) {
        try {
            const { teamId, limit = CHAT_LIMITS.TEAM_HISTORY_DEFAULT } = data;
            
            const userInfo = this.connectedUsers.get(client.id);
            if (!userInfo?.teamIds.has(teamId)) {
                throw new Error('User not in this team');
            }

            const chatHistory = await this.redisService.getTeamChatHistory(teamId, limit);
            
            client.emit(CHAT_EVENTS.TEAM_CHAT_HISTORY, {
                success: true,
                teamId,
                messages: chatHistory,
                count: chatHistory.length,
            });

        } catch (error) {
            this.logger.error('Error getting team chat history:', error);
            client.emit(CHAT_EVENTS.ERROR, {
                event: CHAT_EVENTS.GET_TEAM_CHAT_HISTORY,
                message: 'Failed to get team chat history',
                error: error.message,
            });
        }
    }

    // Utility function to generate deterministic UUIDs for database compatibility
    private generateDeterministicUUID(input: string): string {
        // Simple hash function to create deterministic randomness
        let hash = 0;
        for (let i = 0; i < input.length; i++) {
            const char = input.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32-bit integer
        }
        
        // Use the hash to create a consistent UUID
        const random = () => {
            hash = (hash * 9301 + 49297) % 233280;
            return hash / 233280;
        };
        
        const template = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx';
        return template.replace(/[xy]/g, function(c) {
            const r = (random() * 16) | 0;
            const v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }

    // ============================================
    // Room Chat Handlers (Temporary Chat)
    // ============================================

    @SubscribeMessage(CHAT_EVENTS.JOIN_ROOM_CHAT)
    async handleJoinRoomChat(
        @MessageBody() data: { userId: string; roomId: string; userName?: string },
        @ConnectedSocket() client: Socket,
    ) {
        try {
            const { userId, roomId, userName } = data;
            this.logger.log(`🗨️ JOIN_ROOM_CHAT received - userId: ${userId}, roomId: ${roomId}, userName: ${userName}, clientId: ${client.id}`);
            
            // Validate input
            if (!userId || !roomId) {
                this.logger.error(`❌ Invalid input - userId: ${userId}, roomId: ${roomId}`);
                throw new Error('userId and roomId are required');
            }

            // Check if room exists, create if not (for chat-first scenarios)
            const roomExists = await this.redisService.roomExists(roomId);
            this.logger.log(`🔍 Room exists check for ${roomId}: ${roomExists}`);
            if (!roomExists) {
                this.logger.warn(`⚠️ Room ${roomId} does not exist, creating it for chat`);
                // Create room for chat purposes (basic room without full video setup)
                await this.redisService.createRoom(roomId, 'unknown-team');
                this.logger.log(`✅ Created basic room ${roomId} for chat`);
            }

            // Join the room's chat
            await client.join(SOCKET_ROOMS.ROOM(roomId));
            this.logger.log(`✅ Client ${client.id} joined Socket.IO room: ${SOCKET_ROOMS.ROOM(roomId)}`);
            
            // Track user's rooms
            let userInfo = this.connectedUsers.get(client.id);
            if (!userInfo) {
                userInfo = {
                    userId,
                    userName,
                    teamIds: new Set(),
                    roomIds: new Set(),
                    connectedAt: new Date(),
                };
                this.connectedUsers.set(client.id, userInfo);
                this.logger.log(`👤 Created new user info for ${userId}`);
            }
            
            userInfo.roomIds.add(roomId);
            userInfo.userName = userName || userInfo.userName;
            this.logger.log(`👤 Updated user info - roomIds: ${Array.from(userInfo.roomIds)}`);

            // Update Redis room tracking
            await this.redisService.addClientToRoom(roomId, client.id);
            await this.redisService.setClientMetadata(client.id, {
                userId,
                roomId,
                teamId: '', // Will be set when joining team
            });
            this.logger.log(`📝 Updated Redis tracking for client ${client.id}`);

            this.logger.log(`User ${userId} (${userName}) joined room chat ${roomId}`);
            
            // Get chat history from Redis
            this.logger.log(`📜 Fetching chat history for room ${roomId}`);
            const chatHistory = await this.redisService.getRoomChatHistory(roomId, CHAT_RETENTION.ROOM_MESSAGES);
            this.logger.log(`📜 Retrieved ${chatHistory.length} messages from Redis for room ${roomId}`);
            if (chatHistory.length > 0) {
                this.logger.log(`📜 Sample message:`, chatHistory[0]);
            }
            
            // Send confirmation and history to the user
            client.emit(CHAT_EVENTS.JOINED_ROOM_CHAT, {
                success: true,
                roomId,
                userId,
                chatHistory,
                message: `Successfully joined room ${roomId} chat`,
                timestamp: new Date().toISOString(),
            });

            // Notify others in the room
            client.to(SOCKET_ROOMS.ROOM(roomId)).emit(CHAT_EVENTS.ROOM_USER_JOINED, {
                userId,
                userName,
                roomId,
                timestamp: new Date().toISOString(),
            });

        } catch (error) {
            this.logger.error('Error joining room chat:', error);
            client.emit(CHAT_EVENTS.ERROR, {
                event: CHAT_EVENTS.JOIN_ROOM_CHAT,
                message: 'Failed to join room chat',
                error: error.message,
            });
        }
    }

    @SubscribeMessage(CHAT_EVENTS.LEAVE_ROOM_CHAT)
    async handleLeaveRoomChat(
        @MessageBody() data: { userId: string; roomId: string },
        @ConnectedSocket() client: Socket,
    ) {
        try {
            const { userId, roomId } = data;
            
            // Leave the room's chat
            await client.leave(SOCKET_ROOMS.ROOM(roomId));
            
            // Update tracked rooms
            const userInfo = this.connectedUsers.get(client.id);
            if (userInfo) {
                userInfo.roomIds.delete(roomId);
            }

            // Update Redis tracking
            await this.redisService.removeClientFromRoom(client.id, roomId);

            this.logger.log(`User ${userId} left room chat ${roomId}`);
            
            // Notify others in the room
            client.to(SOCKET_ROOMS.ROOM(roomId)).emit(CHAT_EVENTS.ROOM_USER_LEFT, {
                userId,
                roomId,
                timestamp: new Date().toISOString(),
            });

            // Send confirmation to the user
            client.emit(CHAT_EVENTS.LEFT_ROOM_CHAT, {
                success: true,
                roomId,
                message: `Successfully left room ${roomId} chat`,
            });

        } catch (error) {
            this.logger.error('Error leaving room chat:', error);
            client.emit(CHAT_EVENTS.ERROR, {
                event: CHAT_EVENTS.LEAVE_ROOM_CHAT,
                message: 'Failed to leave room chat',
                error: error.message,
            });
        }
    }

    @SubscribeMessage(CHAT_EVENTS.SEND_ROOM_MESSAGE)
    async handleSendRoomMessage(
        @MessageBody() data: any, // Use any to bypass DTO validation initially
        @ConnectedSocket() client: Socket,
    ) {
        try {
            this.logger.log(`💬 SEND_ROOM_MESSAGE received from ${client.id}`);
            this.logger.log(`💬 Message data:`, JSON.stringify(data, null, 2));
            
            // Convert string IDs to UUIDs if needed for database compatibility
            const roomUUID = this.generateDeterministicUUID(`room:${data.roomId}`);
            const userUUID = this.generateDeterministicUUID(`user:${data.userId}`);
            
            // Generate ID if not provided
            const messageId = data.id || uuidv4();
            this.logger.log(`💬 Generated/using message ID: ${messageId}`);
            this.logger.log(`💬 Converted IDs - roomUUID: ${roomUUID}, userUUID: ${userUUID}`);
            
            const userInfo = this.connectedUsers.get(client.id);
            if (!userInfo) {
                this.logger.error(`❌ User not found in connectedUsers for client ${client.id}`);
                throw new Error('User not properly connected');
            }
            this.logger.log(`👤 Found user info:`, userInfo);

            // Verify user is in the room (use original room ID for this check)
            if (!userInfo.roomIds.has(data.roomId)) {
                this.logger.error(`❌ User ${userInfo.userId} not in room ${data.roomId}. User rooms: ${Array.from(userInfo.roomIds)}`);
                throw new Error('User not in this room chat');
            }
            this.logger.log(`✅ User verified to be in room ${data.roomId}`);

            const roomMessage: RoomChatMessage = {
                id: messageId,
                roomId: data.roomId, // Use original room ID for Redis operations (consistent with room creation)
                userId: userUUID, // Use UUID for database storage
                content: data.content,
                url: data.url,
                mediaType: data.mediaType || MEDIA_TYPES.TEXT,
                createdAt: new Date().toISOString(),
                userName: data.userName || userInfo.userName,
            };
            this.logger.log(`📝 Constructed room message:`, roomMessage);

            // 1. Cache in Redis (room chat is temporary, no Kafka)
            await this.redisService.addRoomChatMessage(roomMessage);
            this.logger.log(`💾 Message cached in Redis`);

            // 2. Publish to Redis for cross-server propagation
            await this.redisService.publishRoomMessage(roomMessage);
            this.logger.log(`📡 Message published to Redis for cross-server propagation`);

            // 3. Broadcast to all users in the room (use original room ID for Socket.IO room)
            const roomSocketName = SOCKET_ROOMS.ROOM(data.roomId);
            this.logger.log(`📢 Broadcasting to Socket.IO room: ${roomSocketName}`);
            
            const messagePayload = {
                ...roomMessage,
                userId: data.userId, // Use original user ID in the broadcast for frontend compatibility
                status: 'delivered',
            };
            this.logger.log(`📢 Broadcasting message payload:`, messagePayload);
            
            this.server.to(roomSocketName).emit(CHAT_EVENTS.ROOM_MESSAGE, messagePayload);
            this.logger.log(`✅ Message broadcasted to room ${data.roomId}`);

            // 4. Confirm to sender
            client.emit(CHAT_EVENTS.MESSAGE_SENT, {
                success: true,
                messageId,
                type: 'room',
                timestamp: roomMessage.createdAt,
            });

        } catch (error) {
            this.logger.error('Error sending room message:', error);
            client.emit(CHAT_EVENTS.ERROR, {
                event: CHAT_EVENTS.SEND_ROOM_MESSAGE,
                message: 'Failed to send room message',
                error: error.message,
            });
        }
    }

    @SubscribeMessage(CHAT_EVENTS.GET_ROOM_CHAT_HISTORY)
    async handleGetRoomChatHistory(
        @MessageBody() data: { roomId: string; limit?: number },
        @ConnectedSocket() client: Socket,
    ) {
        try {
            const { roomId, limit = CHAT_LIMITS.ROOM_HISTORY_DEFAULT } = data;
            
            const userInfo = this.connectedUsers.get(client.id);
            if (!userInfo?.roomIds.has(roomId)) {
                throw new Error('User not in this room');
            }

            const chatHistory = await this.redisService.getRoomChatHistory(roomId, limit);
            
            client.emit(CHAT_EVENTS.ROOM_CHAT_HISTORY, {
                success: true,
                roomId,
                messages: chatHistory,
                count: chatHistory.length,
            });

        } catch (error) {
            this.logger.error('Error getting room chat history:', error);
            client.emit(CHAT_EVENTS.ERROR, {
                event: CHAT_EVENTS.GET_ROOM_CHAT_HISTORY,
                message: 'Failed to get room chat history',
                error: error.message,
            });
        }
    }

    // ============================================
    // Utility and Status Handlers
    // ============================================

    @SubscribeMessage(CHAT_EVENTS.GET_CHAT_STATUS)
    async handleGetChatStatus(@ConnectedSocket() client: Socket) {
        try {
            const userInfo = this.connectedUsers.get(client.id);
            const kafkaHealth = await this.kafkaService.getHealth();
            const redisHealth = await this.redisService.getHealth();
            
            client.emit(CHAT_EVENTS.CHAT_STATUS, {
                success: true,
                user: userInfo ? {
                    userId: userInfo.userId,
                    userName: userInfo.userName,
                    teamsJoined: Array.from(userInfo.teamIds),
                    roomsJoined: Array.from(userInfo.roomIds),
                    connectedAt: userInfo.connectedAt,
                } : null,
                services: {
                    kafka: kafkaHealth,
                    redis: redisHealth,
                },
                timestamp: new Date().toISOString(),
            });

        } catch (error) {
            this.logger.error('Error getting chat status:', error);
            client.emit(CHAT_EVENTS.ERROR, {
                event: CHAT_EVENTS.GET_CHAT_STATUS,
                message: 'Failed to get chat status',
                error: error.message,
            });
        }
    }

    // ============================================
    // Private Helper Methods
    // ============================================

    private notifyTeamUserStatus(teamId: string, userId: string, status: typeof USER_STATUS.ONLINE | typeof USER_STATUS.OFFLINE) {
        this.server.to(SOCKET_ROOMS.TEAM(teamId)).emit(CHAT_EVENTS.TEAM_USER_STATUS, {
            userId,
            status,
            teamId,
            timestamp: new Date().toISOString(),
        });
    }

    private notifyRoomUserStatus(roomId: string, userId: string, status: typeof USER_STATUS.ONLINE | typeof USER_STATUS.OFFLINE) {
        this.server.to(SOCKET_ROOMS.ROOM(roomId)).emit(CHAT_EVENTS.ROOM_USER_STATUS, {
            userId,
            status,
            roomId,
            timestamp: new Date().toISOString(),
        });
    }

    // ============================================
    // Public Methods for External Services
    // ============================================

    // Method to emit system notifications to teams
    emitTeamNotification(teamId: string, notification: any) {
        this.server.to(SOCKET_ROOMS.TEAM(teamId)).emit(CHAT_EVENTS.TEAM_NOTIFICATION, {
            ...notification,
            timestamp: new Date().toISOString(),
        });
    }

    // Method to emit system notifications to rooms
    emitRoomNotification(roomId: string, notification: any) {
        this.server.to(SOCKET_ROOMS.ROOM(roomId)).emit(CHAT_EVENTS.ROOM_NOTIFICATION, {
            ...notification,
            timestamp: new Date().toISOString(),
        });
    }

    // Method to emit batch processing updates
    emitBatchProcessed(teamId: string, batchInfo: any) {
        this.server.to(SOCKET_ROOMS.TEAM(teamId)).emit(CHAT_EVENTS.BATCH_PROCESSED, {
            ...batchInfo,
            timestamp: new Date().toISOString(),
        });
    }

    // Method to get connected users count
    getConnectedUsersCount(): number {
        return this.connectedUsers.size;
    }

    // Method to get users in a team
    getUsersInTeam(teamId: string): string[] {
        const users: string[] = [];
        for (const [socketId, userInfo] of this.connectedUsers) {
            if (userInfo.teamIds.has(teamId)) {
                users.push(userInfo.userId);
            }
        }
        return [...new Set(users)]; // Remove duplicates
    }

    // Method to get users in a room
    getUsersInRoom(roomId: string): string[] {
        const users: string[] = [];
        for (const [socketId, userInfo] of this.connectedUsers) {
            if (userInfo.roomIds.has(roomId)) {
                users.push(userInfo.userId);
            }
        }
        return [...new Set(users)]; // Remove duplicates
    }
}
