import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { getIdToken, type Auth } from 'firebase/auth';
import { io, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, RoomTarget, ServerToClientEvents, SocketAck } from '@taskgo/contracts';
import { socketUrl } from '../../config/env';
import { getConversationName, type ConversationSelection } from './demoConversations';
import { liveRoomKey, useLiveChatStore, type LiveChatMessage } from './useLiveChatStore';
import styles from './ChatPanel.module.scss';

type ChatSocket = Socket<ServerToClientEvents, ClientToServerEvents>;
type ConnectionState = 'connecting' | 'ready' | 'error';
const emptyMessages: LiveChatMessage[] = [];

function readableError(result: SocketAck<unknown>): string {
  return result.ok ? '' : result.error.message;
}

function pendingMessage(viewerId: string, content: string): LiveChatMessage {
  return { clientMessageId: crypto.randomUUID(), senderId: viewerId, content, createdAt: Date.now(), status: 'sending' };
}

export function LiveChatPanel({ auth, conversation, workspaceId, viewerId, senderName, memberEmails }: {
  auth: Auth;
  conversation: ConversationSelection;
  workspaceId: string;
  viewerId: string;
  senderName: string;
  memberEmails: Record<string, string>;
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
  const socketRef = useRef<ChatSocket | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const conversationName = getConversationName(conversation);
  const title = `${conversation.kind === 'channel' ? '# ' : ''}${conversationName}`;

  useEffect(() => {
    let active = true;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    const socket: ChatSocket = io(socketUrl, {
      autoConnect: false,
      auth: (callback) => {
        const user = auth.currentUser;
        if (!user || user.uid !== viewerId) { callback({ token: '' }); return; }
        void getIdToken(user).then((token) => callback({ token }), () => callback({ token: '' }));
      },
    });
    socketRef.current = socket;

    async function join() {
      try {
        const result = await socket.timeout(10000).emitWithAck('room:join', target);
        if (!active) return;
        if (!result.ok) { setConnection('error'); setError(readableError(result)); return; }
        setConnection('ready');
        setError('');
      } catch {
        if (active) { setConnection('error'); setError('대화방에 연결하지 못했습니다. 다시 시도해 주세요.'); }
      }
    }

    socket.on('connect', () => { if (active) { setConnection('connecting'); void join(); } });
    socket.on('connect_error', (cause) => {
      if (!active) return;
      setConnection('error');
      const code = (cause as Error & { data?: { code?: string } }).data?.code;
      setError(code === 'UNAUTHENTICATED' ? '로그인 상태를 갱신한 뒤 다시 연결해 주세요.' : '채팅 서버에 연결하지 못했습니다. 서버 상태를 확인해 주세요.');
    });
    socket.on('disconnect', (reason) => {
      if (!active) return;
      setConnection('connecting');
      if (reason === 'io server disconnect') retryTimer = setTimeout(() => socket.connect(), 700);
    });
    socket.on('message:created', (message) => {
      if (active && message.workspaceId === workspaceId && message.kind === conversation.kind && message.roomId === conversation.id) receive(key, message);
    });
    socket.connect();

    return () => {
      active = false;
      if (retryTimer) clearTimeout(retryTimer);
      if (socket.connected) socket.emit('room:leave', target, () => {});
      socket.disconnect();
      socket.removeAllListeners();
      if (socketRef.current === socket) socketRef.current = null;
    };
  }, [auth, conversation.id, conversation.kind, key, receive, target, viewerId, workspaceId]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [key, messages.length]);

  async function send(message: LiveChatMessage) {
    const socket = socketRef.current;
    if (!socket?.connected || connection !== 'ready') { fail(key, message.clientMessageId); return; }
    try {
      const result = await socket.timeout(10000).emitWithAck('message:send', { ...target, clientMessageId: message.clientMessageId, content: message.content });
      if (result.ok) confirm(key, message.clientMessageId, result.data.messageId);
      else { fail(key, message.clientMessageId); setError(result.error.message); }
    } catch {
      fail(key, message.clientMessageId);
      setError('전송 결과를 확인하지 못했습니다. 같은 메시지를 다시 시도할 수 있습니다.');
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
      <span className={styles.previewTag} role="status">{connection === 'ready' ? '실시간 연결됨' : connection === 'connecting' ? '연결 중…' : '연결 오류'}</span>
    </header>
    {error && <div className={styles.connectionError} role="alert">{error}<button type="button" onClick={() => { setError(''); setConnection('connecting'); if (socketRef.current?.connected) socketRef.current.disconnect(); socketRef.current?.connect(); }}>다시 연결</button></div>}
    <div className={styles.messages} ref={scrollRef} aria-label="메시지 목록">
      <p className={styles.dayMarker}>현재 연결 이후의 대화</p>
      <ol className={styles.messageList}>
        {messages.map((message) => {
          const own = message.senderId === viewerId;
          const author = own ? '나' : memberEmails[message.senderId] ?? '팀원';
          return <li className={`${styles.message} ${own ? styles.own : ''}`} key={message.messageId ?? `${message.senderId}:${message.clientMessageId}`}>
            <span className={styles.avatar} aria-hidden="true">{(own ? senderName : author).charAt(0).toUpperCase()}</span>
            <div className={styles.messageBody}><div className={styles.messageMeta}><strong>{author}</strong><time>{new Intl.DateTimeFormat('ko-KR', { hour: 'numeric', minute: '2-digit' }).format(message.createdAt)}</time>{own && <span className={message.status === 'failed' ? styles.failed : ''}>{message.status === 'sending' ? '전송 중…' : message.status === 'failed' ? '전송 실패' : '전송됨'}</span>}</div><p>{message.content}</p>{own && message.status === 'failed' && <button className={styles.retry} type="button" disabled={connection !== 'ready'} onClick={() => retry(message)}>다시 시도</button>}</div>
          </li>;
        })}
      </ol>
    </div>
    <div className={styles.composerWrap}>
      <form className={styles.composer} onSubmit={submit}>
        <textarea aria-label="메시지 입력" value={draft} onChange={(event) => setDraft(key, event.target.value)} onKeyDown={handleKeyDown} maxLength={4000} rows={2} placeholder={`${conversationName}에 메시지 입력`} />
        <button type="submit" disabled={connection !== 'ready' || !draft.trim()}>전송</button>
      </form>
      <div className={styles.composerHint}><span>{connection === 'ready' ? '메시지는 팀원에게 실시간으로 전달됩니다.' : '연결되면 메시지를 보낼 수 있습니다.'}</span><span>Enter 전송 · Shift+Enter 줄바꿈</span></div>
    </div>
  </section>;
}
