import { create } from 'zustand';

export type DemoMessageStatus = 'sending' | 'preview' | 'failed';

export interface DemoChatMessage {
  id: string;
  content: string;
  createdAt: number;
  status: DemoMessageStatus;
}

interface DemoChatState {
  messagesByRoom: Record<string, DemoChatMessage[]>;
  draftsByRoom: Record<string, string>;
  setDraft: (roomKey: string, value: string) => void;
  addMessage: (roomKey: string, message: DemoChatMessage) => void;
  setMessageStatus: (roomKey: string, id: string, status: DemoMessageStatus) => void;
  resetChat: () => void;
}

export const useDemoChatStore = create<DemoChatState>()((set) => ({
  messagesByRoom: {},
  draftsByRoom: {},
  setDraft: (roomKey, value) => set((state) => ({ draftsByRoom: { ...state.draftsByRoom, [roomKey]: value } })),
  addMessage: (roomKey, message) => set((state) => ({ messagesByRoom: { ...state.messagesByRoom, [roomKey]: [...(state.messagesByRoom[roomKey] ?? []), message] } })),
  setMessageStatus: (roomKey, id, status) => set((state) => state.messagesByRoom[roomKey] ? { messagesByRoom: { ...state.messagesByRoom, [roomKey]: state.messagesByRoom[roomKey].map((message) => message.id === id ? { ...message, status } : message) } } : state),
  resetChat: () => set({ messagesByRoom: {}, draftsByRoom: {} }),
}));
