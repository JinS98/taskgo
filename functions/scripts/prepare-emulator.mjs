import { existsSync, writeFileSync } from 'node:fs';

const path = new URL('../.secret.local', import.meta.url);
if (!existsSync(path)) {
  writeFileSync(path, 'INVITE_SMTP_URL=smtp://127.0.0.1:2525\n');
}
