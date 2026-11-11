import assert from 'node:assert/strict';
import React from 'react';
import { JSDOM } from 'jsdom';
import { deleteApp } from 'firebase/app';
import { applyActionCode, GoogleAuthProvider, signInWithCredential, signOut } from 'firebase/auth';
import { createServer } from 'vite';

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost:5173/' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.Node = dom.window.Node;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: dom.window.navigator });

const { act, cleanup, render, screen, within } = await import('@testing-library/react');
const userEvent = (await import('@testing-library/user-event')).default;
const server = await createServer({ root: process.cwd(), mode: 'emulator', server: { middlewareMode: true } });

let services;

try {
  const { AuthTestHarness } = await server.ssrLoadModule('/src/features/auth/AuthTestHarness.tsx');
  const { getFirebaseServices } = await server.ssrLoadModule('/src/services/firebase.ts');
  const { useDemoChatStore } = await server.ssrLoadModule('/src/features/chat/useDemoChatStore.ts');
  services = getFirebaseServices();
  const user = userEvent.setup();
  render(React.createElement(AuthTestHarness));

  await screen.findByRole('button', { name: '이메일로 로그인' });
  assert.equal(services.auth.currentUser, null);

  await user.click(screen.getByRole('button', { name: '회원가입' }));
  await user.type(screen.getByRole('textbox', { name: '이메일' }), 'member@example.test');
  await user.type(screen.getByLabelText('비밀번호'), 'StrongPass123!');
  await user.click(screen.getByRole('button', { name: '가입하고 인증 메일 받기' }));
  await screen.findByRole('heading', { name: '이메일을 확인해 주세요' });
  const passwordUid = services.auth.currentUser.uid;

  const response = await fetch('http://127.0.0.1:9099/emulator/v1/projects/demo-taskgo/oobCodes');
  assert.equal(response.status, 200);
  const { oobCodes } = await response.json();
  const verification = oobCodes.find(({ email, requestType }) => email === 'member@example.test' && requestType === 'VERIFY_EMAIL');
  assert.ok(verification?.oobCode);
  await applyActionCode(services.auth, verification.oobCode);
  await user.click(screen.getByRole('button', { name: '인증 확인' }));
  await screen.findByRole('heading', { name: '워크스페이스 만들기' }, { timeout: 10000 });
  await user.type(screen.getByLabelText('워크스페이스 이름'), 'Email Team');
  await user.click(screen.getByRole('button', { name: '만들기' }));
  await screen.findByRole('heading', { name: '# 전체' }, { timeout: 10000 });
  await screen.findByText(/워크스페이스를 만들었습니다\. 멤버 초대는/);
  await user.click(screen.getByRole('button', { name: '워크스페이스 관리' }));
  await screen.findByRole('heading', { name: '워크스페이스 멤버' });
  await screen.findByText('member@example.test');
  assert.ok(screen.getByRole('heading', { name: '초대 현황' }));
  assert.ok(screen.getByLabelText('이메일 주소'));
  assert.deepEqual(within(screen.getByRole('main')).getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent), [
    '멤버 초대', '새 워크스페이스', '초대 현황', '워크스페이스 멤버',
  ]);
  await user.type(screen.getByLabelText('워크스페이스 이름'), 'Second Team');
  await user.click(screen.getByRole('button', { name: '새 공간 만들기' }));
  await screen.findByRole('heading', { name: 'Second Team 관리' }, { timeout: 10000 });
  await user.click(screen.getByRole('button', { name: '워크스페이스 선택' }));
  await user.click(within(screen.getByRole('group', { name: '워크스페이스 목록' })).getByRole('button', { name: /Email Team/ }));
  await screen.findByRole('heading', { name: 'Email Team 관리' });

  await user.click(screen.getByRole('button', { name: '계정' }));
  assert.match(screen.getByLabelText('계정 설정').textContent, /이메일·비밀번호/);
  act(() => { useDemoChatStore.getState().setDraft(`${passwordUid}:test:channel:general`, '로그아웃 시 삭제할 초안'); });
  await user.click(screen.getByRole('button', { name: '로그아웃' }));
  await screen.findByRole('button', { name: '이메일로 로그인' });
  assert.deepEqual(useDemoChatStore.getState().draftsByRoom, {});

  await user.click(screen.getByRole('button', { name: '회원가입' }));
  await user.type(screen.getByRole('textbox', { name: '이메일' }), 'member@example.test');
  await user.type(screen.getByLabelText('비밀번호'), 'StrongPass123!');
  await user.click(screen.getByRole('button', { name: '가입하고 인증 메일 받기' }));
  assert.match((await screen.findByRole('alert')).textContent, /이미 사용 중인 이메일/);
  await user.click(screen.getByRole('button', { name: '로그인' }));
  await user.clear(screen.getByLabelText('비밀번호'));
  await user.type(screen.getByLabelText('비밀번호'), 'WrongPass123!');
  await user.click(screen.getByRole('button', { name: '이메일로 로그인' }));
  assert.match((await screen.findByRole('alert')).textContent, /이메일 또는 비밀번호/);
  await user.clear(screen.getByLabelText('비밀번호'));
  await user.type(screen.getByLabelText('비밀번호'), 'StrongPass123!');
  await user.click(screen.getByRole('button', { name: '이메일로 로그인' }));
  await screen.findByRole('heading', { name: '# 전체' }, { timeout: 10000 });
  assert.equal(services.auth.currentUser.uid, passwordUid);

  await act(async () => { await signOut(services.auth); });
  await screen.findByRole('button', { name: '이메일로 로그인' });
  const googleCredential = GoogleAuthProvider.credential(JSON.stringify({
    sub: 'google-member-1',
    email: 'google-member@example.test',
    email_verified: true,
  }));
  await act(async () => { await signInWithCredential(services.auth, googleCredential); });
  await screen.findByRole('heading', { name: '워크스페이스 만들기' }, { timeout: 10000 });
  await user.type(screen.getByLabelText('워크스페이스 이름'), 'Google Team');
  await user.click(screen.getByRole('button', { name: '만들기' }));
  await screen.findByRole('heading', { name: '# 전체' }, { timeout: 10000 });
  await screen.findByText(/워크스페이스를 만들었습니다\. 멤버 초대는/);
  await user.click(screen.getByRole('button', { name: '워크스페이스 관리' }));
  await screen.findByText('google-member@example.test');
  const googleUid = services.auth.currentUser.uid;

  await user.click(screen.getByRole('button', { name: '계정' }));
  await user.type(screen.getByLabelText('비밀번호 로그인 추가'), 'OtherPass123!');
  await user.click(screen.getByRole('button', { name: '비밀번호 연결' }));
  await screen.findByText('이메일·비밀번호 로그인을 연결했습니다.', {}, { timeout: 10000 });
  assert.match(screen.getByLabelText('계정 설정').textContent, /이메일·비밀번호 · Google/);
  await user.click(screen.getByRole('button', { name: '로그아웃' }));
  await screen.findByRole('button', { name: '이메일로 로그인' });
  await user.type(screen.getByRole('textbox', { name: '이메일' }), 'google-member@example.test');
  await user.type(screen.getByLabelText('비밀번호'), 'OtherPass123!');
  await user.click(screen.getByRole('button', { name: '이메일로 로그인' }));
  await screen.findByRole('heading', { name: '# 전체' }, { timeout: 10000 });
  assert.equal(services.auth.currentUser.uid, googleUid);

  console.log('Protected routes, email verification, password login, Google session, and account linking passed.');
} finally {
  cleanup();
  if (services) await deleteApp(services.app);
  await server.close();
  dom.window.close();
}
