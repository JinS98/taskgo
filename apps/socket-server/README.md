# Socket.io 서버

11일차에는 Firebase ID 토큰 인증과 워크스페이스·채널·DM 권한 검사를 연결했습니다. 로컬에서는 두 터미널에서 실행합니다.

```bash
npm install
# 첫 번째 터미널: Auth·Firestore 에뮬레이터 시작
npx firebase emulators:start --only auth,firestore --project demo-taskgo
# 두 번째 터미널: 소켓 서버 시작
npm run dev:socket:emulator
curl.exe http://127.0.0.1:3001/healthz
```

통합 테스트는 위 서버와 에뮬레이터를 종료한 뒤 `npm run test:socket`으로 실행합니다. 이 명령은 에뮬레이터를 자동 실행하고 종료합니다. 기본 주소는 `127.0.0.1:3001`이고, 허용하는 브라우저 Origin은 `http://localhost:5173`과 `http://127.0.0.1:5173`입니다. `PORT`, `SOCKET_HOST`, `SOCKET_ALLOWED_ORIGINS` 환경 변수로 변경할 수 있습니다. 여러 Origin은 쉼표로 구분합니다. 실제 프로젝트에서 `npm run dev:socket` 또는 빌드 후 `npm run start -w @taskgo/socket-server`를 실행할 때는 `FIREBASE_PROJECT_ID`와 Firebase Admin용 애플리케이션 기본 자격 증명이 필요합니다. 배포 시 호스트를 `0.0.0.0`으로 지정하고 실제 웹 Origin을 명시해야 합니다.

클라이언트는 Socket.IO 연결 옵션의 `auth.token`에 로그인 사용자의 Firebase ID 토큰을 넣습니다. 서버는 연결 시 서명·만료·철회·비활성 여부와 이메일 확인 상태를 검사합니다. 토큰 만료 시 연결을 종료하므로 재연결할 때 갱신된 토큰을 전달해야 합니다. 로컬의 `.env.emulator`는 `demo-taskgo`와 Auth·Firestore 에뮬레이터 주소를 지정합니다. 에뮬레이터 호스트 환경 변수는 실제 서비스 환경에 넣지 않습니다.

`GET /healthz`는 `{ "status": "ok", "protocolVersion": 1 }`을 반환합니다. 웹과 서버의 이벤트 타입은 `shared/contracts/src/socket.ts`에 정의했습니다. 연결되면 `server:ready`를 보냅니다. `room:join`은 워크스페이스 멤버십과 채널 소속 또는 DM 참여자를 확인한 후 성공 ACK를 반환합니다. 룸 참가·메시지·타이핑 요청은 현재 권한을 검사하며, 잘못된 요청은 `INVALID_REQUEST`, 권한이 없으면 `FORBIDDEN`으로 응답합니다. 현재 `message:send`와 `typing:set`은 권한 검사 후 `FEATURE_NOT_READY`로 응답하고 저장·방송하지 않습니다. 저장과 성공 ACK는 12일차에 연결합니다. 멤버십이나 DM 참여자가 변경되면 이후 요청은 거절되며, 향후 방송 구현 시 수신자 권한 재확인이 필요합니다.
