// Shared type definitions for the application

export interface ClientMetadata {
  roomId?: string;
  teamId?: string;
  userId?: string;
}

export interface RoomParticipant {
  id: string;
  name: string;
  email: string;
}

export interface BatchProcessingStats {
  totalMessages: number;
  successfulInserts: number;
  duplicates: number;
  errors: number;
  errorDetails?: string[];
}

// MediaSoup related types
export interface RtpCapabilities {
  codecs: Codec[];
  headerExtensions: HeaderExtension[];
  fecMechanisms?: FecMechanism[];
}

export interface Codec {
  kind: 'audio' | 'video';
  mimeType: string;
  clockRate: number;
  channels?: number;
  parameters?: Record<string, unknown>;
}

export interface HeaderExtension {
  kind: 'audio' | 'video';
  uri: string;
  preferredId: number;
  preferredEncrypt?: boolean;
  direction?: string;
}

export interface FecMechanism {
  // Add FEC mechanism properties as needed
}

export interface DtlsParameters {
  role?: 'auto' | 'client' | 'server';
  fingerprints: Fingerprint[];
}

export interface Fingerprint {
  algorithm: string;
  value: string;
}

export interface IceCandidate {
  foundation: string;
  priority: number;
  ip: string;
  protocol: 'udp' | 'tcp';
  port: number;
  type: 'host' | 'srflx' | 'prflx' | 'relay';
  tcpType?: 'active' | 'passive' | 'so';
}

export interface IceParameters {
  usernameFragment: string;
  password: string;
  iceLite?: boolean;
}

export interface TransportOptions {
  id: string;
  iceParameters: IceParameters;
  iceCandidates: IceCandidate[];
  dtlsParameters: DtlsParameters;
  sctpParameters?: SctpParameters;
}

export interface SctpParameters {
  port: number;
  OS: number;
  MIS: number;
  maxMessageSize: number;
}

export interface RtpParameters {
  mid?: string;
  codecs: RtpCodecParameters[];
  headerExtensions?: RtpHeaderExtensionParameters[];
  encodings?: RtpEncodingParameters[];
  rtcp?: RtcpParameters;
}

export interface RtpCodecParameters {
  mimeType: string;
  payloadType: number;
  clockRate: number;
  channels?: number;
  parameters?: Record<string, unknown>;
  rtcpFeedback?: RtcpFeedback[];
}

export interface RtpHeaderExtensionParameters {
  uri: string;
  id: number;
  encrypt?: boolean;
  parameters?: Record<string, unknown>;
}

export interface RtpEncodingParameters {
  ssrc?: number;
  rid?: string;
  codecPayloadType?: number;
  rtx?: { ssrc: number };
  dtx?: boolean;
  scalabilityMode?: string;
  scaleResolutionDownBy?: number;
  maxBitrate?: number;
  maxFramerate?: number;
  adaptivePtime?: boolean;
  priority?: 'very-low' | 'low' | 'medium' | 'high';
  networkPriority?: 'very-low' | 'low' | 'medium' | 'high';
}

export interface RtcpParameters {
  cname?: string;
  reducedSize?: boolean;
}

export interface RtcpFeedback {
  type: string;
  parameter?: string;
}

// Search result types
export interface UserSearchResult {
  id: string;
  name: string;
  email: string;
}

export interface TeamSearchResult {
  id: string;
  name: string;
  organizationId: string;
}

export interface OrganizationSearchResult {
  id: string;
  name: string;
}

export interface RoomSearchResult {
  id: string;
  name: string;
  teamId: string;
}
