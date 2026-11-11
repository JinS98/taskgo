import { useEffect, useRef, type ReactNode } from 'react';
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
  accountControls?: ReactNode;
  workspaceName?: string;
  canManageWorkspace?: boolean;
}

const viewTabs: { id: AppView; label: string }[] = [
  { id: 'chat', label: '채팅' },
  { id: 'board', label: '업무 보드' },
  { id: 'calendar', label: '캘린더' },
];

function NavigationIcon({ view }: { view: AppView }) {
  const paths: Record<AppView, ReactNode> = {
    chat: <><path d="M4 5.5h16v11H9l-5 3v-14Z" /><path d="M8 9.5h8M8 12.5h5" /></>,
    board: <><rect x="4" y="4" width="7" height="7" rx="1.5" /><rect x="13" y="4" width="7" height="7" rx="1.5" /><rect x="4" y="13" width="7" height="7" rx="1.5" /><rect x="13" y="13" width="7" height="7" rx="1.5" /></>,
    calendar: <><rect x="4" y="6" width="16" height="14" rx="2" /><path d="M8 4v4m8-4v4M4 10h16" /><path d="M9 14h2m3 0h2" /></>,
    workspace: <><circle cx="12" cy="12" r="3" /><path d="M12 2.5v2m0 15v2M2.5 12h2m15 0h2M5.3 5.3l1.4 1.4m10.6 10.6 1.4 1.4M18.7 5.3l-1.4 1.4M6.7 17.3l-1.4 1.4" /></>,
  };
  return <span className={styles.navIcon}><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{paths[view]}</svg></span>;
}

export function WorkspaceLayout({ children, accountControls, workspaceName, canManageWorkspace = false }: WorkspaceLayoutProps) {
  const mainRef = useRef<HTMLElement>(null);
  const activeView = useWorkspaceNavigationStore((state) => state.activeView);
  const selectedConversation = useWorkspaceNavigationStore((state) => state.selectedConversation);
  const setView = useWorkspaceNavigationStore((state) => state.setView);
  const selectConversation = useWorkspaceNavigationStore((state) => state.selectConversation);
  const currentTitle = activeView === 'workspace' ? '워크스페이스 관리' : activeView === 'chat'
    ? `${selectedConversation.kind === 'channel' ? '# ' : ''}${getConversationName(selectedConversation)}`
    : viewTabs.find(({ id }) => id === activeView)?.label;

  useEffect(() => { if (mainRef.current) mainRef.current.scrollTop = 0; }, [activeView, workspaceName]);

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
          <span className={styles.mobileStatus}>{workspaceName ?? '샘플 워크스페이스'}</span>
        </div>

        <div className={styles.workspaceSection}>
          <p className={styles.sectionLabel}>워크스페이스</p>
          <div className={styles.workspaceCard}>
            <span className={styles.workspaceIcon} aria-hidden="true">T</span>
            <div>
              <strong>{workspaceName ?? 'Taskgo 데모 팀'}</strong>
              <span>{canManageWorkspace ? '워크스페이스 장' : workspaceName ? '멤버' : '샘플 데이터'}</span>
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
                <NavigationIcon view={id} /><span>{label}</span>
              </button>
            ))}
          </div>
          {canManageWorkspace && <div className={styles.manageNavigation}><p className={styles.sectionLabel}>관리</p><button className={`${styles.navButton} ${activeView === 'workspace' ? styles.active : ''}`} type="button" aria-pressed={activeView === 'workspace'} onClick={() => setView('workspace')}><NavigationIcon view="workspace" /><span>워크스페이스 관리</span></button></div>}
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
          <div className={styles.topbarContext}><span className={styles.topbarTitle}>{currentTitle}</span>{activeView !== 'workspace' && <span className={styles.previewBadge}>샘플 화면</span>}</div>
          <div className={styles.topbarActions}>
            {accountControls}
          </div>
        </header>
        <main id="main-content" className={styles.main} ref={mainRef}>
          {children}
        </main>
      </div>
    </div>
  );
}
