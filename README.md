# Taskgo (태스크고) — t:go

**대화가 업무가 되는 순간**

채팅을 업무로 전환하고 팀 전체의 업무·검수·캘린더를 공유하는 Slack 스타일 협업툴.

> **현재 상태: 3일차 레이아웃 구현.** 반응형 워크스페이스 화면을 미리 볼 수 있습니다. 로그인·채팅·업무·AI·배포는 구현되어 있지 않으며 `apps/socket-server`, `functions`는 설계용 폴더입니다.

## 기술 구성
- Web: React + TypeScript + Vite + SCSS Modules + Zustand (예정) + FullCalendar (예정)
- 실시간 채팅: Node.js + Socket.io (Cloud Run 예정)
- 인증/DB: Firebase Auth + Cloud Firestore
- 서버 로직: Cloud Functions + 예약 작업 (예정)
- 개발: Firebase Emulator Suite, 로컬 Socket.io

## 실행 (레이아웃 미리보기)

```bash
npm install
npm run dev:web
```

Node.js 20.19+ 또는 22.13+ 권장. Firebase 설정이나 결제 계정 없이 레이아웃 미리보기가 실행됩니다.

## 폴더 구조

| 경로 | 역할 |
|---|---|
| `apps/web/src/features/` | 인증·워크스페이스·채팅·업무·캘린더별 화면과 로직 |
| `apps/web/src/components/`, `hooks/` | 도메인에 묶이지 않는 UI와 재사용 훅 |
| `apps/web/src/services/`, `store/` | 외부 서비스 연결과 클라이언트 상태 (후속 일차에서 구현) |
| `apps/web/src/types/`, `config/` | 웹 앱 공통 타입과 환경 설정 |
| `shared/contracts/` | 웹·소켓 서버 간 이벤트 계약 (10일차 이후 구현) |
| `apps/socket-server/`, `functions/` | 채팅 서버와 서버 권한 로직 (후속 일차에서 구현) |

## 환경 변수

웹 앱의 예시는 `apps/web/.env.example`에 있습니다. Firebase를 연결하는 6일차에 이를 `apps/web/.env.local`로 복사하고 웹 클라이언트 설정값을 채웁니다. 지금은 복사하지 않아도 기본 화면이 실행됩니다. `.env.local`은 Git에서 제외됩니다.

`VITE_` 변수는 브라우저 번들에 공개되므로 서버 비밀키를 넣지 않습니다. 소켓 주소의 기본값은 `http://localhost:3001`이며, 실제 서버 연결은 10일차에 추가합니다.

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
