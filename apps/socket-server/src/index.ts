import { createSocketApp, listenSocketApp, closeSocketApp } from './app.js';
import { createFirebaseSocketServices } from './firebase.js';

const host = process.env.SOCKET_HOST || '127.0.0.1';
const rawPort = process.env.PORT || '3001';
const port = Number(rawPort);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error(`올바르지 않은 PORT: ${rawPort}`);
const allowedOrigins = (process.env.SOCKET_ALLOWED_ORIGINS || 'http://localhost:5173,http://127.0.0.1:5173')
  .split(',').map((origin) => origin.trim()).filter(Boolean);
if (!allowedOrigins.length || allowedOrigins.some((origin) => !/^https?:\/\/[^/]+$/.test(origin))) {
  throw new Error('SOCKET_ALLOWED_ORIGINS에는 쉼표로 구분한 웹 Origin을 설정해 주세요.');
}
const projectId = process.env.FIREBASE_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT;
if (!projectId) throw new Error('FIREBASE_PROJECT_ID 또는 GOOGLE_CLOUD_PROJECT를 설정해 주세요.');
if (Boolean(process.env.FIREBASE_AUTH_EMULATOR_HOST) !== Boolean(process.env.FIRESTORE_EMULATOR_HOST)) {
  throw new Error('로컬에서는 FIREBASE_AUTH_EMULATOR_HOST와 FIRESTORE_EMULATOR_HOST를 함께 설정해 주세요.');
}
if (process.env.FIREBASE_AUTH_EMULATOR_HOST && !projectId.startsWith('demo-')) {
  throw new Error('Auth 에뮬레이터는 demo- 프로젝트에서만 사용해 주세요.');
}

const services = createFirebaseSocketServices(projectId);
const app = createSocketApp({ allowedOrigins, services });
const address = await listenSocketApp(app, port, host);
console.log(`Taskgo socket server listening on http://${host}:${address.port}`);

let shuttingDown = false;
async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  await closeSocketApp(app);
  await services.close();
}
process.on('SIGINT', () => { void shutdown(); });
process.on('SIGTERM', () => { void shutdown(); });
