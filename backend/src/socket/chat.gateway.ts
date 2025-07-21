import { WebSocketGateway } from "@nestjs/websockets";
import { Server, Socket } from "socket.io";

@WebSocketGateway({ cors: { origin: '*' } })
export class ChatGateway {
    private server: Server;

    afterInit(server: Server) {
        this.server = server;
    }

    handleConnection(client: Socket) {
        console.log(`Client connected: ${client.id}`);
    }

    handleDisconnect(client: Socket) {
        console.log(`Client disconnected: ${client.id}`);
    }

    sendMessageToRoom(roomId: string, message: string) {
        this.server.to(roomId).emit('message', message);
    }
}