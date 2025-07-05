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
    HttpStatus,
    HttpCode,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { CreateUserDto, UpdateUserDto } from './dto/users.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { UtilsService } from '../utils/utils.service';
import { OrganizationRole, TeamRole } from '@prisma/client';
import { ERROR_MESSAGES, SUCCESS_MESSAGES } from '../shared/constants';
import { SuccessResponseDto, ApiResponseDto } from '../shared/dto';

@UseGuards(JwtAuthGuard)
@Controller('users')
export class UsersController {
    constructor(private readonly usersService: UsersService, private readonly utilsService: UtilsService) { }

    @Get()
    async searchUsers(@Query('query') query: string): Promise<ApiResponseDto> {
        try {
            const users = await this.usersService.searchUsers(query);
            return new SuccessResponseDto('Users retrieved successfully', users);
        } catch (error) {
            throw new InternalServerErrorException(ERROR_MESSAGES.INTERNAL_SERVER_ERROR);
        }
    }

    @Get(':id')
    async getUser(@Param('id') id: string): Promise<ApiResponseDto> {
        const user = await this.usersService.getUserById(id);
        if (!user) throw new NotFoundException(ERROR_MESSAGES.USER_NOT_FOUND);
        return new SuccessResponseDto('User retrieved successfully', user);
    }

    @Patch(':id')
    async updateUser(@Param('id') id: string, @Body() dto: UpdateUserDto): Promise<ApiResponseDto> {
        try {
            const updatedUser = await this.usersService.updateUser(id, dto);
            return new SuccessResponseDto(SUCCESS_MESSAGES.USER_UPDATED, updatedUser);
        } catch (error) {
            throw new BadRequestException(ERROR_MESSAGES.USER_UPDATE_FAILED);
        }
    }

    @Delete(':id')
    @HttpCode(HttpStatus.NO_CONTENT)
    async deleteUser(@Param('id') id: string): Promise<void> {
        try {
            await this.usersService.deleteUser(id);
        } catch (error) {
            throw new InternalServerErrorException(ERROR_MESSAGES.INTERNAL_SERVER_ERROR);
        }
    }

    @Get('team/:teamId')
    async getUsersOfTeam(@Param('teamId') teamId: string): Promise<ApiResponseDto> {
        const users = await this.usersService.getUsersOfTeam(teamId);
        return new SuccessResponseDto('Team users retrieved successfully', users);
    }

    @Get('org/:orgId')
    async getUsersOfOrganization(@Param('orgId') orgId: string): Promise<ApiResponseDto> {
        const users = await this.usersService.getUsersOfOrganization(orgId);
        return new SuccessResponseDto('Organization users retrieved successfully', users);
    }

    @Get('room/:roomId')
    async getUsersOfRoom(@Param('roomId') roomId: string): Promise<ApiResponseDto> {
        const users = await this.usersService.getUsersOfRoom(roomId);
        return new SuccessResponseDto('Room users retrieved successfully', users);
    }

    @Post(':orgId/add-to-organization/:userId')
    async addUserToOrganization(
        @Param('orgId') orgId: string,
        @Param('userId') userId: string,
        @Query('by') requestedBy: string,
        @Query('role') role: OrganizationRole = OrganizationRole.member,
    ): Promise<ApiResponseDto> {
        const isAllowed = await this.utilsService.checkUserIsAdminOrOwner(orgId, requestedBy);
        if (!isAllowed) {
            throw new ForbiddenException(ERROR_MESSAGES.INSUFFICIENT_ORG_PERMISSIONS);
        }
        if (role === OrganizationRole.owner) {
            throw new ForbiddenException('Cannot add owner role');
        }
        
        const result = await this.usersService.addUserToOrganization(orgId, userId, role);
        return new SuccessResponseDto('User added to organization successfully', result);
    }

    @Delete(':orgId/remove-from-organization/:userId')
    async removeUserFromOrganization(
        @Param('orgId') orgId: string,
        @Param('userId') userId: string,
        @Query('by') requestedBy: string,
        @Query('role') userRole: OrganizationRole = OrganizationRole.member,
    ): Promise<ApiResponseDto> {
        if (userRole === OrganizationRole.owner) {
            throw new ForbiddenException('Cannot remove owner');
        }
        
        const requestorRole = await this.utilsService.getOrganizationRoleByUser(orgId, requestedBy);
        
        if (userRole === OrganizationRole.admin && requestorRole !== OrganizationRole.owner) {
            throw new ForbiddenException('Only owner can remove admin');
        }
        
        if (requestorRole === OrganizationRole.member) {
            throw new ForbiddenException(ERROR_MESSAGES.INSUFFICIENT_ORG_PERMISSIONS);
        }

        await this.usersService.removeUserFromOrganization(orgId, userId);
        return new SuccessResponseDto('User removed from organization successfully');
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
