import {
    WebSocketGateway,
    SubscribeMessage,
    MessageBody,
    ConnectedSocket,
    OnGatewayConnection,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Socket, Server } from 'socket.io';
import { ChatService } from './chat.service';
import { CreateChatMessageDto, JoinChatRoomDto, MessageSentConfirmationDto } from './dto';

@WebSocketGateway({
    cors: {
        origin: '*',
    },
})
export class ChatGateway implements OnGatewayConnection {
    private readonly logger = new Logger(ChatGateway.name);
    static server: Server;

    afterInit(server: Server): void {
        ChatGateway.server = server;
    }

    constructor(private readonly chatService: ChatService) { }

    handleConnection(client: Socket): void {
        console.log(`Client connected: ${client.id}`);
    }

    static emitToRoom(roomId: string, event: string, data: unknown): void {
        if (ChatGateway.server) {
            ChatGateway.server.to(roomId).emit(event, data);
        }
    }

    static emitToTeam(teamId: string, event: string, data: unknown): void {
        if (ChatGateway.server) {
            ChatGateway.server.to(teamId).emit(event, data);
        }
    }

    @SubscribeMessage('join-chat-room')
    async handleJoinChatRoom(@ConnectedSocket() client: Socket, @MessageBody() payload: JoinChatRoomDto) {
        await client.join(payload.roomId);
        this.logger.log(`Client ${client.id} joined chat room: ${payload.roomId}`);
    }

    @SubscribeMessage('leave-chat-room') 
    async handleLeaveChatRoom(@ConnectedSocket() client: Socket, @MessageBody() payload: JoinChatRoomDto) {
        await client.leave(payload.roomId);
        this.logger.log(`Client ${client.id} left chat room: ${payload.roomId}`);
    }

    @SubscribeMessage('send-chat')
    async handleSendChat(@ConnectedSocket() client: Socket, @MessageBody() payload: CreateChatMessageDto) {
        // Validate required fields
        if (!payload?.content && !payload?.mediaUrl) {
            client.emit('error', 'Empty message or media');
            return;
        }

        if (!payload.organizationId || !payload.teamId || !payload.senderId) {
            client.emit('error', 'Missing required fields: organizationId, teamId, or senderId');
            return;
        }

        try {
            const result = await this.chatService.sendMessage(payload);
            
            // Send confirmation back to sender
            const confirmation: MessageSentConfirmationDto = {
                messageId: result.messageId,
                status: result.status as 'sent',
                timestamp: new Date().toISOString()
            };
            client.emit('message-sent', confirmation);
            
            this.logger.log(`Message sent successfully: ${result.messageId}`);
        } catch (error) {
            this.logger.error('Error sending message:', error);
            client.emit('error', 'Failed to send message');
        }
    }
}
