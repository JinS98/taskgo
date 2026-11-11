# Socket.io 서버

12일차에는 Firebase ID 토큰 인증, 채널·DM 권한 검사, Firestore 메시지 저장과 소켓 전파를 연결했습니다. 13일차에는 웹 채팅을 연결하고 워크스페이스 기본 `전체` 채널을 멤버의 첫 입장 시 서버가 생성하도록 했습니다. 로컬에서는 세 터미널에서 실행합니다.

```bash
npm install
# 첫 번째 터미널: Auth·Firestore 에뮬레이터 시작
npx firebase emulators:start --only auth,firestore --project demo-taskgo
# 두 번째 터미널: 소켓 서버 시작
npm run dev:socket:emulator
curl.exe http://127.0.0.1:3001/healthz
# 세 번째 터미널: 웹 채팅 시작
npm run dev:web:emulator
```

브라우저 통합 테스트는 위 프로세스를 종료한 뒤 `npm run test:live-chat`으로 실행합니다. 두 Chrome 세션을 띄워 채널·DM 송수신과 룸 전환을 확인합니다.

통합 테스트는 위 서버와 에뮬레이터를 종료한 뒤 `npm run test:socket`으로 실행합니다. 이 명령은 에뮬레이터를 자동 실행하고 종료합니다. 기본 주소는 `127.0.0.1:3001`이고, 허용하는 브라우저 Origin은 `http://localhost:5173`과 `http://127.0.0.1:5173`입니다. `PORT`, `SOCKET_HOST`, `SOCKET_ALLOWED_ORIGINS` 환경 변수로 변경할 수 있습니다. 여러 Origin은 쉼표로 구분합니다. 실제 프로젝트에서 `npm run dev:socket` 또는 빌드 후 `npm run start -w @taskgo/socket-server`를 실행할 때는 `FIREBASE_PROJECT_ID`와 Firebase Admin용 애플리케이션 기본 자격 증명이 필요합니다. 배포 시 호스트를 `0.0.0.0`으로 지정하고 실제 웹 Origin을 명시해야 합니다.

클라이언트는 Socket.IO 연결 옵션의 `auth.token`에 로그인 사용자의 Firebase ID 토큰을 넣습니다. 서버는 연결 시 서명·만료·철회·비활성 여부와 이메일 확인 상태를 검사합니다. 토큰 만료 시 연결을 종료하므로 재연결할 때 갱신된 토큰을 전달해야 합니다. 로컬의 `.env.emulator`는 `demo-taskgo`와 Auth·Firestore 에뮬레이터 주소를 지정합니다. 에뮬레이터 호스트 환경 변수는 실제 서비스 환경에 넣지 않습니다.

`GET /healthz`는 `{ "status": "ok", "protocolVersion": 1 }`을 반환합니다. 웹과 서버의 이벤트 타입은 `shared/contracts/src/socket.ts`에 정의했습니다. 연결되면 `server:ready`를 보냅니다. `room:join`은 워크스페이스 멤버십과 채널 소속 또는 DM 참여자를 확인한 후 성공 ACK를 반환합니다. 잘못된 요청은 `INVALID_REQUEST`, 권한이 없으면 `FORBIDDEN`으로 응답합니다.

`message:send`는 룸 참가와 현재 권한을 확인한 뒤 Firestore 트랜잭션에서 멤버십·룸 소속·`clientMessageId`를 다시 검사합니다. 메시지 ID는 사용자 UID와 `clientMessageId`에서 결정하며, 한 사용자는 모든 룸에서 고유한 `clientMessageId`를 써야 합니다. 동일 요청의 재전송은 기존 `messageId`로 성공 ACK를 반환하고 다시 방송하지 않습니다. 이미 사용한 ID를 다른 내용이나 룸에 쓰면 `CONFLICT`를 반환합니다. 저장이 성공한 후 ACK를 보내고 `message:created`를 전달합니다. 수신 직전 각 소켓의 멤버십·DM 참여 상태를 확인하며, 권한이 사라진 소켓은 룸에서 제거합니다. 저장 실패에는 `INTERNAL_ERROR`를 반환합니다. 성공 ACK는 저장 완료를 뜻하며 모든 수신자에게 방송됐다는 보장은 아닙니다. 누락된 방송은 후속 작업의 재조회로 복구합니다.

메시지는 `messages/{messageId}`에 워크스페이스·원본 채널 또는 DM·검증된 발신자·클라이언트 ID·내용·서버 시각으로 저장됩니다. 클라이언트 직접 쓰기는 Firestore 규칙에서 차단합니다. `typing:set`은 아직 `FEATURE_NOT_READY`로 거절합니다. 현재 방송은 단일 소켓 서버 인스턴스에서 동작하며, 다중 인스턴스에는 어댑터와 수신자 권한 검증 설계가 추가로 필요합니다. 웹 클라이언트는 재연결 후 룸에 다시 참가하지만 누락 메시지 조회는 후속 작업입니다.
