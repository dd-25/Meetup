import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { OrganizationRole, TeamRole } from '@prisma/client';

@Injectable()
export class UtilsService {
  constructor(private readonly prisma: PrismaService) { }

    // Check if user is owner of organization
  async checkUserIsOwner(orgId: string, userId: string) {
    const membership = await this.prisma.organizationMembership.findUnique({
      where: {
        organizationId_userId: {
          organizationId: orgId,
          userId,
        },
      },
    });
    return membership?.role === OrganizationRole.owner;
  }

  // Check if user is admin or owner
  async checkUserIsAdminOrOwner(orgId: string, userId: string) {
    const membership = await this.prisma.organizationMembership.findUnique({
      where: {
        organizationId_userId: {
          organizationId: orgId,
          userId,
        },
      },
    });
    return membership && (membership.role === OrganizationRole.owner || membership.role === OrganizationRole.admin);
  }

  // Check if user is team leader of a team
async checkUserIsTeamLeader(teamId: string, userId: string) {
    const membership = await this.prisma.teamMembership.findUnique({
      where: {
        userId_teamId: {
          userId,
          teamId,
        },
      },
    });
  
    return membership?.role === TeamRole.leader;
  }
  
  async getOrgIdOfTeam(teamId: string): Promise<string> {
    const team = await this.prisma.team.findUnique({
      where: { id: teamId },
      select: { organizationId: true },
    });

    if (!team) throw new NotFoundException('Team not found');
    return team.organizationId;
  }

  async getOrganizationRoleByTeam(teamId: string, userId: string): Promise<OrganizationRole> {
    const team = await this.prisma.team.findUnique({
      where: { id: teamId },
      select: { organizationId: true },
    });

    if (!team) throw new NotFoundException('Team not found');

    const membership = await this.prisma.organizationMembership.findUnique({
      where: {
        organizationId_userId: {
          organizationId: team.organizationId,
          userId,
        },
      },
      select: { role: true },
    });

    return membership?.role ?? OrganizationRole.member;
  }

  async getTeamRole(teamId: string, userId: string): Promise<TeamRole> {
    const membership = await this.prisma.teamMembership.findUnique({
      where: {
        userId_teamId: {
          teamId,
          userId,
        },
      },
      select: { role: true },
    });

    return membership?.role ?? TeamRole.member;
  }

}
