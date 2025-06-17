import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateRoomDto, UpdateRoomDto } from './dto/rooms.dto';

@Injectable()
export class RoomsService {
  constructor(private prisma: PrismaService) {}

  async createRoom(dto: CreateRoomDto) {
    const team = await this.prisma.team.findUnique({
      where: { id: dto.teamId },
    });

    if (!team) throw new NotFoundException(`Team with ID '${dto.teamId}' not found`);

    return this.prisma.room.create({
      data: {
        name: dto.name,
        teamId: dto.teamId,
      },
    });
  }

  async getRoomById(id: string) {
    return this.prisma.room.findUnique({
      where: { id },
      include: {
        team: {
          select: { id: true, name: true },
        },
      },
    });
  }

  async updateRoom(id: string, dto: UpdateRoomDto) {
    const existing = await this.prisma.room.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Room with ID '${id}' not found`);

    return this.prisma.room.update({
      where: { id },
      data: { name: dto.name },
    });
  }

  async deleteRoom(id: string) {
    const existing = await this.prisma.room.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Room with ID '${id}' not found`);

    return this.prisma.room.delete({ where: { id } });
  }

  async searchUserRooms(userId: string, query: string) {
    return this.prisma.room.findMany({
      where: {
        team: {
          teamMemberships: {
            some: { userId },
          },
        },
        OR: [
          {
            name: {
              contains: query,
              mode: 'insensitive',
            },
          },
          {
            id: {
              contains: query,
              mode: 'insensitive',
            },
          },
        ],
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

}
