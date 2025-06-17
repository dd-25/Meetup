import { IsNotEmpty, IsString } from 'class-validator';

export class CreateRoomDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  teamId: string;
}

export class UpdateRoomDto {
  @IsString()
  @IsNotEmpty()
  name: string;
}