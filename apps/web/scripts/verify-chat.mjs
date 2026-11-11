import assert from 'node:assert/strict';
import React from 'react';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.Node = dom.window.Node;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: dom.window.navigator });

const { act, cleanup, render, screen } = await import('@testing-library/react');
const userEvent = (await import('@testing-library/user-event')).default;
const server = await createServer({ root: process.cwd(), server: { middlewareMode: true } });

try {
  const { ChatPanel } = await server.ssrLoadModule('/src/features/chat/ChatPanel.tsx');
  const { useDemoChatStore } = await server.ssrLoadModule('/src/features/chat/useDemoChatStore.ts');
  const user = userEvent.setup();
  let finishDelivery;
  const pendingDelivery = () => new Promise((resolve) => { finishDelivery = resolve; });
  const view = render(React.createElement(ChatPanel, { conversation: { kind: 'channel', id: 'general' }, workspaceId: 'team-one', viewerId: 'owner', deliver: pendingDelivery }));

  assert.equal(screen.getByRole('heading', { name: '# 전체' }).tagName, 'H1');
  assert.ok(screen.getByText('샘플 대화'));
  const input = screen.getByRole('textbox', { name: '메시지 입력' });
  assert.equal(screen.getByRole('button', { name: '전송' }).disabled, true);
  await user.type(input, '안녕하세요{enter}');
  assert.ok(screen.getByText('표시 중…'));
  assert.equal(input.value, '');
  await act(async () => { finishDelivery(); });
  await screen.findByText('내 화면에만 표시됨');

  await user.type(input, '첫 줄{shift>}{enter}{/shift}둘째 줄');
  assert.equal(input.value, '첫 줄\n둘째 줄');
  await user.click(screen.getByRole('button', { name: '전송' }));
  await act(async () => { finishDelivery(); });
  assert.ok(screen.getByText((_, element) => element?.tagName === 'P' && element.textContent === '첫 줄\n둘째 줄'));

  view.rerender(React.createElement(ChatPanel, { conversation: { kind: 'channel', id: 'project' }, workspaceId: 'team-one', viewerId: 'owner', deliver: pendingDelivery }));
  assert.equal(screen.queryByText('안녕하세요'), null);
  view.rerender(React.createElement(ChatPanel, { conversation: { kind: 'channel', id: 'general' }, workspaceId: 'team-one', viewerId: 'owner', deliver: pendingDelivery }));
  assert.ok(screen.getByText('안녕하세요'));
  view.rerender(React.createElement(ChatPanel, { conversation: { kind: 'channel', id: 'general' }, workspaceId: 'team-two', viewerId: 'owner', deliver: pendingDelivery }));
  assert.equal(screen.queryByText('안녕하세요'), null);
  view.rerender(React.createElement(ChatPanel, { conversation: { kind: 'channel', id: 'general' }, workspaceId: 'team-one', viewerId: 'other-user', deliver: pendingDelivery }));
  assert.equal(screen.queryByText('안녕하세요'), null);

  let attempts = 0;
  view.rerender(React.createElement(ChatPanel, { conversation: { kind: 'dm', id: 'member-a' }, workspaceId: 'team-one', viewerId: 'owner', deliver: async () => { attempts++; if (attempts === 1) throw new Error('preview failed'); } }));
  await user.type(screen.getByRole('textbox', { name: '메시지 입력' }), '다시 보낼 메시지');
  await user.click(screen.getByRole('button', { name: '전송' }));
  await screen.findByText('미리보기 실패');
  await user.click(screen.getByRole('button', { name: '다시 시도' }));
  await screen.findByText('내 화면에만 표시됨');
  assert.equal(attempts, 2);

  act(() => { useDemoChatStore.getState().resetChat(); });
  assert.equal(screen.queryByText('다시 보낼 메시지'), null);
  console.log('Chat mock send states, retry, draft behavior, and room/user isolation passed.');
} finally {
  cleanup();
  await server.close();
  dom.window.close();
}
