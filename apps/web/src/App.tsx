import { WorkspaceLayout } from './components/layout/WorkspaceLayout';
import { getConversationName } from './features/chat/demoConversations';
import { useWorkspaceNavigationStore } from './store/useWorkspaceNavigationStore';
import type { AppView } from './types/domain';
import styles from './App.module.scss';

const upcomingAreas = [
  { id: 'chat', title: '채팅', description: '팀의 대화를 나누고 업무의 출발점을 만듭니다.' },
  { id: 'board', title: '업무 보드', description: '요청과 진행 상태를 한곳에서 확인합니다.' },
  { id: 'calendar', title: '팀 캘린더', description: '업무 마감과 회의 일정을 함께 살펴봅니다.' },
] satisfies { id: AppView; title: string; description: string }[];

const viewCopy: Record<Exclude<AppView, 'chat'>, { eyebrow: string; title: string; description: string }> = {
  board: {
    eyebrow: 'TASK BOARD',
    title: '업무 보드',
    description: '업무 요청과 진행 상황을 함께 볼 수 있는 공간입니다. 현재는 화면 미리보기입니다.',
  },
  calendar: {
    eyebrow: 'TEAM CALENDAR',
    title: '팀 캘린더',
    description: '팀의 업무 마감과 회의 일정을 한눈에 살펴보는 공간입니다. 현재는 화면 미리보기입니다.',
  },
};

export default function App() {
  const activeView = useWorkspaceNavigationStore((state) => state.activeView);
  const selectedConversation = useWorkspaceNavigationStore((state) => state.selectedConversation);

  const selectedName = getConversationName(selectedConversation);
  const currentView = activeView === 'chat'
    ? {
      eyebrow: selectedConversation.kind === 'channel' ? 'CHANNEL PREVIEW' : 'DIRECT MESSAGE PREVIEW',
      title: `${selectedConversation.kind === 'channel' ? '# ' : ''}${selectedName}`,
      description: `${selectedName} ${selectedConversation.kind === 'channel' ? '채널' : 'DM'}의 대화가 이곳에 표시됩니다. 현재는 샘플 목록을 탐색할 수 있습니다.`,
    }
    : viewCopy[activeView];

  return (
    <WorkspaceLayout>
      <section className={styles.hero} aria-labelledby="hero-title">
        <p className={styles.eyebrow}>{currentView.eyebrow}</p>
        <h1 id="hero-title" aria-live="polite">{currentView.title}</h1>
        <p className={styles.description}>
          {currentView.description}
        </p>
        <div className={styles.flow} aria-label="대화에서 일정까지 이어지는 흐름">
          <span>대화</span>
          <span aria-hidden="true">→</span>
          <span>업무</span>
          <span aria-hidden="true">→</span>
          <span>일정</span>
        </div>
      </section>

      <section className={styles.preview} aria-labelledby="preview-title">
        <div className={styles.sectionHeading}>
          <div>
            <p className={styles.eyebrow}>ONE WORKSPACE</p>
            <h2 id="preview-title">대화부터 일정까지</h2>
          </div>
          <span className={styles.pendingLabel}>기능 준비 중</span>
        </div>
        <div className={styles.cardGrid}>
          {upcomingAreas.map((area, index) => (
            <article
              className={`${styles.card} ${activeView === area.id ? styles.activeCard : ''}`}
              key={area.id}
            >
              <span className={styles.cardNumber}>0{index + 1}</span>
              <h3>{area.title}</h3>
              <p>{area.description}</p>
            </article>
          ))}
        </div>
      </section>
    </WorkspaceLayout>
  );
}
