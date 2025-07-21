/*
 * Kafka Service Implementation
 * 
 * Requirements:
 * - Receive messages from team chat (permanent)
 * - One topic named 'chat-messages' with multiple partitions for each team
 * - Batch write after every 100 messages per team
 * - On successful write, delete messages from Kafka topic
 * - On failure, retry (max 3 retries)
 * - Only unique messages stored in database
 * - After 3 retries, move to dead letter queue for manual intervention
 */

import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { Kafka, Producer, Consumer, Admin, EachMessagePayload, RecordMetadata } from 'kafkajs';
import { PrismaService } from '../prisma/prisma.service';
import {
    ChatMessageDto,
    DeadLetterMessageDto,
    KafkaHealthDto,
    BatchProcessingStatsDto
} from '../chat/dto';
import { MEDIA_TYPES } from '../shared/constants';
import {
    KAFKA_TOPICS,
    KAFKA_CONSUMER,
    KAFKA_PRODUCER,
    KAFKA_CONNECTION,
    KAFKA_BATCH,
    KAFKA_TOPIC_CONFIG,
    KAFKA_DEFAULTS
} from './constants';

// Internal interfaces for service logic
interface MessageBatch {
    teamId: string;
    messages: ChatMessageDto[];
    partition: number;
    lastOffset: string;
}

@Injectable()
export class KafkaService implements OnModuleInit, OnModuleDestroy {
    private readonly logger = new Logger(KafkaService.name);
    private kafka: Kafka;
    private producer: Producer;
    private consumer: Consumer;
    private admin: Admin;
    private isConnected: boolean = false;

    // Configuration using constants
    private readonly CHAT_TOPIC = KAFKA_TOPICS.CHAT_MESSAGES;
    private readonly DEAD_LETTER_TOPIC = KAFKA_TOPICS.DEAD_LETTER_QUEUE;
    private readonly BATCH_SIZE = KAFKA_BATCH.SIZE;
    private readonly MAX_RETRIES = KAFKA_BATCH.MAX_RETRIES;
    private readonly CONSUMER_GROUP = KAFKA_CONSUMER.GROUP_ID;

    // In-memory storage for batching
    private messageBatches: Map<string, ChatMessageDto[]> = new Map();
    private partitionOffsets: Map<string, string> = new Map();

    constructor(private readonly prismaService: PrismaService) {
        this.kafka = new Kafka({
            clientId: process.env.KAFKA_CLIENT_ID || KAFKA_DEFAULTS.CLIENT_ID,
            brokers: [process.env.KAFKA_BROKER || KAFKA_DEFAULTS.BROKER],
            retry: {
                initialRetryTime: KAFKA_CONNECTION.INITIAL_RETRY_TIME,
                retries: KAFKA_CONNECTION.MAX_RETRIES,
            },
        });

        this.producer = this.kafka.producer({
            maxInFlightRequests: KAFKA_PRODUCER.MAX_IN_FLIGHT_REQUESTS,
            idempotent: KAFKA_PRODUCER.IDEMPOTENT,
            transactionTimeout: KAFKA_PRODUCER.TRANSACTION_TIMEOUT,
        });

        this.consumer = this.kafka.consumer({
            groupId: this.CONSUMER_GROUP,
            sessionTimeout: KAFKA_CONSUMER.SESSION_TIMEOUT,
            heartbeatInterval: KAFKA_CONSUMER.HEARTBEAT_INTERVAL,
        });

        this.admin = this.kafka.admin();
    }

    async onModuleInit() {
        try {
            await this.connectKafka();
            await this.ensureTopicsExist();
            await this.startConsuming();
            this.isConnected = true;
            this.logger.log('Kafka service initialized successfully');
        } catch (error) {
            this.logger.error('Failed to initialize Kafka service:', error);
            this.isConnected = false;
            // Don't throw - allow application to start without Kafka
        }
    }

    async onModuleDestroy() {
        try {
            await this.consumer.disconnect();
            await this.producer.disconnect();
            await this.admin.disconnect();
            this.logger.log('Kafka connections closed');
        } catch (error) {
            this.logger.error('Error closing Kafka connections:', error);
        }
    }

    private async connectKafka(): Promise<void> {
        this.logger.log('Connecting to Kafka...');
        await Promise.all([
            this.producer.connect(),
            this.consumer.connect(),
            this.admin.connect(),
        ]);
        this.logger.log('Connected to Kafka successfully');
    }

    private async ensureTopicsExist(): Promise<void> {
        const topics = await this.admin.listTopics();

        const topicsToCreate: any[] = [];
        if (!topics.includes(this.CHAT_TOPIC)) {
            topicsToCreate.push({
                topic: this.CHAT_TOPIC,
                numPartitions: KAFKA_TOPIC_CONFIG.CHAT_PARTITIONS,
                replicationFactor: KAFKA_TOPIC_CONFIG.REPLICATION_FACTOR,
                configEntries: [
                    { name: 'cleanup.policy', value: KAFKA_TOPIC_CONFIG.CHAT_CLEANUP_POLICY },
                    { name: 'retention.ms', value: KAFKA_TOPIC_CONFIG.CHAT_RETENTION_MS },
                    { name: 'max.message.bytes', value: KAFKA_TOPIC_CONFIG.CHAT_MAX_MESSAGE_BYTES },
                ],
            });
        }

        if (!topics.includes(this.DEAD_LETTER_TOPIC)) {
            topicsToCreate.push({
                topic: this.DEAD_LETTER_TOPIC,
                numPartitions: KAFKA_TOPIC_CONFIG.DLQ_PARTITIONS,
                replicationFactor: KAFKA_TOPIC_CONFIG.REPLICATION_FACTOR,
                configEntries: [
                    { name: 'cleanup.policy', value: KAFKA_TOPIC_CONFIG.DLQ_CLEANUP_POLICY },
                    { name: 'retention.ms', value: KAFKA_TOPIC_CONFIG.DLQ_RETENTION_MS },
                ],
            });
        }

        if (topicsToCreate.length > 0) {
            await this.admin.createTopics({ topics: topicsToCreate });
            this.logger.log(`Created topics: ${topicsToCreate.map(t => t.topic).join(', ')}`);
        }
    }

    private async startConsuming(): Promise<void> {
        await this.consumer.subscribe({
            topic: this.CHAT_TOPIC,
            fromBeginning: false
        });

        await this.consumer.run({
            eachMessage: async (payload: EachMessagePayload) => {
                try {
                    await this.processMessage(payload);
                } catch (error) {
                    this.logger.error('Error processing message:', error);
                    // Don't throw to avoid stopping the consumer
                }
            },
        });

        this.logger.log('Started consuming chat messages');
    }

    private async processMessage(payload: EachMessagePayload): Promise<void> {
        const { message, partition } = payload;

        if (!message.value) {
            this.logger.warn('Received empty message');
            return;
        }

        try {
            const chatMessage: ChatMessageDto = JSON.parse(message.value.toString());
            const teamId = chatMessage.teamId;

            // Add message to batch for this team
            if (!this.messageBatches.has(teamId)) {
                this.messageBatches.set(teamId, []);
            }

            const batch = this.messageBatches.get(teamId)!;
            batch.push(chatMessage);

            // Store the latest offset for this partition
            const partitionKey = `${partition}`;
            this.partitionOffsets.set(partitionKey, message.offset);

            this.logger.debug(`Added message to batch for team ${teamId}. Batch size: ${batch.length}`);

            // Process batch if it reaches the threshold
            if (batch.length >= this.BATCH_SIZE) {
                await this.processBatch(teamId, batch, partition, message.offset);
            }

        } catch (error) {
            this.logger.error('Failed to parse message:', error);
            // Send malformed message to DLQ
            await this.sendToDeadLetterQueue({
                originalMessage: {
                    id: 'unknown',
                    teamId: 'unknown',
                    userId: 'unknown',
                    content: message.value.toString(),
                    mediaType: MEDIA_TYPES.TEXT,
                    createdAt: new Date(),
                },
                error: `Malformed message: ${error.message}`,
                failedAt: new Date(),
                retryCount: 0,
            });
        }
    }

    private async processBatch(
        teamId: string,
        messages: ChatMessageDto[],
        partition: number,
        lastOffset: string
    ): Promise<void> {
        this.logger.log(`Processing batch of ${messages.length} messages for team ${teamId}`);

        let retryCount = 0;
        const maxRetries = this.MAX_RETRIES;

        while (retryCount <= maxRetries) {
            try {
                await this.saveBatchToDatabase(messages);

                // Success - clear the batch and commit offset
                this.messageBatches.set(teamId, []);
                await this.consumer.commitOffsets([
                    {
                        topic: this.CHAT_TOPIC,
                        partition,
                        offset: (parseInt(lastOffset) + 1).toString(),
                    },
                ]);

                this.logger.log(`Successfully processed batch for team ${teamId}`);
                return;

            } catch (error) {
                retryCount++;
                this.logger.error(`Batch processing failed (attempt ${retryCount}/${maxRetries + 1}):`, error);

                if (retryCount > maxRetries) {
                    // Send all messages in batch to DLQ
                    for (const message of messages) {
                        await this.sendToDeadLetterQueue({
                            originalMessage: { ...message, retryCount },
                            error: error.message,
                            failedAt: new Date(),
                            retryCount,
                        });
                    }

                    // Clear the failed batch and commit offset to skip these messages
                    this.messageBatches.set(teamId, []);
                    await this.consumer.commitOffsets([
                        {
                            topic: this.CHAT_TOPIC,
                            partition,
                            offset: (parseInt(lastOffset) + 1).toString(),
                        },
                    ]);

                    this.logger.error(`Moved batch for team ${teamId} to dead letter queue after ${maxRetries} retries`);
                    return;
                }

                // Wait before retrying (exponential backoff)
                const delay = Math.min(
                    KAFKA_BATCH.RETRY_DELAY_BASE * Math.pow(2, retryCount - 1), 
                    KAFKA_BATCH.MAX_RETRY_DELAY
                );
                await this.sleep(delay);
            }
        }
    }

    private async saveBatchToDatabase(messages: ChatMessageDto[]): Promise<void> {
        // Use transaction for atomic batch insert
        await this.prismaService.$transaction(async (prisma) => {
            // Remove duplicates based on message ID
            const uniqueMessages = messages.filter((message, index, self) =>
                index === self.findIndex(m => m.id === message.id)
            );

            if (uniqueMessages.length !== messages.length) {
                this.logger.warn(`Filtered ${messages.length - uniqueMessages.length} duplicate messages`);
            }

            // Batch insert with upsert to handle potential duplicates
            for (const message of uniqueMessages) {
                await prisma.chat.upsert({
                    where: { id: message.id },
                    update: {}, // Don't update if exists
                    create: {
                        id: message.id,
                        teamId: message.teamId,
                        userId: message.userId,
                        content: message.content,
                        url: message.url,
                        mediaType: message.mediaType,
                        createdAt: message.createdAt,
                    },
                });
            }

            this.logger.log(`Saved ${uniqueMessages.length} unique messages to database`);
        });
    }

    private async sendToDeadLetterQueue(deadLetterMessage: DeadLetterMessageDto): Promise<void> {
        try {
            await this.producer.send({
                topic: this.DEAD_LETTER_TOPIC,
                messages: [
                    {
                        key: deadLetterMessage.originalMessage.id,
                        value: JSON.stringify(deadLetterMessage),
                        timestamp: Date.now().toString(),
                    },
                ],
            });

            this.logger.warn(`Sent message ${deadLetterMessage.originalMessage.id} to dead letter queue`);
        } catch (error) {
            this.logger.error('Failed to send message to dead letter queue:', error);
        }
    }

    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // Public methods for producing messages
    async publishChatMessage(message: ChatMessageDto): Promise<RecordMetadata[] | null> {
        if (!this.isConnected) {
            this.logger.warn('Kafka not connected - unable to publish message');
            return null;
        }

        try {
            // Use teamId as partition key to ensure messages from same team go to same partition
            const result = await this.producer.send({
                topic: this.CHAT_TOPIC,
                messages: [
                    {
                        key: message.teamId,
                        value: JSON.stringify(message),
                        timestamp: message.createdAt.getTime().toString(),
                    },
                ],
            });

            this.logger.log(`Published message ${message.id} for team ${message.teamId}`);
            return result;
        } catch (error) {
            this.logger.error('Failed to publish chat message:', error);
            return null;
        }
    }

    // Health check and monitoring methods
    async getHealth(): Promise<KafkaHealthDto> {
        try {
            const metadata = await this.admin.fetchTopicMetadata({ topics: [this.CHAT_TOPIC] });

            const batches: BatchProcessingStatsDto[] = Array.from(this.messageBatches.entries()).map(([teamId, messages]) => ({
                teamId,
                messageCount: messages.length,
                pendingBatch: messages.length > 0,
            }));

            return {
                status: 'healthy',
                connected: this.isConnected,
                batches,
            };
        } catch (error) {
            return {
                status: 'unhealthy',
                connected: false,
                batches: [],
            };
        }
    }

    async getTopicInfo(): Promise<any> {
        try {
            const metadata = await this.admin.fetchTopicMetadata({
                topics: [this.CHAT_TOPIC, this.DEAD_LETTER_TOPIC]
            });
            return metadata;
        } catch (error) {
            this.logger.error('Failed to fetch topic info:', error);
            throw error;
        }
    }

    async getDeadLetterMessages(limit: number = KAFKA_DEFAULTS.DEAD_LETTER_LIMIT): Promise<DeadLetterMessageDto[]> {
        // This would require a separate consumer for the DLQ topic
        // For now, return empty array - can be implemented if needed
        return [];
    }

    // Force process pending batches (useful for shutdown or manual intervention)
    async forceProcessPendingBatches(): Promise<void> {
        for (const [teamId, messages] of this.messageBatches.entries()) {
            if (messages.length > 0) {
                this.logger.log(`Force processing ${messages.length} pending messages for team ${teamId}`);
                await this.processBatch(teamId, messages, 0, '0');
            }
        }
    }

    get connected(): boolean {
        return this.isConnected;
    }
}