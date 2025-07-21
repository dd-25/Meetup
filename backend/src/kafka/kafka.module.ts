import { Module } from '@nestjs/common';
import { KafkaService } from './kafka.service';
import { KafkaController } from './kafka.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
    imports: [PrismaModule],
    providers: [KafkaService],
    controllers: [KafkaController],
    exports: [KafkaService],
})
export class KafkaModule { }
