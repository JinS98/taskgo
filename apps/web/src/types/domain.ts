// 스키마가 확정되기 전에도 화면과 상태 관리에서 공유할 식별자·역할 이름.
export type UserId = string;
export type WorkspaceId = string;
export type ChannelId = string;
export type DmRoomId = string;
export type MessageId = string;
export type TaskId = string;

export type WorkspaceRole = 'owner' | 'member';
export type AppView = 'chat' | 'board' | 'calendar';
