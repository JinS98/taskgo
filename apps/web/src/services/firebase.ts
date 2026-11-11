import { getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, type Auth } from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore, type Firestore } from 'firebase/firestore';
import { connectFunctionsEmulator, getFunctions, type Functions } from 'firebase/functions';
import { getFirebaseClientConfig, useFirebaseEmulators } from '../config/env';

interface FirebaseServices {
  app: FirebaseApp;
  auth: Auth;
  db: Firestore;
  functions: Functions;
}

let services: FirebaseServices | undefined;

export function getFirebaseServices(): FirebaseServices {
  if (services) return services;

  if (import.meta.env.PROD && useFirebaseEmulators) {
    throw new Error('프로덕션 빌드에서는 Firebase 에뮬레이터를 사용할 수 없습니다.');
  }

  const config = getFirebaseClientConfig();
  const existingApp = getApps().find(({ name }) => name === 'taskgo');
  const app = existingApp ?? initializeApp(config, 'taskgo');
  const auth = getAuth(app);
  const db = getFirestore(app);
  const functions = getFunctions(app, 'asia-northeast3');

  if (useFirebaseEmulators && !existingApp) {
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    connectFirestoreEmulator(db, '127.0.0.1', 8080);
    connectFunctionsEmulator(functions, '127.0.0.1', 5001);
  }

  services = { app, auth, db, functions };
  return services;
}
