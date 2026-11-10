export interface FirebaseClientConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  appId: string;
}

export function getFirebaseClientConfig(): FirebaseClientConfig {
  const apiKey = import.meta.env.VITE_FIREBASE_API_KEY?.trim();
  const authDomain = import.meta.env.VITE_FIREBASE_AUTH_DOMAIN?.trim();
  const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID?.trim();
  const appId = import.meta.env.VITE_FIREBASE_APP_ID?.trim();

  if (!apiKey || !authDomain || !projectId || !appId) {
    const missing = [
      !apiKey && 'VITE_FIREBASE_API_KEY',
      !authDomain && 'VITE_FIREBASE_AUTH_DOMAIN',
      !projectId && 'VITE_FIREBASE_PROJECT_ID',
      !appId && 'VITE_FIREBASE_APP_ID',
    ].filter(Boolean);
    throw new Error(`Firebase 웹 설정이 누락되었습니다: ${missing.join(', ')}`);
  }

  return { apiKey, authDomain, projectId, appId };
}

export const useFirebaseEmulators = import.meta.env.VITE_USE_FIREBASE_EMULATORS === 'true';

export const socketUrl = import.meta.env.VITE_SOCKET_URL?.trim() || 'http://localhost:3001';
