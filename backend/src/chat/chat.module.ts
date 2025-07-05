import { Module } from '@nestjs/common';
import { ChatService } from './chat.service';
import { ChatGateway } from './chat.gateway';
import { KafkaService } from '../kafka/kafka.service';

@Module({
    providers: [ChatService, ChatGateway, KafkaService],
    exports: [ChatService],
})
export class ChatModule { }