# Socket.io 서버

10일차에는 Node.js HTTP 서버와 Socket.io 연결을 준비했습니다. 로컬에서는 다음 명령으로 실행합니다.

```bash
npm install
npm run dev:socket
# 다른 터미널에서
curl.exe http://127.0.0.1:3001/healthz
npm run test:socket
```

기본 주소는 `127.0.0.1:3001`이고, 허용하는 브라우저 Origin은 `http://localhost:5173`과 `http://127.0.0.1:5173`입니다. `PORT`, `SOCKET_HOST`, `SOCKET_ALLOWED_ORIGINS` 환경 변수로 변경할 수 있습니다. 여러 Origin은 쉼표로 구분합니다. 배포 시 호스트를 `0.0.0.0`으로 지정하고 실제 웹 Origin을 명시해야 합니다. Origin 제한은 인증이나 권한 검증을 대신하지 않습니다.

`GET /healthz`는 `{ "status": "ok", "protocolVersion": 1 }`을 반환합니다. 웹과 서버의 이벤트 타입은 `shared/contracts/src/socket.ts`에 정의했습니다. 연결되면 `server:ready`를 보내고, `room:join`, `room:leave`, `message:send`, `typing:set`은 현재 `AUTH_NOT_READY` ACK로 거절합니다. 메시지는 아직 저장·전파하지 않습니다. Firebase 토큰 검증과 룸 권한은 11일차, 저장과 ACK 성공 처리는 12일차에 연결합니다.
