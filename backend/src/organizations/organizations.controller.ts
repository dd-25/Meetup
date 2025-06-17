import {
  Controller,
  Post,
  Body,
  Get,
  Param,
  Patch,
  Delete,
  UseGuards,
  Req,
  NotFoundException,
  ForbiddenException,
  Query,
} from '@nestjs/common';
import { OrganizationsService } from './organizations.service';
import { CreateOrganizationDto, UpdateOrganizationDto } from './dto/organization.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Request } from 'express';
import { UtilsService } from 'src/utils/utils.service';

@UseGuards(JwtAuthGuard)
@Controller('orgs')
export class OrganizationsController {
  constructor(private readonly orgService: OrganizationsService, private readonly utilsService: UtilsService) { }

  @Post()
  async createOrganization(@Body() dto: CreateOrganizationDto, @Req() req: Request) {
    const userId = req.user['userId'];
    return this.orgService.create(dto.name, userId);
  }

  @Get(':orgId')
  async getOrganization(@Param('orgId') orgId: string) {
    const org = await this.orgService.getOrganizationById(orgId);
    if (!org) throw new NotFoundException('Organization not found');
    return org;
  }

  @Get('search')
  async searchOrganizations(
    @Query('query') query: string,
    @Req() req,
  ) {
    const userId = req.user.userId;
    return this.orgService.searchUserOrganizations(userId, query);
  }

  @Patch(':orgId')
  async updateOrganizationName(
    @Param('orgId') orgId: string,
    @Body() dto: UpdateOrganizationDto,
    @Req() req: Request
  ) {
    const userId = req.user['userId'];
    const hasPermission = await this.utilsService.checkUserIsAdminOrOwner(orgId, userId);
    if (!hasPermission) throw new ForbiddenException('Only admins/owners can update organization');
    return this.orgService.updateOrganizationName(orgId, dto.name);
  }

  @Delete(':orgId')
  async deleteOrganization(@Param('orgId') orgId: string, @Req() req: Request) {
    const userId = req.user['userId'];
    const isOwner = await this.utilsService.checkUserIsOwner(orgId, userId);
    if (!isOwner) throw new ForbiddenException('Only owners can delete organization');
    return this.orgService.deleteOrganization(orgId);
  }
}