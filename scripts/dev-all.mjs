import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { connect } from 'node:net';
import { delimiter, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

const root = fileURLToPath(new URL('../', import.meta.url));
const children = [];
const npmCli = process.env.npm_execpath;
const fixedPorts = [3001, 9099, 8080, 5001, 4000, 4400, 4500, 9150, 9299, 9499];
let stopping = false;
let stopRunning;

if (!npmCli) throw new Error('npm run dev:all로 실행해 주세요.');

function javaMajor(home) {
  const executable = join(home, 'bin', process.platform === 'win32' ? 'java.exe' : 'java');
  if (!existsSync(executable)) return 0;
  const result = spawnSync(executable, ['-version'], { encoding: 'utf8', windowsHide: true });
  const version = `${result.stdout ?? ''}${result.stderr ?? ''}`.match(/version "(\d+)(?:\.(\d+))?/);
  if (result.status !== 0 || !version) return 0;
  return Number(version[1] === '1' ? version[2] : version[1]);
}

function javaEnvironment() {
  const pathKey = Object.keys(process.env).find((key) => key.toLowerCase() === 'path') ?? 'PATH';
  const candidates = [];
  if (process.env.JAVA_HOME) candidates.push(process.env.JAVA_HOME);
  for (const entry of (process.env[pathKey] ?? '').split(delimiter)) {
    if (entry && existsSync(join(entry, process.platform === 'win32' ? 'java.exe' : 'java'))) candidates.push(dirname(entry));
  }
  const installRoots = process.platform === 'win32'
    ? ['Eclipse Adoptium', 'Java', 'Microsoft'].map((folder) => join(process.env.ProgramFiles ?? 'C:\\Program Files', folder))
    : ['/usr/lib/jvm'];
  for (const installRoot of installRoots) {
    if (!existsSync(installRoot)) continue;
    for (const entry of readdirSync(installRoot, { withFileTypes: true })) {
      if (entry.isDirectory()) candidates.push(join(installRoot, entry.name));
    }
  }
  const home = candidates.find((candidate) => javaMajor(candidate) >= 21);
  if (!home) throw new Error('Firebase 에뮬레이터에 Java 21 이상이 필요합니다. JDK 21을 설치하고 JAVA_HOME을 설정해 주세요.');
  const env = { ...process.env, JAVA_HOME: home };
  env[pathKey] = `${join(home, 'bin')}${delimiter}${env[pathKey] ?? ''}`;
  console.log(`Firebase 에뮬레이터 Java: ${home}`);
  return env;
}

function occupied(port, host) {
  return new Promise((done) => {
    const socket = connect({ port, host });
    socket.once('connect', () => { socket.destroy(); done(true); });
    socket.once('error', () => done(false));
    socket.setTimeout(500, () => { socket.destroy(); done(false); });
  });
}

async function selectWebPort() {
  for (let port = 5173; port <= 5180; port += 1) {
    const [ipv4, ipv6] = await Promise.all([occupied(port, '127.0.0.1'), occupied(port, '::1')]);
    if (!ipv4 && !ipv6) return port;
  }
  throw new Error('웹 개발 서버에 사용할 수 있는 포트가 없습니다 (5173–5180).');
}

function start(label, args, options = {}, watch = true) {
  const child = spawn(process.execPath, args, {
    cwd: root,
    stdio: 'inherit',
    windowsHide: true,
    ...options,
  });
  children.push(child);
  child.once('error', (error) => {
    console.error(`${label} 시작 실패: ${error.message}`);
    if (!stopping) stopRunning?.(1);
  });
  child.once('exit', (code) => {
    if (watch && !stopping) {
      console.error(`${label} 종료됨 (코드 ${code ?? '없음'}).`);
      stopRunning?.(code || 1);
    }
  });
  return child;
}

async function runBuild(script) {
  const child = start(script, [npmCli, 'run', script], {}, false);
  const code = await new Promise((done) => child.once('exit', done));
  if (code !== 0) throw new Error(`${script} 실패 (코드 ${code ?? '없음'}).`);
  children.splice(children.indexOf(child), 1);
}

async function waitFor(label, check, child) {
  for (let attempt = 0; attempt < 360; attempt += 1) {
    if (await check()) return;
    if (child.exitCode !== null) throw new Error(`${label}가 준비되기 전에 종료됐습니다.`);
    await delay(250);
  }
  throw new Error(`${label} 준비 시간이 초과됐습니다.`);
}

async function stopChild(child) {
  if (child.exitCode !== null || !child.pid) return;
  if (process.platform === 'win32') {
    const killer = spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
    await new Promise((done) => killer.once('exit', done));
  } else {
    child.kill('SIGTERM');
  }
}

async function main() {
  const emulatorEnv = javaEnvironment();
  const busy = [];
  for (const port of fixedPorts) {
    if (await occupied(port, '127.0.0.1')) busy.push(port);
  }
  if (busy.length) throw new Error(`이미 사용 중인 서비스 포트: ${busy.join(', ')}. 기존 에뮬레이터 또는 채팅 서버를 종료해 주세요.`);
  const webPort = await selectWebPort();

  await runBuild('build:functions');
  await runBuild('build:socket');
  await runBuild('prepare:emulator');

  const emulator = start('Firebase 에뮬레이터', [resolve(root, 'node_modules/firebase-tools/lib/bin/firebase.js'), 'emulators:start', '--only', 'auth,firestore,functions', '--project', 'demo-taskgo'], { env: emulatorEnv });
  await waitFor('Firebase 에뮬레이터', async () => (await Promise.all([9099, 8080, 5001].map((port) => occupied(port, '127.0.0.1')))).every(Boolean), emulator);

  const socket = start('채팅 서버', [resolve(root, 'apps/socket-server/dist/index.js')], {
    env: {
      ...process.env,
      FIREBASE_PROJECT_ID: 'demo-taskgo',
      FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099',
      FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080',
      SOCKET_HOST: '127.0.0.1',
      PORT: '3001',
      SOCKET_ALLOWED_ORIGINS: `http://127.0.0.1:${webPort},http://localhost:${webPort}`,
    },
  });
  await waitFor('채팅 서버', async () => {
    try { return (await fetch('http://127.0.0.1:3001/healthz')).ok; } catch { return false; }
  }, socket);

  const webEnv = Object.fromEntries(readFileSync(resolve(root, 'apps/web/.env.emulator'), 'utf8')
    .split(/\r?\n/).filter((line) => /^VITE_[^=]+=.*/.test(line)).map((line) => {
      const separator = line.indexOf('=');
      return [line.slice(0, separator), line.slice(separator + 1)];
    }));
  const web = start('웹 개발 서버', [resolve(root, 'node_modules/vite/bin/vite.js'), '--mode', 'emulator', '--host', '127.0.0.1', '--port', String(webPort), '--strictPort'], {
    cwd: resolve(root, 'apps/web'),
    env: { ...process.env, ...webEnv },
  });
  await waitFor('웹 개발 서버', async () => {
    try { return (await fetch(`http://127.0.0.1:${webPort}`)).ok; } catch { return false; }
  }, web);

  console.log(`\n준비 완료: http://127.0.0.1:${webPort}/workspace`);
  console.log('Firebase 가상 프로젝트를 사용합니다. 종료하려면 Ctrl+C를 누르세요.\n');
  const exitCode = await new Promise((done) => { stopRunning = done; });
  if (exitCode) process.exitCode = exitCode;
}

function onSignal() {
  stopping = true;
  stopRunning?.(0);
  for (const child of children) void stopChild(child);
}

process.once('SIGINT', onSignal);
process.once('SIGTERM', onSignal);

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  stopping = true;
  for (const child of children.reverse()) await stopChild(child);
}
