import { WorkspaceLayout } from './components/layout/WorkspaceLayout';
import styles from './App.module.scss';

const upcomingAreas = [
  { title: '채팅', description: '팀의 대화를 나누고 업무의 출발점을 만듭니다.' },
  { title: '업무 보드', description: '요청과 진행 상태를 한곳에서 확인합니다.' },
  { title: '팀 캘린더', description: '업무 마감과 회의 일정을 함께 살펴봅니다.' },
];

export default function App() {
  return (
    <WorkspaceLayout>
      <section className={styles.hero} aria-labelledby="hero-title">
        <p className={styles.eyebrow}>TASKGO WORKSPACE</p>
        <h1 id="hero-title">대화가 업무가 되는 순간</h1>
        <p className={styles.description}>
          채팅에서 시작한 아이디어를 업무로 연결하고,
          <br className={styles.desktopBreak} /> 팀의 진행 상황을 함께 바라보는 공간입니다.
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
            <h2 id="preview-title">하나의 흐름으로 이어집니다</h2>
          </div>
          <span className={styles.pendingLabel}>기능 준비 중</span>
        </div>
        <div className={styles.cardGrid}>
          {upcomingAreas.map((area, index) => (
            <article className={styles.card} key={area.title}>
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
