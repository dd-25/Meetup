import {
  Body,
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Param,
  Query,
  NotFoundException,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { TeamsService } from './teams.service';
import { CreateTeamDto, UpdateTeamDto } from './dto/teams.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('teams')
export class TeamsController {
  constructor(private teamsService: TeamsService) {}

  @Post()
  async createTeam(@Body() dto: CreateTeamDto) {
    try {
      return await this.teamsService.createTeam(dto);
    } catch (err) {
      throw new BadRequestException(err.message);
    }
  }

  @Get(':id')
  async getTeam(@Param('id') id: string) {
    const team = await this.teamsService.getTeamById(id);
    if (!team) throw new NotFoundException('Team not found');
    return team;
  }

  @Patch(':id')
  async updateTeam(@Param('id') id: string, @Body() dto: UpdateTeamDto) {
    try {
      const updated = await this.teamsService.updateTeam(id, dto);
      return updated;
    } catch (err) {
      throw new NotFoundException('Team not found or update failed');
    }
  }

  @Delete(':id')
  async deleteTeam(@Param('id') id: string) {
    try {
      return await this.teamsService.deleteTeam(id);
    } catch (err) {
      throw new NotFoundException('Team not found or deletion failed');
    }
  }

  @Get()
  async searchTeams(
    @Query('userId') userId: string,
    @Query('query') query: string,
  ) {
    if (!userId || !query) {
      throw new BadRequestException('userId and query are required');
    }

    const teams = await this.teamsService.searchUserTeams(userId, query);
    return teams;
  }
}
