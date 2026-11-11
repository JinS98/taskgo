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
  resetChat: () => void;
}

export function liveRoomKey(viewerId: string, target: RoomTarget): string {
  return `${viewerId}:${target.workspaceId}:${target.kind}:${target.roomId}`;
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
  receive: (key, message) => set((state) => {
    const current = state.messagesByRoom[key] ?? [];
    const next: LiveChatMessage = {
      clientMessageId: message.clientMessageId,
      messageId: message.messageId,
      senderId: message.senderId,
      content: message.content,
      createdAt: Date.parse(message.createdAt),
      status: 'sent',
    };
    const index = current.findIndex((item) => item.messageId === message.messageId || (item.senderId === message.senderId && item.clientMessageId === message.clientMessageId));
    const messages = index < 0 ? [...current, next] : current.map((item, position) => position === index ? next : item);
    return { messagesByRoom: { ...state.messagesByRoom, [key]: messages } };
  }),
  resetChat: () => set({ messagesByRoom: {}, draftsByRoom: {} }),
}));
