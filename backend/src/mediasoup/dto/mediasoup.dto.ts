import { IsNotEmpty, IsString, IsOptional, IsEnum, ValidateNested, IsObject, IsArray } from 'class-validator';
import { Type } from 'class-transformer';
import { 
  DtlsParameters, 
  RtpParameters, 
  RtpCapabilities 
} from 'mediasoup/node/lib/types';
import { TransportDirection, ProducerKind } from '../../shared/enums';

export class CreateTransportDto {
  @IsNotEmpty()
  @IsString()
  roomId: string;

  @IsNotEmpty()
  @IsEnum(TransportDirection)
  direction: TransportDirection;
}

export class ConnectTransportDto {
  @IsNotEmpty()
  @IsString()
  transportId: string;

  @IsNotEmpty()
  @IsObject()
  dtlsParameters: DtlsParameters;
}

export class ProduceDto {
  @IsNotEmpty()
  @IsString()
  transportId: string;

  @IsNotEmpty()
  @IsEnum(ProducerKind)
  kind: ProducerKind;

  @IsNotEmpty()
  @IsObject()
  rtpParameters: RtpParameters;
}

export class ConsumeDto {
  @IsNotEmpty()
  @IsString()
  transportId: string;

  @IsNotEmpty()
  @IsString()
  producerId: string;

  @IsNotEmpty()
  @IsObject()
  rtpCapabilities: RtpCapabilities;
}

export class ResumeConsumerDto {
  @IsNotEmpty()
  @IsString()
  consumerId: string;
}

export class PauseConsumerDto {
  @IsNotEmpty()
  @IsString()
  consumerId: string;
}

export class JoinRoomDto {
  @IsNotEmpty()
  @IsString()
  roomId: string;

  @IsOptional()
  @IsString()
  userId?: string;
}

export class LeaveRoomDto {
  @IsNotEmpty()
  @IsString()
  roomId: string;
}

export class GetRtpCapabilitiesDto {
  @IsNotEmpty()
  @IsString()
  roomId: string;
}

// Response DTOs
export class TransportParametersResponseDto {
  @IsNotEmpty()
  @IsString()
  id: string;

  @IsNotEmpty()
  @IsObject()
  iceParameters: object;

  @IsNotEmpty()
  @IsArray()
  iceCandidates: object[];

  @IsNotEmpty()
  @IsObject()
  dtlsParameters: object;

  @IsOptional()
  @IsObject()
  sctpParameters?: object;
}

export class ProducerResponseDto {
  @IsNotEmpty()
  @IsString()
  id: string;
}

export class ConsumerResponseDto {
  @IsNotEmpty()
  @IsString()
  id: string;

  @IsNotEmpty()
  @IsString()
  producerId: string;

  @IsNotEmpty()
  @IsEnum(ProducerKind)
  kind: ProducerKind;

  @IsNotEmpty()
  @IsObject()
  rtpParameters: RtpParameters;
}

export class RtpCapabilitiesResponseDto {
  @IsNotEmpty()
  @IsObject()
  routerRtpCapabilities: RtpCapabilities;
}
