import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Param,
  Query,
  Body,
  NotFoundException,
  BadRequestException,
  UseGuards,
} from '@nestjs/common';
import { RoomsService } from './rooms.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreateRoomDto, UpdateRoomDto } from './dto/rooms.dto';

@UseGuards(JwtAuthGuard)
@Controller('rooms')
export class RoomsController {
  constructor(private readonly roomsService: RoomsService) {}

  @Post()
  async createRoom(@Body() dto: CreateRoomDto) {
    return this.roomsService.createRoom(dto);
  }

  @Get(':id')
  async getRoom(@Param('id') id: string) {
    const room = await this.roomsService.getRoomById(id);
    if (!room) throw new NotFoundException(`Room with ID '${id}' not found`);
    return room;
  }

  @Patch(':id')
  async updateRoom(@Param('id') id: string, @Body() dto: UpdateRoomDto) {
    return this.roomsService.updateRoom(id, dto);
  }

  @Delete(':id')
  async deleteRoom(@Param('id') id: string) {
    return this.roomsService.deleteRoom(id);
  }

  @Get()
  async searchRooms(
    @Query('userId') userId: string,
    @Query('query') query: string,
  ) {
    if (!query?.trim()) throw new BadRequestException('Search query cannot be empty');
    return this.roomsService.searchUserRooms(userId, query.trim());
  }
}
