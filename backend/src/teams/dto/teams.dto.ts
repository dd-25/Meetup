import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateTeamDto {
  @IsNotEmpty()
  @IsString()
  name: string;

  @IsNotEmpty()
  @IsString()
  organizationId: string;
}

export class UpdateTeamDto {
  @IsOptional()
  @IsString()
  name?: string;
}
