import { Module } from '@nestjs/common';
import { ChatService } from './chat.service';
import { ChatGateway } from './chat.gateway';
import { KafkaModule } from '../kafka/kafka.module';

@Module({
    imports: [KafkaModule],
    providers: [ChatService, ChatGateway],
    exports: [ChatService],
})
export class ChatModule { }