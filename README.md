# Taskgo (태스크고) — t:go

**대화가 업무가 되는 순간**

채팅을 업무로 전환하고 팀 전체의 업무·검수·캘린더를 공유하는 Slack 스타일 협업툴.

> **현재 상태: 13일차 실시간 채팅 연결 완료.** 로그인한 워크스페이스의 채널·DM 화면은 소켓 서버에 연결되어 새 메시지를 주고받습니다. 샘플 화면은 독립 미리보기에서만 사용합니다. 과거 메시지 조회와 연결이 끊긴 동안의 누락 복구는 후속 작업입니다. 초대 메일의 실제 발송과 Functions 배포는 SMTP·Blaze 설정 전입니다.

## 기술 구성
- Web: React + TypeScript + Vite + SCSS Modules + Zustand + FullCalendar (예정)
- 실시간 채팅: Node.js + Socket.io (Cloud Run 예정)
- 인증/DB: Firebase Auth + Cloud Firestore
- 서버 로직: Cloud Functions (워크스페이스·초대), 예약 작업 (예정)
- 개발: Firebase Emulator Suite, 로컬 Socket.io

## 실행

```bash
npm install
npm run emulators
# 다른 터미널에서
npm run dev:socket:emulator
# 또 다른 터미널에서
npm run dev:web:emulator
```

Node.js 22.13+와 Java 21이 필요합니다. 이메일 가입 후 에뮬레이터 UI 로그의 확인 링크를 열고 앱에서 **인증 확인**을 누르세요. 워크스페이스를 만들면 장 권한이 부여됩니다. 장에게만 보이는 사이드바의 **워크스페이스 관리**에서 멤버와 초대 현황을 확인하고 이메일 주소로 초대할 수 있습니다. 초대 링크는 로컬에서는 함수 로그와 관리 화면에 표시됩니다. 초대받은 주소로 로그인한 사용자가 링크에서 **초대 수락**을 눌러 가입합니다.

로그인한 워크스페이스의 채팅에서는 기본 `전체` 채널로 입장하며, 처음 입장할 때 서버가 멤버십을 확인하고 채널을 만듭니다. Enter로 전송하고 Shift+Enter로 줄을 바꿉니다. 새 메시지는 같은 룸의 다른 브라우저에 바로 표시됩니다. 전송 실패 시 재시도할 수 있고, 현재 탭의 메시지·초안은 로그아웃하면 지워집니다. DM은 기존에 생성된 룸만 목록에 나타납니다. 독립 미리보기의 샘플 채팅은 `npm run test:chat`으로 확인합니다.

Auth·Firestore 에뮬레이터를 실행한 뒤 `npm run dev:socket:emulator`로 소켓 서버를 별도 실행합니다. `http://127.0.0.1:3001/healthz`에서 상태를 확인할 수 있습니다. `npm run test:socket`은 서버 권한과 저장을, `npm run test:live-chat`은 두 Chrome 세션의 웹 송수신과 룸 전환을 검증합니다. 두 테스트는 기존 에뮬레이터·소켓 서버를 종료한 상태에서 실행하세요. 설정과 이벤트 설명은 [소켓 서버 문서](apps/socket-server/README.md)를 참고하세요.

## Firebase 개발 환경

실제 Firebase 프로젝트는 `taskgo-jins98`, 웹 앱은 `taskgo-web`입니다. 이메일·비밀번호와 Google 로그인 공급자를 활성화했고, Cloud Firestore 기본 데이터베이스는 서울(`asia-northeast3`)에 생성했습니다. [Firestore 규칙](firestore.rules)은 확인된 사용자의 워크스페이스·장 멤버십·본인 목록을 일괄 생성할 때만 클라이언트 쓰기를 허용합니다. 초대·채팅·업무 쓰기는 계속 차단합니다. 이 규칙은 실제 프로젝트에 배포했지만 초대용 Functions는 아직 배포하지 않았습니다.

로컬 에뮬레이터는 Java 21이 필요합니다. 터미널 두 개에서 실행합니다.

```bash
npm run emulators
npm run dev:web:emulator
```

인증 에뮬레이터는 `127.0.0.1:9099`, Firestore는 `127.0.0.1:8080`, Functions는 `127.0.0.1:5001`, 에뮬레이터 UI는 `127.0.0.1:4000`을 사용합니다. 웹 앱의 `emulator` 모드는 [가상 프로젝트 설정](apps/web/.env.emulator)을 사용하므로 실제 Firebase 프로젝트에 접속하지 않습니다. Google 로그인 버튼은 에뮬레이터의 가상 계정 선택 창을 엽니다.

로그인한 계정의 **계정** 메뉴에서 Google 로그인 또는 비밀번호 로그인을 연결할 수 있습니다. 이미 다른 계정에 연결된 로그인 방식은 자동 병합하지 않고 오류를 표시합니다. 비밀번호 추가에는 최근 로그인이 필요할 수 있습니다.

실제 프로젝트 설정으로 `npm run dev:web`을 실행하면 워크스페이스 만들기까지 사용할 수 있습니다. 초대 메일 보내기는 Functions 배포 전까지 사용할 수 없으며, 워크스페이스를 만든 직후 자동으로 초대가 발송되지는 않습니다.

실제 프로젝트 웹 설정은 [환경 변수 예시](apps/web/.env.example)를 `apps/web/.env.local`로 복사해 입력합니다. 이 PC에는 웹 앱 설정이 입력되어 있습니다. `VITE_USE_FIREBASE_EMULATORS=false`일 때만 실제 프로젝트를 사용하며 `.env.local`은 Git에서 제외됩니다.

인증 공급자 설정을 다시 배포하려면 [예시 설정](firebase.auth.example.json)을 `firebase.auth.local.json`으로 복사하고 Google OAuth 지원 이메일을 입력한 뒤 다음 명령을 사용합니다. 로컬 설정 파일은 Git에서 제외됩니다.

```bash
npx firebase deploy --only auth --config firebase.auth.local.json --project taskgo-jins98
```

## 폴더 구조

| 경로 | 역할 |
|---|---|
| `apps/web/src/features/` | 인증·워크스페이스·채팅·업무·캘린더별 화면과 로직 |
| `apps/web/src/components/`, `hooks/` | 도메인에 묶이지 않는 UI와 재사용 훅 |
| `apps/web/src/services/`, `store/` | Firebase 연결과 클라이언트 상태 관리 |
| `apps/web/src/types/`, `config/` | 웹 앱 공통 타입과 환경 설정 |
| `shared/contracts/` | 웹·소켓 서버 간 이벤트 계약 |
| `apps/socket-server/` | 채팅 서버의 연결·인증·룸 권한 검사·메시지 저장과 전파 |
| `functions/` | 워크스페이스·초대 서버 함수와 SMTP 배포 설정 안내 |

## 환경 변수

웹 앱의 예시는 `apps/web/.env.example`에 있습니다. 실제 프로젝트를 사용할 때 웹 설정을 `apps/web/.env.local`에 입력합니다. `.env.local`은 Git에서 제외됩니다.

`VITE_` 변수는 브라우저 번들에 공개되므로 서버 비밀키를 넣지 않습니다. 웹 설정의 소켓 주소 기본값은 `http://127.0.0.1:3001`이며 `VITE_SOCKET_URL`로 변경할 수 있습니다. 소켓 서버는 `FIREBASE_PROJECT_ID`와 Firebase Admin 자격 증명을 서버 환경에서 읽습니다.

초기 설정 검증:

```bash
npm run typecheck
npm run lint
npm run build:web
npm run build:functions
npm run build:socket
npm run test:socket
npm run test:live-chat
npm run test:ui
npm run test:firebase
npm run test:auth
npm run test:workspace
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
