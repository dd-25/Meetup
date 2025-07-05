// Application-wide enums

export enum MediaType {
  TEXT = 'text',
  IMAGE = 'image',
  VIDEO = 'video',
  AUDIO = 'audio',
  FILE = 'file',
}

export enum ChatMessageStatus {
  SENT = 'sent',
  DELIVERED = 'delivered',
  READ = 'read',
  FAILED = 'failed',
}

export enum SocketEvents {
  // Room management
  JOIN_ROOM = 'join-room',
  LEAVE_ROOM = 'leave-room',
  ROOM_JOINED = 'room-joined',
  ROOM_LEFT = 'room-left',
  
  // Video/Audio transport
  CREATE_SEND_TRANSPORT = 'create-send-transport',
  CREATE_RECV_TRANSPORT = 'create-recv-transport',
  CONNECT_SEND_TRANSPORT = 'connect-send-transport',
  CONNECT_RECV_TRANSPORT = 'connect-recv-transport',
  
  // Media production/consumption
  PRODUCE = 'produce',
  CONSUME = 'consume',
  RESUME_CONSUMER = 'resume-consumer',
  PAUSE_CONSUMER = 'pause-consumer',
  
  // Generic
  PARAMETERS = 'parameters',
  ERROR = 'error',
  
  // Transport states
  SEND_TRANSPORT_CONNECTED = 'send-transport-connected',
  RECV_TRANSPORT_CONNECTED = 'recv-transport-connected',
}

export enum UserStatus {
  ONLINE = 'online',
  OFFLINE = 'offline',
  AWAY = 'away',
  BUSY = 'busy',
}

export enum NotificationType {
  CHAT_MESSAGE = 'chat_message',
  MEETING_INVITE = 'meeting_invite',
  TEAM_INVITE = 'team_invite',
  ORG_INVITE = 'org_invite',
  SYSTEM = 'system',
}

export enum LogLevel {
  ERROR = 'error',
  WARN = 'warn',
  INFO = 'info',
  DEBUG = 'debug',
  VERBOSE = 'verbose',
}

export enum TransportDirection {
  SEND = 'send',
  RECV = 'recv',
}

export enum ProducerKind {
  AUDIO = 'audio',
  VIDEO = 'video',
}

export enum ConnectionState {
  NEW = 'new',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  DISCONNECTED = 'disconnected',
  FAILED = 'failed',
  CLOSED = 'closed',
}
