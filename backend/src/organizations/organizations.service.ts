import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { OrganizationRole, TeamRole } from '@prisma/client';

@Injectable()
export class OrganizationsService {
  constructor(private readonly prisma: PrismaService) { }

  // Create organization and add creator as owner
  async create(name: string, userId: string) {
    const organization = await this.prisma.organization.create({
      data: {
        name,
        memberships: {
          create: {
            userId,
            role: OrganizationRole.owner,
          },
        },
        teams: {
          create: {
            name: 'All',
            teamMemberships: {
              create: {
                userId,
                role: TeamRole.leader,
              },
            },
          },
        },
      },
      include: {
        memberships: true,
        teams: {
          include: {
            teamMemberships: true,
          },
        },
      },
    });
  
    return organization;  
  }  

  async searchUserOrganizations(userId: string, query: string) {
    return this.prisma.organization.findMany({
      where: {
        memberships: {
          some: { userId },
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
            },
          },
        ],
      },
      orderBy: {
        name: 'asc',
      },
    });
  }

  // Get organization by id
  async getOrganizationById(orgId: string) {
    return this.prisma.organization.findUnique({
      where: { id: orgId },
      include: {
        memberships: {
          include: {
            user: true,
          },
        },
      },
    });
  }

  // Update organization name
  async updateOrganizationName(orgId: string, newName: string) {
    // check if org exists
    const org = await this.prisma.organization.findUnique({ where: { id: orgId } });
    if (!org) throw new NotFoundException('Organization not found');

    return this.prisma.organization.update({
      where: { id: orgId },
      data: { name: newName },
    });
  }

  // Delete organization
  async deleteOrganization(orgId: string) {
    // optional: cascade delete related teams, memberships etc via DB or code

    return this.prisma.organization.delete({
      where: { id: orgId },
    });
  }
}