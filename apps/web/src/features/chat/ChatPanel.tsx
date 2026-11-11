import { useEffect, useRef, type FormEvent, type KeyboardEvent } from 'react';
import { getConversationName, type ConversationSelection } from './demoConversations';
import { useDemoChatStore, type DemoChatMessage } from './useDemoChatStore';
import styles from './ChatPanel.module.scss';

interface SampleMessage { id: string; author: string; content: string; time: string }

const sampleThreads: Record<string, SampleMessage[]> = {
  'channel:general': [
    { id: 'welcome', author: '팀원 A', content: '안녕하세요! 이곳에서 팀 전체 대화를 시작할 수 있어요.', time: '오전 10:12' },
    { id: 'plan', author: '팀원 B', content: '대화에서 필요한 업무를 정리하고 함께 진행해 봐요.', time: '오전 10:15' },
  ],
  'channel:project': [
    { id: 'project', author: '팀원 A', content: '프로젝트 진행 상황을 이 채널에서 공유해요.', time: '오전 11:20' },
  ],
  'channel:design': [
    { id: 'design', author: '팀원 B', content: '화면 시안과 피드백을 이곳에 모아 둘게요.', time: '오후 2:05' },
  ],
  'dm:member-a': [
    { id: 'dm-a', author: '팀원 A', content: '안녕하세요! 필요한 내용이 있으면 편하게 메시지를 남겨 주세요.', time: '오전 9:48' },
  ],
  'dm:member-b': [
    { id: 'dm-b', author: '팀원 B', content: '오늘 확인할 내용을 여기서 이야기해요.', time: '오전 10:30' },
  ],
};

const emptyMessages: DemoChatMessage[] = [];
const previewDeliver = () => new Promise<void>((resolve) => window.setTimeout(resolve, 450));

export function ChatPanel({ conversation, workspaceId = 'demo', viewerId = 'demo-user', senderName = '나', deliver = previewDeliver }: {
  conversation: ConversationSelection;
  workspaceId?: string;
  viewerId?: string;
  senderName?: string;
  deliver?: (message: DemoChatMessage) => Promise<void>;
}) {
  const roomKey = `${viewerId}:${workspaceId}:${conversation.kind}:${conversation.id}`;
  const messages = useDemoChatStore((state) => state.messagesByRoom[roomKey] ?? emptyMessages);
  const draft = useDemoChatStore((state) => state.draftsByRoom[roomKey] ?? '');
  const setDraft = useDemoChatStore((state) => state.setDraft);
  const addMessage = useDemoChatStore((state) => state.addMessage);
  const setMessageStatus = useDemoChatStore((state) => state.setMessageStatus);
  const scrollRef = useRef<HTMLDivElement>(null);
  const samples = sampleThreads[`${conversation.kind}:${conversation.id}`] ?? [];
  const conversationName = getConversationName(conversation);
  const title = `${conversation.kind === 'channel' ? '# ' : ''}${conversationName}`;

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [roomKey, messages.length]);

  async function deliverMessage(message: DemoChatMessage) {
    try {
      await deliver(message);
      setMessageStatus(roomKey, message.id, 'preview');
    } catch {
      setMessageStatus(roomKey, message.id, 'failed');
    }
  }

  function sendDraft() {
    const content = draft.trim();
    if (!content || content.length > 2000) return;
    const message: DemoChatMessage = { id: globalThis.crypto.randomUUID(), content, createdAt: Date.now(), status: 'sending' };
    addMessage(roomKey, message);
    setDraft(roomKey, '');
    void deliverMessage(message);
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

  function retry(message: DemoChatMessage) {
    setMessageStatus(roomKey, message.id, 'sending');
    void deliverMessage(message);
  }

  return <section className={styles.panel} aria-label={`${title} 대화`}>
    <header className={styles.header}>
      <div className={styles.heading}><h1>{title}</h1><p>{conversation.kind === 'channel' ? '팀 채널' : '1:1 대화'} · 채팅 화면 미리보기</p></div>
      <span className={styles.previewTag}>로컬 미리보기</span>
    </header>
    <div className={styles.messages} ref={scrollRef} aria-label="메시지 목록">
      <p className={styles.dayMarker}>샘플 대화</p>
      <ol className={styles.messageList}>
        {samples.map((message) => <li className={styles.message} key={message.id}>
          <span className={styles.avatar} aria-hidden="true">{message.author.at(-1)}</span>
          <div className={styles.messageBody}><div className={styles.messageMeta}><strong>{message.author}</strong><time>{message.time}</time><span>샘플</span></div><p>{message.content}</p></div>
        </li>)}
        {messages.map((message) => <li className={`${styles.message} ${styles.own}`} key={message.id}>
          <span className={styles.avatar} aria-hidden="true">{senderName.charAt(0).toUpperCase()}</span>
          <div className={styles.messageBody}><div className={styles.messageMeta}><strong>나</strong><time>{new Intl.DateTimeFormat('ko-KR', { hour: 'numeric', minute: '2-digit' }).format(message.createdAt)}</time><span className={message.status === 'failed' ? styles.failed : ''}>{message.status === 'sending' ? '표시 중…' : message.status === 'failed' ? '미리보기 실패' : '내 화면에만 표시됨'}</span></div><p>{message.content}</p>{message.status === 'failed' && <button className={styles.retry} type="button" onClick={() => retry(message)}>다시 시도</button>}</div>
        </li>)}
      </ol>
    </div>
    <div className={styles.composerWrap}>
      <form className={styles.composer} onSubmit={submit}>
        <textarea aria-label="메시지 입력" value={draft} onChange={(event) => setDraft(roomKey, event.target.value)} onKeyDown={handleKeyDown} maxLength={2000} rows={2} placeholder={`${conversationName}에 메시지 입력`} />
        <button type="submit" disabled={!draft.trim()}>전송</button>
      </form>
      <div className={styles.composerHint}><span>현재 메시지는 이 화면에만 표시됩니다.</span><span>Enter 전송 · Shift+Enter 줄바꿈</span></div>
    </div>
  </section>;
}
