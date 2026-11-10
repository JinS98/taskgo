# Taskgo (태스크고) — t:go

**대화가 업무가 되는 순간**

채팅을 업무로 전환하고 팀 전체의 업무·검수·캘린더를 공유하는 Slack 스타일 협업툴.

> **현재 상태: 개발 시작용 스캐폴드.** 로그인·채팅·업무·AI·배포는 구현되어 있지 않습니다. `apps/web`은 화면 렌더링만 가능한 초기 템플릿이고 `apps/socket-server`, `functions`는 설계용 폴더입니다.

## 기술 구성
- Web: React + TypeScript + Vite + SCSS (CSS Modules는 컴포넌트 화면 구현 시 적용) + Zustand (예정) + FullCalendar (예정)
- 실시간 채팅: Node.js + Socket.io (Cloud Run 예정)
- 인증/DB: Firebase Auth + Cloud Firestore
- 서버 로직: Cloud Functions + 예약 작업 (예정)
- 개발: Firebase Emulator Suite, 로컬 Socket.io

## 실행 (초기 화면만)

```bash
npm install
npm run dev:web
```

Node.js 20.19+ 또는 22.13+ 권장. Firebase 설정이나 결제 계정 없이 기본 화면만 실행됩니다.

초기 설정 검증:

```bash
npm run typecheck
npm run lint
npm run build:web
```

## 문서
- [브랜드 가이드](docs/09-branding.md)
- [전체 일정](docs/00-roadmap.md) — 1~35일차, 1일차 = 3~4시간 개발 세션
- [일차별 체크리스트](docs/daily/)
- [제품 요구사항](docs/01-product-requirements.md)
- [아키텍처](docs/02-architecture.md)
- [데이터 모델](docs/03-data-model.md)
- [실시간 이벤트 계약](docs/04-socket-events.md)
- [업무·검수 정책](docs/05-task-review-policy.md)
- [보안·테스트](docs/06-security-testing.md)
- [비용·배포](docs/07-cost-deployment.md)

기획 원본: https://app.notion.com/p/356c883fa20281eba227cc40d438a92f

## 중요한 원칙
- 메시지는 **Socket.io 서버를 통해서만 저장**하고 Firestore 직접 쓰기를 허용하지 않습니다.
- 업무·캘린더 실시간 동기화는 Firestore `onSnapshot`을 사용합니다.
- DM 원문은 참여자만 볼 수 있지만, 업무 공개 메타데이터는 팀에서 볼 수 있습니다.
- AI는 사용자가 '업무 생성'을 누를 때만 호출합니다.
- Cloud Run 무료 할당량을 목표로 하되 **무료 청구는 보장하지 않습니다**.
