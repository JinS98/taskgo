import { useCallback, useEffect, useState } from 'react';
import { onAuthStateChanged, reload, type Auth, type User } from 'firebase/auth';
import { getFirebaseServices } from '../../services/firebase';

interface AuthSessionState {
  auth: Auth | null;
  user: User | null;
  ready: boolean;
  setupError: string | null;
  revision: number;
}

export function useAuthSession() {
  const [state, setState] = useState<AuthSessionState>({
    auth: null,
    user: null,
    ready: false,
    setupError: null,
    revision: 0,
  });

  useEffect(() => {
    let unsubscribe = () => {};

    try {
      const { auth } = getFirebaseServices();
      unsubscribe = onAuthStateChanged(
        auth,
        (user) => setState((current) => ({ ...current, auth, user, ready: true, setupError: null })),
        () => setState((current) => ({ ...current, auth, ready: true, setupError: '로그인 상태를 확인하지 못했습니다. 네트워크 연결을 확인해 주세요.' })),
      );
    } catch (error) {
      setState((current) => ({
        ...current,
        ready: true,
        setupError: error instanceof Error ? error.message : 'Firebase 설정을 확인해 주세요.',
      }));
    }

    return () => unsubscribe();
  }, []);

  const refreshUser = useCallback(async () => {
    if (!state.auth?.currentUser) return;
    await reload(state.auth.currentUser);
    setState((current) => ({ ...current, user: state.auth?.currentUser ?? null, revision: current.revision + 1 }));
  }, [state.auth]);

  return { ...state, refreshUser };
}
