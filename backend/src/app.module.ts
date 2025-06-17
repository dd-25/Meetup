import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { OrganizationsModule } from './organizations/organizations.module';
import { TeamsModule } from './teams/teams.module';
import { RoomsModule } from './rooms/rooms.module';
import { PrismaModule } from './prisma/prisma.module';
import { UtilsModule } from './utils/utils.module';
import { SocketModule } from './socket/socket.module';
import { MediasoupService } from './mediasoup/mediasoup.service';
import { RedisService } from './redis/redis.service';
import { RedisModule } from './redis/redis.module';
import { MediasoupModule } from './mediasoup/mediasoup.module';

@Module({
  controllers: [AppController],
  providers: [AppService, MediasoupService, RedisService],
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    PrismaModule,
    AuthModule,
    UsersModule,
    OrganizationsModule,
    TeamsModule,
    RoomsModule,
    UtilsModule,
    SocketModule,
    RedisModule,
    MediasoupModule,
  ],
})
export class AppModule {}
