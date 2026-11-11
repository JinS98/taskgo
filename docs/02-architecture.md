# 아키텍처

```text
React / TypeScript / Vite / SCSS / Zustand
  | Firebase SDK              | Socket.io client
  v                           v
Firebase Auth/Firestore     Node.js Socket.io server (Cloud Run)
  ^                           | Firebase Admin SDK
  |                           v
  +------------------------ Firestore
  |
Cloud Functions (워크스페이스·초대) + Scheduler (검수/알림/AI 예정)
```

## 경계
- Auth: Firebase Auth의 이메일·비밀번호와 Google 로그인. 두 방식 모두 Firebase 사용자 ID로 식별하고, 로그인 방식 전환 시 계정 연결·충돌을 처리한다. 소켓 연결 시 ID 토큰 서버 검증.
- 워크스페이스 생성: 확인된 사용자가 Firestore에 공간·장 멤버십·본인 목록을 일괄 기록한다. 보안 규칙은 세 문서의 생성자·역할·필드를 검증한다. 초대나 메일 발송은 이 단계에서 수행하지 않는다.
- 워크스페이스 초대: 호출형 함수가 장의 권한을 확인하고 이메일 주소에 7일 기한의 일회용 링크를 생성한다. 링크 수락 시 확인된 이메일 일치·만료·철회·사용 여부를 트랜잭션에서 확인하고 멤버십을 원자적으로 생성한다. 로컬에서는 링크를 로그와 화면에 표시한다. 실제 메일 발송은 SMTP 비밀값 및 Blaze 설정 후 사용한다.
- 채팅 쓰기: Socket.io 서버만 허용. 서버에서 참여 권한 검사 → Firestore 저장 → ACK → 룸 전파.
- 채팅 읽기: 권한을 확인한 Firestore 조회(과거), 새 메시지 Socket.io 이벤트.
- 업무/캘린더: Firestore 구독(`onSnapshot`) + 서버 검증이 필요한 상태 변경은 Functions.
- 연결 끊김: 소켓 자동 재연결 + 마지막 확인 메시지 이후 재조회 + 중복 제거.
- Cloud Run 단일 인스턴스는 **포트폴리오 검증용 제한**. 다중 인스턴스에서는 인스턴스 간 브로드캐스트 계층 필요.

## 코드 경계 (2일차 구조)
- `apps/web/src/features/`: 인증·워크스페이스·채팅·업무·캘린더 기능별 UI와 로직. 공용 UI는 `components/`, 재사용 훅은 `hooks/`에 둔다.
- `apps/web/src/types/domain.ts`: 화면·상태 관리에 필요한 공통 ID·역할·뷰 이름을 정의한다. 워크스페이스·초대 스키마와 읽기 규칙은 8일차에 구현했고 채팅·업무 필드는 후속 일차에 확정한다.
- `apps/web/src/config/env.ts`: Vite 클라이언트 설정을 읽는다. Firebase 설정이 없으면 인증 화면 대신 누락된 변수 안내를 표시한다.
- `apps/web/src/services/firebase.ts`는 Firebase Auth·Firestore·Functions를 초기화하고 명시적 설정에서만 에뮬레이터에 연결한다. `functions/src/index.ts`는 서버 권한을 검증한다. 웹 채팅은 Firebase ID 토큰으로 Socket.IO에 연결하고 채널·DM 목록은 Firestore에서 구독한다. Zustand는 룸별 메시지와 초안을 보관하며 로그아웃 시 초기화한다.
- `shared/contracts/`는 웹과 소켓 서버 사이의 이벤트 타입 계약이다. `apps/socket-server/`는 HTTP 헬스체크, 소켓 연결, Firebase Admin 토큰 검증과 워크스페이스·채널·DM 접근 검사, 트랜잭션 메시지 저장과 권한별 전파를 수행한다. 기본 `전체` 채널은 멤버의 첫 입장 시 서버가 생성한다. Origin 제한은 인증을 대신하지 않는다. 토큰 만료 시 연결을 종료하고 룸 참가·메시지 요청마다 현재 멤버십을 확인한다. 소켓 룸 전파는 현재 단일 서버 인스턴스만 지원하며, 재연결 중 누락 메시지 복구는 후속 작업이다.
- Vite 프로젝트 루트가 `apps/web`이므로 웹 환경 파일은 `apps/web/.env.local`에 둔다. `VITE_` 값은 클라이언트에 공개되며 서버 비밀키는 여기에 두지 않는다.

## 배포 후보
프론트 Firebase Hosting, 소켓 Cloud Run, 백엔드 Functions. 프론트 호스팅은 최종 배포 시 선택할 수 있음.
