# Taskgo (태스크고) — t:go

**대화가 업무가 되는 순간**

채팅을 업무로 전환하고 팀 전체의 업무·검수·캘린더를 공유하는 Slack 스타일 협업툴.

> **현재 상태: 20일차 업무 요청 응답 완료(로컬 에뮬레이터 기준).** 채널·DM 메시지에서 업무를 요청하고, 실제 업무 보드에서 담당자가 수락·거절·마감 변경을 제안할 수 있습니다. 요청자는 제안한 마감을 승인·거절합니다. 캘린더는 아직 미리보기 화면입니다. 초대 메일의 실제 발송과 Functions 배포는 SMTP·Blaze 설정 전입니다.

## 기술 구성
- Web: React + TypeScript + Vite + SCSS Modules + Zustand + FullCalendar (예정)
- 실시간 채팅: Node.js + Socket.io (Cloud Run 예정)
- 인증/DB: Firebase Auth + Cloud Firestore
- 서버 로직: Cloud Functions (워크스페이스·초대·업무 생성·요청 응답), 예약 작업 (예정)
- 개발: Firebase Emulator Suite, 로컬 Socket.io

## 실행

```bash
npm install
npm run dev:all
```

`npm run dev:all`은 Firebase 에뮬레이터·채팅 서버·웹 개발 서버를 한 터미널에서 시작하고 접속 주소를 출력합니다. 기존 웹 서버가 5173 포트를 사용 중이면 다음 빈 포트를 선택합니다. Ctrl+C로 함께 종료합니다. 이 명령은 실제 Firebase 데이터와 분리된 `demo-taskgo` 프로젝트를 사용하므로 새 계정과 워크스페이스를 만들어 확인하세요. Node.js 22.13+와 Java 21 이상이 필요합니다. 시작 스크립트는 설치된 JDK 21 이상을 찾아 Firebase 에뮬레이터에 사용하므로 시스템 기본 Java가 17이어도 실행할 수 있습니다. 이메일 가입 후 에뮬레이터 UI 로그의 확인 링크를 열고 앱에서 **인증 확인**을 누르세요. 워크스페이스를 만들면 장 권한이 부여됩니다. 장에게만 보이는 사이드바의 **워크스페이스 관리**에서 멤버와 초대 현황을 확인하고 이메일 주소로 초대할 수 있습니다. 초대 링크는 로컬에서는 함수 로그와 관리 화면에 표시됩니다. 초대받은 주소로 로그인한 사용자가 링크에서 **초대 수락**을 눌러 가입합니다.

로그인한 워크스페이스의 채팅에서는 기본 `전체` 채널로 입장하며, 처음 입장할 때 서버가 멤버십을 확인하고 채널을 만듭니다. Enter로 전송하고 Shift+Enter로 줄을 바꿉니다. 새 메시지는 같은 룸의 다른 브라우저에 바로 표시됩니다. 저장된 메시지의 **업무 요청**을 누르면 원문을 참고하며 제목·담당자·마감·예상 시간·검수를 편집하고 최종 저장할 수 있습니다. 모달의 **초안 제안받기**를 직접 누르면 서버가 접근 권한을 확인하고 같은 대화의 선택 메시지까지 최대 8개를 사용합니다. OpenAI API 키가 설정되면 이 문맥을 전송해 AI 후보를 받고, 로컬 에뮬레이터에 키가 없으면 외부 전송 없이 문장 기반 초안을 보여줍니다. 로컬 초안은 AI 생성 결과가 아님을 표시합니다. 후보를 선택해도 업무가 저장되지는 않으며 제목을 수정한 뒤 **업무 요청 저장**을 눌러야 확정됩니다. 제목과 업무 메타데이터는 팀 전체에 공개되며 DM 원문은 업무에 복사되지 않습니다. 같은 채널·DM에 있는 팀원이 입력하면 작성 중 표시가 나타나고 입력을 멈추거나 대화방을 떠나면 사라집니다. 과거 대화는 최근 30개부터 표시하고 상단의 **이전 대화 불러오기**로 계속 확인할 수 있습니다. 오프라인에서는 전송을 막고 초안은 유지합니다. 온라인 복귀 후 다시 인증·룸 참가를 거쳐 서버의 저장 내역을 읽고 누락분을 채웁니다. 연결·전송 오류를 구분해 표시하고 전송 실패한 메시지는 옆의 **다시 시도**로 재전송할 수 있습니다. 현재 탭의 메시지·초안은 로그아웃하면 지워집니다. DM은 기존에 생성된 룸만 목록에 나타납니다. 독립 미리보기의 샘플 채팅은 `npm run test:chat`으로 확인합니다.

사이드바의 **업무 보드**는 워크스페이스 업무를 실시간으로 보여줍니다. 담당자는 `REQUESTED` 업무를 수락·거절하거나 새 마감을 제안할 수 있고, 요청자는 제안을 승인·거절할 수 있습니다. 승인 전 기존 마감은 유지되며 승인 후 담당자가 별도로 수락합니다. [새 UI/UX 검토 시안](docs/design/README.md)은 현재 앱의 테마에 적용하지 않은 별도 화면입니다.

Auth·Firestore 에뮬레이터를 실행한 뒤 `npm run dev:socket:emulator`로 소켓 서버를 별도 실행합니다. `http://127.0.0.1:3001/healthz`에서 상태를 확인할 수 있습니다. `npm run test:socket`은 서버 권한·저장·타이핑 전파를, `npm run test:live-chat`은 Auth·Firestore·Functions 에뮬레이터와 두 Chrome 세션으로 채널·DM 업무 요청, 마감 변경·수락·거절, 웹 송수신·과거 내역·오프라인 복구를 검증합니다. 두 테스트는 기존 에뮬레이터·소켓 서버를 종료한 상태에서 실행하세요. 설정과 이벤트 설명은 [소켓 서버 문서](apps/socket-server/README.md)를 참고하세요.

`npm run test:task-model`은 별도 Auth·Firestore·Functions 에뮬레이터에서 업무 스키마·권한·DM 원문 보호와 요청 응답 상태 전이를 확인합니다. 기본 포트를 사용하므로 `npm run dev:all`을 종료한 뒤 실행하세요. 요청 필드와 상태 정책은 [데이터 모델](docs/03-data-model.md)에 정리했습니다.

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
- AI는 사용자가 **초안 제안받기**를 누를 때만 호출합니다. 로컬 에뮬레이터는 키가 없으면 문장 기반 초안을 대신 표시합니다.
- Cloud Run 무료 할당량을 목표로 하되 **무료 청구는 보장하지 않습니다**.
