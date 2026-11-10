import assert from 'node:assert/strict';
import React from 'react';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'http://localhost/',
});

globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.Node = dom.window.Node;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
Object.defineProperty(globalThis, 'navigator', {
  configurable: true,
  value: dom.window.navigator,
});

const { cleanup, render, screen } = await import('@testing-library/react');
const userEvent = (await import('@testing-library/user-event')).default;
const server = await createServer({
  root: process.cwd(),
  server: { middlewareMode: true },
});

try {
  const { default: App } = await server.ssrLoadModule('/src/App.tsx');
  const { useWorkspaceNavigationStore } = await server.ssrLoadModule('/src/store/useWorkspaceNavigationStore.ts');
  const user = userEvent.setup();
  const app = render(React.createElement(App));

  const title = () => screen.getByRole('heading', { level: 1 }).textContent;
  assert.equal(title(), '# 전체');

  await user.click(screen.getByRole('button', { name: '업무 보드' }));
  assert.equal(title(), '업무 보드');
  assert.equal(useWorkspaceNavigationStore.getState().activeView, 'board');

  await user.click(screen.getByRole('button', { name: '팀원 A' }));
  assert.equal(title(), '팀원 A');
  assert.equal(screen.getByRole('button', { name: '채팅' }).getAttribute('aria-pressed'), 'true');
  assert.equal(useWorkspaceNavigationStore.getState().activeView, 'chat');
  assert.deepEqual(useWorkspaceNavigationStore.getState().selectedConversation, { kind: 'dm', id: 'member-a' });

  await user.click(screen.getByRole('button', { name: '캘린더' }));
  assert.equal(title(), '팀 캘린더');

  await user.click(screen.getByRole('button', { name: '채팅' }));
  assert.equal(title(), '팀원 A');

  const projectChannel = screen.getByRole('button', { name: '프로젝트' });
  projectChannel.focus();
  await user.keyboard('{Enter}');
  assert.equal(title(), '# 프로젝트');
  assert.equal(projectChannel.getAttribute('aria-pressed'), 'true');
  assert.deepEqual(useWorkspaceNavigationStore.getState().selectedConversation, { kind: 'channel', id: 'project' });

  app.unmount();
  render(React.createElement(App));
  assert.equal(title(), '# 프로젝트');

  console.log('Shared navigation store, view switching, and conversation selection passed.');
} finally {
  cleanup();
  await server.close();
  dom.window.close();
}
