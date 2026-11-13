import { existsSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs';

const path = new URL('../.secret.local', import.meta.url);
if (!existsSync(path)) {
  writeFileSync(path, 'INVITE_SMTP_URL=smtp://127.0.0.1:2525\nOPENAI_API_KEY=local-disabled\n');
} else if (!/^OPENAI_API_KEY=/m.test(readFileSync(path, 'utf8'))) {
  appendFileSync(path, '\nOPENAI_API_KEY=local-disabled\n');
}
