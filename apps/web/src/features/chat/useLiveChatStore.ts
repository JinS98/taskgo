import { create } from 'zustand';
import type { CreatedMessage, RoomTarget } from '@taskgo/contracts';

export type LiveMessageStatus = 'sending' | 'sent' | 'failed';

export interface LiveChatMessage {
  clientMessageId: string;
  messageId?: string;
  senderId: string;
  content: string;
  createdAt: number;
  status: LiveMessageStatus;
}

interface LiveChatState {
  messagesByRoom: Record<string, LiveChatMessage[]>;
  draftsByRoom: Record<string, string>;
  setDraft: (key: string, value: string) => void;
  addPending: (key: string, message: LiveChatMessage) => void;
  confirm: (key: string, clientMessageId: string, messageId: string) => void;
  fail: (key: string, clientMessageId: string) => void;
  retry: (key: string, clientMessageId: string) => void;
  receive: (key: string, message: CreatedMessage) => void;
  mergeHistory: (key: string, messages: CreatedMessage[]) => void;
  resetChat: () => void;
}

export function liveRoomKey(viewerId: string, target: RoomTarget): string {
  return `${viewerId}:${target.workspaceId}:${target.kind}:${target.roomId}`;
}

function mergeMessages(current: LiveChatMessage[], incoming: CreatedMessage[]): LiveChatMessage[] {
  const merged = [...current];
  for (const message of incoming) {
    const next: LiveChatMessage = {
      clientMessageId: message.clientMessageId,
      messageId: message.messageId,
      senderId: message.senderId,
      content: message.content,
      createdAt: Date.parse(message.createdAt),
      status: 'sent',
    };
    const index = merged.findIndex((item) => item.messageId === message.messageId
      || (item.senderId === message.senderId && item.clientMessageId === message.clientMessageId));
    if (index < 0) merged.push(next);
    else merged[index] = next;
  }
  return merged.sort((a, b) => a.createdAt - b.createdAt
    || (a.messageId ?? a.clientMessageId).localeCompare(b.messageId ?? b.clientMessageId));
}

export const useLiveChatStore = create<LiveChatState>()((set) => ({
  messagesByRoom: {},
  draftsByRoom: {},
  setDraft: (key, value) => set((state) => ({ draftsByRoom: { ...state.draftsByRoom, [key]: value } })),
  addPending: (key, message) => set((state) => ({ messagesByRoom: { ...state.messagesByRoom, [key]: [...(state.messagesByRoom[key] ?? []), message] } })),
  confirm: (key, clientMessageId, messageId) => set((state) => ({
    messagesByRoom: { ...state.messagesByRoom, [key]: (state.messagesByRoom[key] ?? []).map((item) => item.clientMessageId === clientMessageId ? { ...item, messageId, status: 'sent' } : item) },
  })),
  fail: (key, clientMessageId) => set((state) => ({
    messagesByRoom: { ...state.messagesByRoom, [key]: (state.messagesByRoom[key] ?? []).map((item) => item.clientMessageId === clientMessageId ? { ...item, status: 'failed' } : item) },
  })),
  retry: (key, clientMessageId) => set((state) => ({
    messagesByRoom: { ...state.messagesByRoom, [key]: (state.messagesByRoom[key] ?? []).map((item) => item.clientMessageId === clientMessageId ? { ...item, status: 'sending' } : item) },
  })),
  receive: (key, message) => set((state) => ({
    messagesByRoom: { ...state.messagesByRoom, [key]: mergeMessages(state.messagesByRoom[key] ?? [], [message]) },
  })),
  mergeHistory: (key, messages) => set((state) => ({
    messagesByRoom: { ...state.messagesByRoom, [key]: mergeMessages(state.messagesByRoom[key] ?? [], messages) },
  })),
  resetChat: () => set({ messagesByRoom: {}, draftsByRoom: {} }),
}));