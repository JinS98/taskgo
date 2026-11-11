import { create } from 'zustand';
import { initialConversation, type ConversationSelection } from '../features/chat/demoConversations';
import type { AppView } from '../types/domain';

interface WorkspaceNavigationState {
  activeView: AppView;
  selectedConversation: ConversationSelection;
  setView: (view: AppView) => void;
  selectConversation: (conversation: ConversationSelection) => void;
  resetNavigation: () => void;
}

export const useWorkspaceNavigationStore = create<WorkspaceNavigationState>()((set) => ({
  activeView: 'chat',
  selectedConversation: initialConversation,
  setView: (activeView) => set({ activeView }),
  selectConversation: (selectedConversation) => set({
    activeView: 'chat',
    selectedConversation,
  }),
  resetNavigation: () => set({ activeView: 'chat', selectedConversation: initialConversation }),
}));
