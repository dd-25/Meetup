import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTeamDto, UpdateTeamDto } from './dto/teams.dto';

@Injectable()
export class TeamsService {
  constructor(private prisma: PrismaService) {}

  async createTeam(dto: CreateTeamDto) {
    const org = await this.prisma.organization.findUnique({
      where: { id: dto.organizationId },
    });

    if (!org) {
      throw new NotFoundException(`Organization with ID '${dto.organizationId}' not found`);
    }

    try {
      return await this.prisma.team.create({
        data: {
          name: dto.name,
          organizationId: dto.organizationId,
        },
      });
    } catch (err) {
      throw new BadRequestException('Failed to create team');
    }
  }

  async getTeamById(id: string) {
    const team = await this.prisma.team.findUnique({
      where: { id },
      include: {
        teamMemberships: {
          include: {
            user: {
              select: { id: true, name: true, email: true },
            },
          },
        },
        rooms: true,
      },
    });

    if (!team) {
      throw new NotFoundException(`Team with ID '${id}' not found`);
    }

    return team;
  }

  async updateTeam(id: string, dto: UpdateTeamDto) {
    const existing = await this.prisma.team.findUnique({ where: { id } });

    if (!existing) {
      throw new NotFoundException(`Team with ID '${id}' not found`);
    }

    try {
      return await this.prisma.team.update({
        where: { id },
        data: dto,
      });
    } catch (err) {
      throw new BadRequestException('Failed to update team');
    }
  }

  async deleteTeam(id: string) {
    const existing = await this.prisma.team.findUnique({ where: { id } });

    if (!existing) {
      throw new NotFoundException(`Team with ID '${id}' not found`);
    }

    try {
      return await this.prisma.team.delete({
        where: { id },
      });
    } catch (err) {
      throw new BadRequestException('Failed to delete team');
    }
  }

  async searchUserTeams(userId: string, query: string) {
    if (!query.trim()) {
      throw new BadRequestException('Search query cannot be empty');
    }

    return this.prisma.team.findMany({
      where: {
        teamMemberships: {
          some: {
            userId,
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
        name: 'asc',
      },
    });
  }
}
