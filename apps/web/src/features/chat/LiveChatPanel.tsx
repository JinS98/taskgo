import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { getIdToken, type Auth } from 'firebase/auth';
import type { Functions } from 'firebase/functions';
import { io, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, RoomTarget, ServerToClientEvents, SocketAck } from '@taskgo/contracts';
import { socketUrl } from '../../config/env';
import { getConversationName, type ConversationSelection } from './demoConversations';
import { liveRoomKey, useLiveChatStore, type LiveChatMessage } from './useLiveChatStore';
import { useRoomHistory } from './useRoomHistory';
import { TaskCreateDialog } from '../tasks/TaskCreateDialog';
import styles from './ChatPanel.module.scss';

type ChatSocket = Socket<ServerToClientEvents, ClientToServerEvents>;
type ConnectionState = 'connecting' | 'ready' | 'error' | 'offline';
const emptyMessages: LiveChatMessage[] = [];

function readableError(result: SocketAck<unknown>): string {
  return result.ok ? '' : result.error.message;
}

function pendingMessage(viewerId: string, content: string): LiveChatMessage {
  return { clientMessageId: crypto.randomUUID(), senderId: viewerId, content, createdAt: Date.now(), status: 'sending' };
}

export function LiveChatPanel({ auth, functions, conversation, workspaceId, viewerId, senderName, memberEmails, memberNames }: {
  auth: Auth;
  functions: Functions;
  conversation: ConversationSelection;
  workspaceId: string;
  viewerId: string;
  senderName: string;
  memberEmails: Record<string, string>;
  memberNames: Record<string, string>;
}) {
  const target: RoomTarget = useMemo(() => ({ workspaceId, kind: conversation.kind, roomId: conversation.id }), [workspaceId, conversation.kind, conversation.id]);
  const key = liveRoomKey(viewerId, target);
  const messages = useLiveChatStore((state) => state.messagesByRoom[key] ?? emptyMessages);
  const draft = useLiveChatStore((state) => state.draftsByRoom[key] ?? '');
  const setDraft = useLiveChatStore((state) => state.setDraft);
  const addPending = useLiveChatStore((state) => state.addPending);
  const confirm = useLiveChatStore((state) => state.confirm);
  const fail = useLiveChatStore((state) => state.fail);
  const markRetry = useLiveChatStore((state) => state.retry);
  const receive = useLiveChatStore((state) => state.receive);
  const [connection, setConnection] = useState<ConnectionState>('connecting');
  const [error, setError] = useState('');
  const [sendError, setSendError] = useState('');
  const [composerFocused, setComposerFocused] = useState(false);
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const [taskSource, setTaskSource] = useState<LiveChatMessage | null>(null);
  const [taskNotice, setTaskNotice] = useState('');
  const socketRef = useRef<ChatSocket | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const history = useRoomHistory(auth, target, key, messages, scrollRef);
  const refreshHistory = history.refresh;
  const conversationName = getConversationName(conversation);
  const title = `${conversation.kind === 'channel' ? '# ' : ''}${conversationName}`;
  const isTyping = composerFocused && Boolean(draft.trim());

  useEffect(() => {
    let active = true;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let joinTimer: ReturnType<typeof setTimeout> | undefined;
    const typingTimeouts = new Map<string, ReturnType<typeof setTimeout>>();
    const socket: ChatSocket = io(socketUrl, {
      autoConnect: false,
      auth: (callback) => {
        const user = auth.currentUser;
        if (!user || user.uid !== viewerId) { callback({ token: '' }); return; }
        void getIdToken(user).then((token) => callback({ token }), () => callback({ token: '' }));
      },
    });
    socketRef.current = socket;

    function scheduleReconnect() {
      if (!active || retryTimer || !navigator.onLine) return;
      retryTimer = setTimeout(() => {
        retryTimer = undefined;
        if (active && !socket.connected) socket.connect();
      }, 1500);
    }

    function scheduleJoinRetry() {
      if (!active || joinTimer || !navigator.onLine) return;
      joinTimer = setTimeout(() => {
        joinTimer = undefined;
        if (active && socket.connected) void join();
      }, 1500);
    }

    async function join() {
      try {
        const result = await socket.timeout(10000).emitWithAck('room:join', target);
        if (!active) return;
        if (!result.ok) {
          setConnection('error');
          setError(readableError(result));
          if (result.error.code === 'INTERNAL_ERROR') scheduleJoinRetry();
          return;
        }
        if (joinTimer) clearTimeout(joinTimer);
        joinTimer = undefined;
        setConnection('ready');
        setError('');
        void refreshHistory();
      } catch {
        if (active) { setConnection('error'); setError('대화방에 연결하지 못했습니다. 다시 시도해 주세요.'); scheduleJoinRetry(); }
      }
    }

    socket.on('connect', () => {
      if (!active) return;
      for (const timer of typingTimeouts.values()) clearTimeout(timer);
      typingTimeouts.clear();
      setTypingUsers([]);
      if (retryTimer) clearTimeout(retryTimer);
      retryTimer = undefined;
      setConnection('connecting');
      void join();
    });
    socket.on('connect_error', (cause) => {
      if (!active) return;
      setConnection('error');
      const code = (cause as Error & { data?: { code?: string } }).data?.code;
      setError(code === 'UNAUTHENTICATED' ? '로그인 상태를 갱신한 뒤 다시 연결해 주세요.' : '채팅 서버에 연결하지 못했습니다. 서버 상태를 확인해 주세요.');
      if (code !== 'UNAUTHENTICATED' && !socket.active) scheduleReconnect();
    });
    socket.on('disconnect', (reason) => {
      if (!active) return;
      for (const timer of typingTimeouts.values()) clearTimeout(timer);
      typingTimeouts.clear();
      setTypingUsers([]);
      setConnection(navigator.onLine ? 'connecting' : 'offline');
      if (joinTimer) clearTimeout(joinTimer);
      joinTimer = undefined;
      if (reason === 'io server disconnect') scheduleReconnect();
    });
    socket.on('message:created', (message) => {
      if (active && message.workspaceId === workspaceId && message.kind === conversation.kind && message.roomId === conversation.id) receive(key, message);
    });
    socket.on('typing:changed', (payload) => {
      if (!active || payload.userId === viewerId || payload.workspaceId !== workspaceId
        || payload.kind !== conversation.kind || payload.roomId !== conversation.id) return;
      const previous = typingTimeouts.get(payload.userId);
      if (previous) clearTimeout(previous);
      typingTimeouts.delete(payload.userId);
      if (payload.active) {
        setTypingUsers((current) => current.includes(payload.userId) ? current : [...current, payload.userId]);
        typingTimeouts.set(payload.userId, setTimeout(() => {
          typingTimeouts.delete(payload.userId);
          setTypingUsers((current) => current.filter((userId) => userId !== payload.userId));
        }, 5000));
      } else setTypingUsers((current) => current.filter((userId) => userId !== payload.userId));
    });
    function onOffline() {
      if (!active) return;
      setConnection('offline');
      setError('인터넷 연결을 기다리는 중입니다.');
      socket.disconnect();
    }
    function onOnline() {
      if (!active) return;
      setError('');
      setConnection('connecting');
      if (!socket.connected) socket.connect();
      else void join();
    }
    window.addEventListener('offline', onOffline);
    window.addEventListener('online', onOnline);
    if (navigator.onLine) socket.connect();
    else onOffline();

    return () => {
      active = false;
      if (retryTimer) clearTimeout(retryTimer);
      if (joinTimer) clearTimeout(joinTimer);
      for (const timer of typingTimeouts.values()) clearTimeout(timer);
      typingTimeouts.clear();
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('online', onOnline);
      if (socket.connected) socket.emit('room:leave', target, () => {});
      socket.disconnect();
      socket.removeAllListeners();
      if (socketRef.current === socket) socketRef.current = null;
    };
  }, [auth, conversation.id, conversation.kind, key, receive, refreshHistory, target, viewerId, workspaceId]);

  useEffect(() => {
    if (connection !== 'ready' || !isTyping) return;
    const socket = socketRef.current;
    if (!socket?.connected) return;
    const emit = (active: boolean) => socket.emit('typing:set', { ...target, active }, () => {});
    emit(true);
    const timer = setInterval(() => emit(true), 2500);
    return () => {
      clearInterval(timer);
      if (socket.connected) emit(false);
    };
  }, [connection, isTyping, target]);

  async function send(message: LiveChatMessage) {
    const socket = socketRef.current;
    if (!socket?.connected || connection !== 'ready') { fail(key, message.clientMessageId); return; }
    try {
      const result = await socket.timeout(10000).emitWithAck('message:send', { ...target, clientMessageId: message.clientMessageId, content: message.content });
      if (result.ok) { confirm(key, message.clientMessageId, result.data.messageId); setSendError(''); }
      else { fail(key, message.clientMessageId); setSendError(result.error.message); }
    } catch {
      fail(key, message.clientMessageId);
      setSendError('전송 결과를 확인하지 못했습니다. 메시지 옆의 다시 시도를 눌러 주세요.');
    }
  }

  function sendDraft() {
    const content = draft.trim();
    if (connection !== 'ready' || !content || content.length > 4000) return;
    const message = pendingMessage(viewerId, content);
    addPending(key, message);
    setDraft(key, '');
    void send(message);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    sendDraft();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      sendDraft();
    }
  }

  function retry(message: LiveChatMessage) {
    markRetry(key, message.clientMessageId);
    void send(message);
  }

  return <section className={styles.panel} aria-label={`${title} 대화`}>
    <header className={styles.header}>
      <div className={styles.heading}><h1>{title}</h1><p>{conversation.kind === 'channel' ? '팀 채널' : '1:1 대화'} · 실시간 대화</p></div>
      <span className={styles.previewTag} role="status">{connection === 'ready' ? '실시간 연결됨' : connection === 'connecting' ? '연결 중…' : connection === 'offline' ? '오프라인' : '연결 오류'}</span>
    </header>
    {error && <div className={styles.connectionError} role="alert">{error}{connection !== 'offline' && <button type="button" onClick={() => { setError(''); setConnection('connecting'); if (socketRef.current?.connected) socketRef.current.disconnect(); socketRef.current?.connect(); }}>다시 연결</button>}</div>}
    {sendError && <div className={styles.sendError} role="alert">{sendError}<button type="button" onClick={() => setSendError('')} aria-label="전송 오류 닫기">×</button></div>}
    {taskNotice && <div className={styles.taskNotice} role="status">{taskNotice}<button type="button" onClick={() => setTaskNotice('')} aria-label="업무 알림 닫기">×</button></div>}
    {history.error && <div className={styles.connectionError} role="alert">{history.error}<button type="button" onClick={() => void history.refresh()}>다시 불러오기</button></div>}
    <div className={styles.messages} ref={scrollRef} onScroll={history.onScroll} aria-label="메시지 목록">
      <div className={styles.historyControls}>
        {history.loading && <span role="status">이전 대화 불러오는 중…</span>}
        {!history.loading && history.hasMore && <button type="button" disabled={history.loadingOlder} onClick={() => void history.loadOlder()}>{history.loadingOlder ? '불러오는 중…' : '이전 대화 불러오기'}</button>}
        {!history.loading && !history.hasMore && messages.length > 0 && <span>대화의 시작</span>}
        {!history.loading && messages.length === 0 && <span>아직 대화가 없습니다.</span>}
      </div>
      <ol className={styles.messageList}>
        {messages.map((message) => {
          const own = message.senderId === viewerId;
          const author = own ? senderName : memberNames[message.senderId] ?? '팀원';
          return <li className={`${styles.message} ${own ? styles.own : ''}`} key={message.messageId ?? `${message.senderId}:${message.clientMessageId}`}>
            <span className={styles.avatar} aria-hidden="true">{(own ? senderName : author).charAt(0).toUpperCase()}</span>
            <div className={styles.messageBody}><div className={styles.messageMeta}><strong>{author}</strong><time>{new Intl.DateTimeFormat('ko-KR', { hour: 'numeric', minute: '2-digit' }).format(message.createdAt)}</time>{own && <span className={message.status === 'failed' ? styles.failed : ''}>{message.status === 'sending' ? '전송 중…' : message.status === 'failed' ? '전송 실패' : '전송됨'}</span>}</div><p>{message.content}</p>{own && message.status === 'failed' && <button className={styles.retry} type="button" disabled={connection !== 'ready'} onClick={() => retry(message)}>다시 시도</button>}{message.messageId && <span className={styles.messageToolbar}><button className={styles.taskAction} type="button" onClick={() => { setTaskNotice(''); setTaskSource(message); }}>＋ 업무 요청</button></span>}</div>
          </li>;
        })}
      </ol>
    </div>
    <div className={styles.composerWrap}>
      <div className={styles.typingIndicator} role="status" aria-live="polite">{typingUsers.length > 0 && <><span className={styles.typingDots} aria-hidden="true">•••</span>{typingUsers.map((userId) => memberNames[userId] ?? '팀원').join(', ')}님이 입력 중…</>}</div>
      <form className={styles.composer} onSubmit={submit}>
        <textarea aria-label="메시지 입력" value={draft} onChange={(event) => setDraft(key, event.target.value)} onFocus={() => setComposerFocused(true)} onBlur={() => setComposerFocused(false)} onKeyDown={handleKeyDown} maxLength={4000} rows={2} placeholder={`${conversationName}에 메시지 입력`} />
        <button type="submit" disabled={connection !== 'ready' || !draft.trim()}>전송</button>
      </form>
      <div className={styles.composerHint}><span>{connection === 'ready' ? '메시지는 팀원에게 실시간으로 전달됩니다.' : '연결되면 메시지를 보낼 수 있습니다.'}</span><span>Enter 전송 · Shift+Enter 줄바꿈</span></div>
    </div>
    {taskSource?.messageId && <TaskCreateDialog auth={auth} functions={functions} workspaceId={workspaceId} sourceMessageId={taskSource.messageId} sourceContent={taskSource.content} sourceKind={conversation.kind} memberEmails={memberEmails} memberNames={memberNames} onClose={() => setTaskSource(null)} onCreated={() => { setTaskSource(null); setTaskNotice('업무 요청이 저장되었습니다.'); }} />}
  </section>;
}
