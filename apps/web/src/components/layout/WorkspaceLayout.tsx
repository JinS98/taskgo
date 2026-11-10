import type { ReactNode } from 'react';
import styles from './WorkspaceLayout.module.scss';

interface WorkspaceLayoutProps {
  children: ReactNode;
}

export function WorkspaceLayout({ children }: WorkspaceLayoutProps) {
  return (
    <div className={styles.shell}>
      <a className={styles.skipLink} href="#main-content">
        본문으로 이동
      </a>

      <aside className={styles.sidebar} aria-label="워크스페이스 영역">
        <div className={styles.brand}>
          <span className={styles.brandMark} aria-hidden="true">
            t<span>:</span>go
          </span>
          <span className={styles.brandName}>TASKGO</span>
        </div>

        <div className={styles.workspaceSection}>
          <p className={styles.sectionLabel}>워크스페이스</p>
          <div className={styles.workspaceCard}>
            <span className={styles.workspaceIcon} aria-hidden="true">W</span>
            <div>
              <strong>팀 공간 준비 중</strong>
              <span>워크스페이스 연결 예정</span>
            </div>
          </div>
        </div>

        <div className={styles.navigationSection}>
          <p className={styles.sectionLabel}>탐색 영역</p>
          <p className={styles.emptyNavigation}>채널과 DM 목록이 이곳에 표시됩니다.</p>
        </div>

        <p className={styles.sidebarFooter}>대화가 업무가 되는 순간</p>
        <span className={styles.mobileStatus}>팀 공간 준비 중</span>
      </aside>

      <div className={styles.mainColumn}>
        <header className={styles.topbar}>
          <span>워크스페이스</span>
          <span className={styles.previewBadge}>화면 미리보기</span>
        </header>
        <main id="main-content" className={styles.main}>
          {children}
        </main>
      </div>
    </div>
  );
}
