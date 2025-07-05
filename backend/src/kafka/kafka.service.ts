import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { Kafka, Producer, Consumer, EachMessagePayload } from 'kafkajs';
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
        // Note: Chat emission will be handled by the ChatGateway listening to Kafka messages
        // This decouples the services and avoids circular dependency
        this.logger.log(`Processed temp chat message for room: ${data.roomId}`);
    }

    private async handlePersistentChat(data: PersistentChatMessageDto): Promise<void> {
        // Note: Chat emission will be handled by the ChatGateway listening to Kafka messages
        // This decouples the services and avoids circular dependency
        
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
        
        this.logger.log(`Processed persistent chat message for team: ${data.teamId}`);
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

    // Kafka monitoring methods
    async getHealth(): Promise<{ status: string; brokers: string[]; connected: boolean; uptime: number }> {
        try {
            const admin = this.kafka.admin();
            await admin.connect();
            
            // Get cluster metadata to check health
            const metadata = await admin.describeCluster();
            await admin.disconnect();
            
            return {
                status: 'healthy',
                brokers: metadata.brokers.map(broker => `${broker.host}:${broker.port}`),
                connected: true,
                uptime: process.uptime(),
            };
        } catch (error) {
            this.logger.error('Error checking Kafka health:', error);
            return {
                status: 'unhealthy',
                brokers: [process.env.KAFKA_BROKER || 'localhost:9092'],
                connected: false,
                uptime: process.uptime(),
            };
        }
    }

    async getTopics(): Promise<{ name: string; partitions: number; replicationFactor: number }[]> {
        try {
            const admin = this.kafka.admin();
            await admin.connect();
            
            const metadata = await admin.fetchTopicMetadata();
            const topics = metadata.topics.map(topic => ({
                name: topic.name,
                partitions: topic.partitions.length,
                replicationFactor: topic.partitions[0]?.replicas.length || 0,
            }));
            
            await admin.disconnect();
            return topics;
        } catch (error) {
            this.logger.error('Error fetching Kafka topics:', error);
            throw new Error('Failed to fetch Kafka topics');
        }
    }

    async getTopicMessages(
        topic: string, 
        limit: number = 10, 
        offset: number = 0
    ): Promise<{ partition: number; offset: string; timestamp: string; key?: string; value: any }[]> {
        try {
            // Create a temporary consumer for reading messages
            const tempConsumer = this.kafka.consumer({ 
                groupId: `temp-reader-${Date.now()}`,
                // Use earliest to read from beginning
                sessionTimeout: 6000,
                heartbeatInterval: 3000,
            });
            
            await tempConsumer.connect();
            await tempConsumer.subscribe({ topic, fromBeginning: true });
            
            const messages: { partition: number; offset: string; timestamp: string; key?: string; value: any }[] = [];
            let messageCount = 0;
            let skippedCount = 0;
            
            await tempConsumer.run({
                eachMessage: async ({ message, partition }) => {
                    // Skip messages until we reach the offset
                    if (skippedCount < offset) {
                        skippedCount++;
                        return;
                    }
                    
                    // Stop if we've collected enough messages
                    if (messageCount >= limit) {
                        return;
                    }
                    
                    let parsedValue: any;
                    try {
                        parsedValue = message.value ? JSON.parse(message.value.toString()) : null;
                    } catch {
                        parsedValue = message.value?.toString() || null;
                    }
                    
                    messages.push({
                        partition,
                        offset: message.offset,
                        timestamp: new Date(Number(message.timestamp)).toISOString(),
                        key: message.key?.toString(),
                        value: parsedValue,
                    });
                    
                    messageCount++;
                },
            });
            
            // Give some time to collect messages, then disconnect
            await new Promise(resolve => setTimeout(resolve, 2000));
            await tempConsumer.disconnect();
            
            return messages;
        } catch (error) {
            this.logger.error(`Error fetching messages from topic ${topic}:`, error);
            throw new Error(`Failed to fetch messages from topic ${topic}`);
        }
    }

    async getConsumerGroups(): Promise<{ groupId: string; state: string; members: number; topics: string[] }[]> {
        try {
            const admin = this.kafka.admin();
            await admin.connect();
            
            const groups = await admin.listGroups();
            const groupDetails = await Promise.all(
                groups.groups.map(async (group) => {
                    try {
                        const groupDescription = await admin.describeGroups([group.groupId]);
                        const groupInfo = groupDescription.groups[0];
                        
                        // Extract topics from member assignments
                        const topics = new Set<string>();
                        groupInfo.members.forEach(member => {
                            // memberAssignment is a Buffer, we need to decode it
                            try {
                                if (member.memberMetadata) {
                                    // For now, we'll just track that they have assignments
                                    // The actual topic extraction would require parsing the assignment protocol
                                }
                            } catch (error) {
                                // Ignore parsing errors
                            }
                        });

                        return {
                            groupId: group.groupId,
                            state: groupInfo.state,
                            members: groupInfo.members.length,
                            topics: Array.from(topics),
                        };
                    } catch (error) {
                        this.logger.warn(`Failed to describe group ${group.groupId}:`, error);
                        return {
                            groupId: group.groupId,
                            state: 'unknown',
                            members: 0,
                            topics: [],
                        };
                    }
                })
            );
            
            await admin.disconnect();
            return groupDetails;
        } catch (error) {
            this.logger.error('Error fetching consumer groups:', error);
            throw new Error('Failed to fetch consumer groups');
        }
    }
}