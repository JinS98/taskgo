export type SocketProtocolVersion = 1;

export type RoomKind = 'channel' | 'dm';
export type SocketErrorCode = 'INVALID_REQUEST' | 'FORBIDDEN' | 'AUTH_EXPIRED' | 'FEATURE_NOT_READY' | 'INTERNAL_ERROR';

export interface RoomTarget {
  workspaceId: string;
  roomId: string;
  kind: RoomKind;
}

export interface SocketError {
  code: SocketErrorCode;
  message: string;
}

export type SocketAck<T> = { ok: true; data: T } | { ok: false; error: SocketError };

export interface SendMessageRequest extends RoomTarget {
  clientMessageId: string;
  content: string;
}

export interface CreatedMessage extends SendMessageRequest {
  messageId: string;
  senderId: string;
  createdAt: string;
}

export interface TypingRequest extends RoomTarget {
  active: boolean;
}

export interface ServerToClientEvents {
  'server:ready': (payload: { protocolVersion: SocketProtocolVersion }) => void;
  'message:created': (message: CreatedMessage) => void;
  'typing:changed': (payload: TypingRequest & { userId: string }) => void;
}

export interface ClientToServerEvents {
  'room:join': (target: RoomTarget, ack: (result: SocketAck<{ joined: true }>) => void) => void;
  'room:leave': (target: RoomTarget, ack: (result: SocketAck<{ left: true }>) => void) => void;
  'message:send': (message: SendMessageRequest, ack: (result: SocketAck<{ messageId: string }>) => void) => void;
  'typing:set': (payload: TypingRequest, ack: (result: SocketAck<{ accepted: true }>) => void) => void;
}
