import { Controller, Get, Param, UseGuards, Query, ParseIntPipe, DefaultValuePipe } from '@nestjs/common';
import { KafkaService } from './kafka.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ApiResponseDto, SuccessResponseDto, ErrorResponseDto } from '../shared/dto';

@UseGuards(JwtAuthGuard)
@Controller('admin/kafka')
export class KafkaController {
  constructor(private readonly kafkaService: KafkaService) {}

  @Get('health')
  async getKafkaHealth(): Promise<ApiResponseDto> {
    try {
      const health = await this.kafkaService.getHealth();
      return new SuccessResponseDto('Kafka health retrieved', health);
    } catch (error) {
      return new ErrorResponseDto('Failed to retrieve Kafka health', error.message);
    }
  }

  @Get('topics')
  async getTopics(): Promise<ApiResponseDto> {
    try {
      const topics = await this.kafkaService.getTopics();
      return new SuccessResponseDto('Kafka topics retrieved', topics);
    } catch (error) {
      return new ErrorResponseDto('Failed to retrieve Kafka topics', error.message);
    }
  }

  @Get('topics/:topic/messages')
  async getTopicMessages(
    @Param('topic') topic: string,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
    @Query('offset', new DefaultValuePipe(0), ParseIntPipe) offset: number,
  ): Promise<ApiResponseDto> {
    try {
      // Validate parameters
      if (limit < 1 || limit > 100) {
        return new ErrorResponseDto('Invalid limit parameter', 'Limit must be between 1 and 100');
      }
      if (offset < 0) {
        return new ErrorResponseDto('Invalid offset parameter', 'Offset must be non-negative');
      }

      const messages = await this.kafkaService.getTopicMessages(topic, limit, offset);
      return new SuccessResponseDto('Topic messages retrieved', {
        topic,
        limit,
        offset,
        count: messages.length,
        messages,
      });
    } catch (error) {
      return new ErrorResponseDto('Failed to retrieve topic messages', error.message);
    }
  }

  @Get('consumer-groups')
  async getConsumerGroups(): Promise<ApiResponseDto> {
    try {
      const groups = await this.kafkaService.getConsumerGroups();
      return new SuccessResponseDto('Consumer groups retrieved', groups);
    } catch (error) {
      return new ErrorResponseDto('Failed to retrieve consumer groups', error.message);
    }
  }
}
