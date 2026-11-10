import type { ReactNode } from 'react';
import {
  demoChannels,
  demoDirectMessages,
  getConversationName,
} from '../../features/chat/demoConversations';
import { useWorkspaceNavigationStore } from '../../store/useWorkspaceNavigationStore';
import type { AppView } from '../../types/domain';
import styles from './WorkspaceLayout.module.scss';

interface WorkspaceLayoutProps {
  children: ReactNode;
}

const viewTabs: { id: AppView; label: string }[] = [
  { id: 'chat', label: '채팅' },
  { id: 'board', label: '업무 보드' },
  { id: 'calendar', label: '캘린더' },
];

export function WorkspaceLayout({ children }: WorkspaceLayoutProps) {
  const activeView = useWorkspaceNavigationStore((state) => state.activeView);
  const selectedConversation = useWorkspaceNavigationStore((state) => state.selectedConversation);
  const setView = useWorkspaceNavigationStore((state) => state.setView);
  const selectConversation = useWorkspaceNavigationStore((state) => state.selectConversation);
  const currentTitle = activeView === 'chat'
    ? `${selectedConversation.kind === 'channel' ? '# ' : ''}${getConversationName(selectedConversation)}`
    : viewTabs.find(({ id }) => id === activeView)?.label;

  return (
    <div className={styles.shell}>
      <a className={styles.skipLink} href="#main-content">
        본문으로 이동
      </a>

      <aside className={styles.sidebar} aria-label="워크스페이스 영역">
        <div className={styles.brandRow}>
          <div className={styles.brand}>
            <span className={styles.brandMark} aria-hidden="true">
              t<span>:</span>go
            </span>
            <span className={styles.brandName}>TASKGO</span>
          </div>
          <span className={styles.mobileStatus}>샘플 워크스페이스</span>
        </div>

        <div className={styles.workspaceSection}>
          <p className={styles.sectionLabel}>워크스페이스</p>
          <div className={styles.workspaceCard}>
            <span className={styles.workspaceIcon} aria-hidden="true">T</span>
            <div>
              <strong>Taskgo 데모 팀</strong>
              <span>샘플 데이터</span>
            </div>
          </div>
        </div>

        <nav className={styles.viewNavigation} aria-label="화면 전환">
          <p className={styles.sectionLabel}>화면</p>
          <div className={styles.viewList}>
            {viewTabs.map(({ id, label }) => (
              <button
                key={id}
                className={`${styles.navButton} ${activeView === id ? styles.active : ''}`}
                type="button"
                aria-pressed={activeView === id}
                onClick={() => setView(id)}
              >
                {label}
              </button>
            ))}
          </div>
        </nav>

        <div className={styles.conversationGroups}>
          <section aria-labelledby="channels-heading">
            <h2 id="channels-heading" className={styles.sectionLabel}>채널</h2>
            <ul className={styles.conversationList}>
              {demoChannels.map(({ id, name }) => (
                <li key={id}>
                  <button
                    className={`${styles.conversationButton} ${activeView === 'chat' && selectedConversation.kind === 'channel' && selectedConversation.id === id ? styles.active : ''}`}
                    type="button"
                    aria-pressed={activeView === 'chat' && selectedConversation.kind === 'channel' && selectedConversation.id === id}
                    onClick={() => selectConversation({ kind: 'channel', id })}
                  >
                    <span className={styles.channelIcon} aria-hidden="true">#</span>
                    <span>{name}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>

          <section aria-labelledby="dm-heading">
            <h2 id="dm-heading" className={styles.sectionLabel}>DM</h2>
            <ul className={styles.conversationList}>
              {demoDirectMessages.map(({ id, name, initials }) => (
                <li key={id}>
                  <button
                    className={`${styles.conversationButton} ${activeView === 'chat' && selectedConversation.kind === 'dm' && selectedConversation.id === id ? styles.active : ''}`}
                    type="button"
                    aria-pressed={activeView === 'chat' && selectedConversation.kind === 'dm' && selectedConversation.id === id}
                    onClick={() => selectConversation({ kind: 'dm', id })}
                  >
                    <span className={styles.avatar} aria-hidden="true">{initials}</span>
                    <span>{name}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        </div>

        <p className={styles.sidebarFooter}>대화가 업무가 되는 순간</p>
      </aside>

      <div className={styles.mainColumn}>
        <header className={styles.topbar}>
          <span>{currentTitle}</span>
          <span className={styles.previewBadge}>샘플 화면</span>
        </header>
        <main id="main-content" className={styles.main}>
          {children}
        </main>
      </div>
    </div>
  );
}
