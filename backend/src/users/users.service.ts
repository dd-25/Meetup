import {
    Injectable,
    NotFoundException,
    BadRequestException,
    InternalServerErrorException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto, UpdateUserDto } from './dto/users.dto';
import { UtilsService } from '../utils/utils.service';
import { OrganizationRole, TeamRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';

@Injectable()
export class UsersService {
    constructor(private prisma: PrismaService, private utils: UtilsService) { }

    async getUserById(id: string) {
        try {
            const user = await this.prisma.user.findUnique({
                where: { id },
                include: {
                    organizationMemberships: true,
                    teamMemberships: true,
                },
            });

            if (!user) throw new NotFoundException('User not found');
            const { password, ...userWithoutPassword } = user;
            return userWithoutPassword;
        } catch (error) {
            throw new InternalServerErrorException(
                'Error fetching user: ' + error.message,
            );
        }
    }

    async updateUser(id: string, dto: UpdateUserDto) {
        try {
            const existingUser = await this.prisma.user.findUnique({ where: { id } });
            if (!existingUser) throw new NotFoundException('User not found');

            // If password is being updated, hash it
            let updateData = { ...dto };
            if (dto.password) {
                updateData.password = await bcrypt.hash(dto.password, 10);
            }

            const updatedUser = await this.prisma.user.update({
                where: { id },
                data: updateData,
            });
            const { password, ...userWithoutPassword } = updatedUser;
            return userWithoutPassword;
        } catch (error) {
            throw new BadRequestException('Failed to update user: ' + error.message);
        }
    }

    async deleteUser(id: string) {
        try {
            const existingUser = await this.prisma.user.findUnique({ where: { id } });
            if (!existingUser) throw new NotFoundException('User not found');

            return await this.prisma.user.delete({ where: { id } });
        } catch (error) {
            throw new InternalServerErrorException(
                'Failed to delete user: ' + error.message,
            );
        }
    }

    async searchUsers(query: string) {
        try {
            if (!query || query.trim() === '') {
                throw new BadRequestException('Search query must not be empty');
            }

            const users = await this.prisma.user.findMany({
                where: {
                    OR: [
                        { name: { contains: query, mode: 'insensitive' } },
                        { id: { contains: query, mode: 'insensitive' } },
                        { email: { contains: query, mode: 'insensitive' } },
                    ],
                },
                orderBy: { name: 'asc' },
                take: 20,
            });
            return users.map(user => {
                const { password, ...userWithoutPassword } = user;
                return userWithoutPassword;
            });
        } catch (error) {
            throw new InternalServerErrorException(
                'Failed to search users: ' + error.message,
            );
        }
    }

    async getUsersOfTeam(teamId: string) {
        try {
            const team = await this.prisma.team.findUnique({
                where: { id: teamId },
                include: {
                    teamMemberships: {
                        include: {
                            user: {
                                select: { 
                                    id: true, 
                                    name: true, 
                                    email: true,
                                    // Add other fields you want to include, but not password
                                },
                            },
                        },
                    },
                },
            });

            if (!team) throw new NotFoundException('Team not found');
            return team.teamMemberships.map((m) => m.user);
        } catch (error) {
            throw new InternalServerErrorException(
                'Failed to get team members: ' + error.message,
            );
        }
    }

    async getUsersOfOrganization(orgId: string) {
        try {
            const org = await this.prisma.organization.findUnique({
                where: { id: orgId },
                include: {
                    memberships: {
                        include: {
                            user: {
                                select: { 
                                    id: true, 
                                    name: true, 
                                    email: true,
                                    // Add other fields you want to include, but not password
                                },
                            },
                        },
                    },
                },
            });

            if (!org) throw new NotFoundException('Organization not found');
            return org.memberships.map((m) => m.user);
        } catch (error) {
            throw new InternalServerErrorException(
                'Failed to get organization members: ' + error.message,
            );
        }
    }

    async getUsersOfRoom(roomId: string) {
        try {
            const room = await this.prisma.room.findUnique({
                where: { id: roomId },
                include: {
                    participants: {
                        include: {
                            user: {
                                select: { 
                                    id: true, 
                                    name: true, 
                                    email: true,
                                    // Add other fields you want to include, but not password
                                },
                            },
                        },
                    },
                },
            });

            if (!room) throw new NotFoundException('Room not found');
            return room.participants.map((p) => p.user);
        } catch (error) {
            throw new InternalServerErrorException(
                'Failed to get room participants: ' + error.message,
            );
        }
    }

    async addUserToOrganization(orgId: string, userId: string, role: OrganizationRole = OrganizationRole.member) {
        const org = await this.prisma.organization.findUnique({ where: { id: orgId } });
        const user = await this.prisma.user.findUnique({ where: { id: userId } });

        if (!org) throw new NotFoundException('Organization not found');
        if (!user) throw new NotFoundException('User not found');

        return this.prisma.organizationMembership.create({
            data: { organizationId: orgId, userId, role },
        });
    }

    async removeUserFromOrganization(orgId: string, userId: string) {
        return this.prisma.organizationMembership.delete({
            where: {
                organizationId_userId: {
                    organizationId: orgId,
                    userId,
                },
            },
        });
    }

    async addUserToTeam(teamId: string, userId: string, role: TeamRole = TeamRole.member) {
        const team = await this.prisma.team.findUnique({ where: { id: teamId } });
        const user = await this.prisma.user.findUnique({ where: { id: userId } });

        if (!team) throw new NotFoundException('Team not found');
        if (!user) throw new NotFoundException('User not found');

        return this.prisma.teamMembership.create({
            data: { teamId, userId, role },
        });
    }

    async removeUserFromTeam(teamId: string, userId: string) {
        return this.prisma.teamMembership.delete({
            where: {
                userId_teamId: {
                    userId,
                    teamId,
                },
            },
        });
    }

    async updateOrganizationRole(orgId: string, userId: string, role: OrganizationRole) {
        const membership = await this.prisma.organizationMembership.findUnique({
          where: {
            organizationId_userId: { organizationId: orgId, userId },
          },
        });
      
        if (!membership) throw new NotFoundException('User not part of organization');
      
        return this.prisma.organizationMembership.update({
          where: {
            organizationId_userId: { organizationId: orgId, userId },
          },
          data: { role },
        });
      }
      
      async updateTeamRole(teamId: string, userId: string, role: TeamRole) {
        const membership = await this.prisma.teamMembership.findUnique({
          where: {
            userId_teamId: { userId, teamId },
          },
        });
      
        if (!membership) throw new NotFoundException('User not part of team');
      
        return this.prisma.teamMembership.update({
          where: {
            userId_teamId: { userId, teamId },
          },
          data: { role },
        });
      }
      
}
