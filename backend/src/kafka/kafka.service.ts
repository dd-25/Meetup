import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { Kafka, Producer, Consumer, EachMessagePayload } from 'kafkajs';
import { ChatGateway } from '../chat/chat.gateway';
import { RedisService } from '../redis/redis.service';
import { TempChatMessageDto, PersistentChatMessageDto } from '../chat/dto';

@Injectable()
export class KafkaService implements OnModuleInit, OnModuleDestroy {
    private readonly logger = new Logger(KafkaService.name);
    private kafka: Kafka;
    private producer: Producer;
    private consumer: Consumer;
    private readonly tempChatTopic: string;
    private readonly persistentChatTopic: string;

    constructor(private readonly redisService: RedisService) {
        // Validate and set required environment variables
        this.tempChatTopic = process.env.KAFKA_TEMP_CHAT_TOPIC || 'temp-chat';
        this.persistentChatTopic = process.env.KAFKA_PERSISTENT_CHAT_TOPIC || 'persistent-chat';

        this.kafka = new Kafka({
            clientId: process.env.KAFKA_CLIENT_ID || 'meetup-client',
            brokers: [process.env.KAFKA_BROKER || 'localhost:9092'],
        });

        this.producer = this.kafka.producer();
        this.consumer = this.kafka.consumer({
            groupId: process.env.KAFKA_GROUP_ID || 'meetup-group',
        });
    } async onModuleInit() {
        try {
            await this.producer.connect();
            await this.consumer.connect();

            // Subscribe to both chat topics
            await this.consumer.subscribe({ topic: this.tempChatTopic, fromBeginning: false });
            await this.consumer.subscribe({ topic: this.persistentChatTopic, fromBeginning: false });

            await this.consumer.run({
                eachMessage: async (payload: EachMessagePayload) => {
                    try {
                        const value = payload.message.value?.toString();
                        const topic = payload.topic;

                        if (value) {
                            const data = JSON.parse(value);
                            this.logger.log(`Consumed message from topic [${topic}] with ID: ${data.id}`);

                            if (topic === this.tempChatTopic) {
                                await this.handleTempChat(data);
                            } else if (topic === this.persistentChatTopic) {
                                await this.handlePersistentChat(data);
                            }
                            
                            // Message is automatically acknowledged if no error is thrown
                            // Kafka will handle message deletion from topic based on retention policy
                        }
                    } catch (error) {
                        this.logger.error('Error processing message:', error);
                        // If we throw here, Kafka will retry the message
                        // For now, we'll log and continue to avoid infinite retries
                    }
                },
            });

            this.logger.log('Kafka connected and subscribed to chat topics');
        } catch (error) {
            this.logger.error('Failed to initialize Kafka:', error);
            throw error;
        }
    }

    async produceTempChat(message: TempChatMessageDto): Promise<void> {
        await this.producer.send({
            topic: this.tempChatTopic,
            messages: [{ value: JSON.stringify(message) }],
        });
        this.logger.log('Produced temp chat:', message);
    }

    async producePersistentChat(message: PersistentChatMessageDto): Promise<void> {
        await this.producer.send({
            topic: this.persistentChatTopic,
            messages: [{ value: JSON.stringify(message) }],
        });
        this.logger.log('Produced persistent chat:', message);
    }
    
    private async handleTempChat(data: TempChatMessageDto): Promise<void> {
        // Temp chat is room-specific, emit to roomId
        ChatGateway.emitToRoom(data.roomId, 'chat-message', data);
        this.logger.log(`Emitted temp chat to room: ${data.roomId}`);
    }

    private async handlePersistentChat(data: PersistentChatMessageDto): Promise<void> {
        // Persistent chat is team-wide, emit to teamId
        ChatGateway.emitToTeam(data.teamId, 'chat-message', data);
        
        // Push to Redis for batch DB write
        try {
            await this.redisService.addChatToBatch({
                id: data.id,
                content: data.content,
                mediaUrl: data.mediaUrl,
                mediaType: data.mediaType,
                mimeType: data.mimeType,
                organizationId: data.organizationId,
                teamId: data.teamId,
                senderId: data.senderId,
                createdAt: data.createdAt || new Date().toISOString(),
            });
            this.logger.log(`Added persistent chat ${data.id} to batch queue for team: ${data.teamId}`);
        } catch (error) {
            this.logger.error('Failed to add chat to batch queue:', error);
        }
        
        this.logger.log(`Emitted persistent chat to team: ${data.teamId}`);
    }

    async onModuleDestroy() {
        try {
            await this.producer.disconnect();
            await this.consumer.disconnect();
            this.logger.log('Kafka connections closed successfully');
        } catch (error) {
            this.logger.error('Error closing Kafka connections:', error);
        }
    }
}