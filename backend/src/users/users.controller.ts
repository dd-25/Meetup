import {
    Body,
    Controller,
    Get,
    Param,
    Post,
    Patch,
    Delete,
    Query,
    UseGuards,
    NotFoundException,
    ForbiddenException,
    BadRequestException,
    InternalServerErrorException,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { CreateUserDto, UpdateUserDto } from './dto/users.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { UtilsService } from '../utils/utils.service';
import { OrganizationRole, TeamRole } from '@prisma/client';

@UseGuards(JwtAuthGuard)
@Controller('users')
export class UsersController {
    constructor(private readonly usersService: UsersService, private readonly utilsService: UtilsService) { }

    @Get()
    async searchUsers(@Query('query') query: string) {
        try {
            return await this.usersService.searchUsers(query);
        } catch (error) {
            throw new InternalServerErrorException(error.message);
        }
    }

    @Get(':id')
    async getUser(@Param('id') id: string) {
        const user = await this.usersService.getUserById(id);
        if (!user) throw new NotFoundException('User not found');
        return user;
    }

    @Patch(':id')
    async updateUser(@Param('id') id: string, @Body() dto: UpdateUserDto) {
        try {
            return await this.usersService.updateUser(id, dto);
        } catch (error) {
            throw new BadRequestException(error.message);
        }
    }

    @Delete(':id')
    async deleteUser(@Param('id') id: string) {
        try {
            return await this.usersService.deleteUser(id);
        } catch (error) {
            throw new InternalServerErrorException(error.message);
        }
    }

    @Get('team/:teamId')
    getUsersOfTeam(@Param('teamId') teamId: string) {
        return this.usersService.getUsersOfTeam(teamId);
    }

    @Get('org/:orgId')
    getUsersOfOrganization(@Param('orgId') orgId: string) {
        return this.usersService.getUsersOfOrganization(orgId);
    }

    @Get('room/:roomId')
    getUsersOfRoom(@Param('roomId') roomId: string) {
        return this.usersService.getUsersOfRoom(roomId);
    }

    @Post(':orgId/add-to-organization/:userId')
    async addUserToOrganization(
        @Param('orgId') orgId: string,
        @Param('userId') userId: string,
        @Query('by') requestedBy: string,
        @Query('role') role: OrganizationRole = OrganizationRole.member,
    ) {
        const isAllowed = await this.utilsService.checkUserIsAdminOrOwner(orgId, requestedBy);
        if (!isAllowed) throw new ForbiddenException('Only admin or owner can add users');
        if (role === OrganizationRole.owner) throw new ForbiddenException('Cannot add owner');
        return this.usersService.addUserToOrganization(orgId, userId, role);
    }

    @Delete(':orgId/remove-from-organization/:userId')
    async removeUserFromOrganization(
        @Param('orgId') orgId: string,
        @Param('userId') userId: string,
        @Query('by') requestedBy: string,
        @Query('role') userRole: OrganizationRole = OrganizationRole.member,
    ) {

        if (userRole === 'owner') throw new ForbiddenException('Cannot remove owner');
        if (userRole === 'admin' && requestedBy !== 'owner') {
            throw new ForbiddenException('Only owner can remove admin');
        }
        if (requestedBy === 'member') {
            throw new ForbiddenException('Members cannot remove anyone');
        }

        return this.usersService.removeUserFromOrganization(orgId, userId);
    }

    @Post(':teamId/add-to-team/:userId')
    async addUserToTeam(
        @Param('teamId') teamId: string,
        @Param('userId') userId: string,
        @Query('by') requestedBy: string,
        @Query('role') role: TeamRole = TeamRole.member,
    ) {
        const [orgId, orgRole, teamRole] = await Promise.all([
            this.utilsService.getOrgIdOfTeam(teamId),
            this.utilsService.getOrganizationRoleByTeam(teamId, requestedBy),
            this.utilsService.getTeamRole(teamId, requestedBy),
        ]);

        const isAllowed =
            orgRole === 'owner' || orgRole === 'admin' || teamRole === 'leader';

        if (!isAllowed)
            throw new ForbiddenException(
                'Only org admin, owner or team leader can add users to team',
            );

        return this.usersService.addUserToTeam(teamId, userId, role);
    }

    @Delete(':teamId/remove-from-team/:userId')
    async removeUserFromTeam(
        @Param('teamId') teamId: string,
        @Param('userId') userId: string,
        @Query('by') requestedBy: string,
    ) {
        const [orgId, orgRole, teamRole] = await Promise.all([
            this.utilsService.getOrgIdOfTeam(teamId),
            this.utilsService.getOrganizationRoleByTeam(teamId, requestedBy),
            this.utilsService.getTeamRole(teamId, requestedBy),
        ]);

        const isAllowed =
            orgRole === 'owner' || orgRole === 'admin' || teamRole === 'leader';

        if (!isAllowed)
            throw new ForbiddenException(
                'Only org admin, owner or team leader can remove users from team',
            );

        return this.usersService.removeUserFromTeam(teamId, userId);
    }

    @Patch(':orgId/edit-org-role/:userId')
    async editOrganizationRole(
        @Param('orgId') orgId: string,
        @Param('userId') userId: string,
        @Query('by') requestedBy: string,
        @Query('role') newRole: OrganizationRole,
    ) {
        const [currentRole, requesterRole] = await Promise.all([
            this.utilsService.getOrganizationRoleByTeam(orgId, userId),
            this.utilsService.getOrganizationRoleByTeam(orgId, requestedBy),
        ]);

        if (currentRole === OrganizationRole.owner)
            throw new ForbiddenException('Cannot edit role of the owner');

        if (newRole === OrganizationRole.owner && requesterRole !== OrganizationRole.owner)
            throw new ForbiddenException('Only owner can assign owner role');

        if (newRole === OrganizationRole.admin && requesterRole !== OrganizationRole.owner)
            throw new ForbiddenException('Only owner can assign admin role');

        return this.usersService.updateOrganizationRole(orgId, userId, newRole);
    }

    @Patch(':teamId/edit-team-role/:userId')
    async editTeamRole(
        @Param('teamId') teamId: string,
        @Param('userId') userId: string,
        @Query('by') requestedBy: string,
        @Query('role') newRole: TeamRole,
    ) {
        const [orgRole] = await Promise.all([
            this.utilsService.getOrganizationRoleByTeam(teamId, requestedBy),
        ]);

        const isOrgAllowed = orgRole === OrganizationRole.owner || orgRole === OrganizationRole.admin;

        if (!isOrgAllowed)
            throw new ForbiddenException('Only org admin/owner can edit team roles');

        return this.usersService.updateTeamRole(teamId, userId, newRole);
    }

}
