import { signOut, type Auth } from 'firebase/auth';
import { useDemoChatStore } from '../chat/useDemoChatStore';
import { useWorkspaceNavigationStore } from '../../store/useWorkspaceNavigationStore';

export async function signOutAndReset(auth: Auth): Promise<void> {
  await signOut(auth);
  useWorkspaceNavigationStore.getState().resetNavigation();
  useDemoChatStore.getState().resetChat();
}
