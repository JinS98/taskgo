import type { ChannelId, DmRoomId } from '../../types/domain';

export interface DemoChannel {
  id: ChannelId;
  name: string;
}

export interface DemoDirectMessage {
  id: DmRoomId;
  name: string;
  initials: string;
}

export type ConversationSelection =
  | { kind: 'channel'; id: ChannelId; name?: string }
  | { kind: 'dm'; id: DmRoomId; name?: string };

export function defaultChannelId(workspaceId: string): string {
  return `general_${workspaceId}`;
}

export const demoChannels: DemoChannel[] = [
  { id: 'general', name: '전체' },
  { id: 'project', name: '프로젝트' },
  { id: 'design', name: '디자인' },
];

export const demoDirectMessages: DemoDirectMessage[] = [
  { id: 'member-a', name: '팀원 A', initials: 'A' },
  { id: 'member-b', name: '팀원 B', initials: 'B' },
];

export const initialConversation: ConversationSelection = {
  kind: 'channel',
  id: demoChannels[0].id,
};

export function getConversationName(selection: ConversationSelection): string {
  if (selection.name) return selection.name;
  const items = selection.kind === 'channel' ? demoChannels : demoDirectMessages;
  return items.find(({ id }) => id === selection.id)?.name ?? '대화';
}
