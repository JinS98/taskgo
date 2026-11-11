import { createSocketApp, listenSocketApp, closeSocketApp } from './app.js';

const host = process.env.SOCKET_HOST || '127.0.0.1';
const rawPort = process.env.PORT || '3001';
const port = Number(rawPort);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error(`올바르지 않은 PORT: ${rawPort}`);
const allowedOrigins = (process.env.SOCKET_ALLOWED_ORIGINS || 'http://localhost:5173,http://127.0.0.1:5173')
  .split(',').map((origin) => origin.trim()).filter(Boolean);
if (!allowedOrigins.length || allowedOrigins.some((origin) => !/^https?:\/\/[^/]+$/.test(origin))) {
  throw new Error('SOCKET_ALLOWED_ORIGINS에는 쉼표로 구분한 웹 Origin을 설정해 주세요.');
}

const app = createSocketApp({ allowedOrigins });
const address = await listenSocketApp(app, port, host);
console.log(`Taskgo socket server listening on http://${host}:${address.port}`);

let shuttingDown = false;
async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  await closeSocketApp(app);
}
process.on('SIGINT', () => { void shutdown(); });
process.on('SIGTERM', () => { void shutdown(); });
