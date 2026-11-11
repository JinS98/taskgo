# Socket.io 이벤트 계약 초안

10일차에 `shared/contracts/src/socket.ts`에 타입 계약을 추가했다. 소켓 연결 시 서버가 `server:ready`와 `protocolVersion: 1`을 보낸다. 룸 입장·퇴장, 메시지 전송, 타이핑 요청은 모두 ACK를 사용한다. ACK는 `{ ok: true, data }` 또는 `{ ok: false, error: { code, message } }` 형태다.

11일차부터 연결 옵션의 `auth.token`으로 Firebase ID 토큰을 전달한다. 서버는 연결 시 토큰과 이메일 확인 상태를 검증하며, 유효하지 않으면 `connect_error`의 `data.code`를 `UNAUTHENTICATED`로 돌려준다. 인증 서비스 오류는 `AUTH_UNAVAILABLE`이다. 토큰 만료 시 연결을 종료하므로 클라이언트는 갱신된 토큰으로 재연결해야 한다. `room:join`은 워크스페이스 멤버십과 채널 소속 또는 DM 참여를 확인한 뒤 성공 ACK를 보낸다. 메시지·타이핑 요청도 룸 참가와 현재 권한을 다시 확인하지만, 저장·방송 전까지는 `FEATURE_NOT_READY`로 거절한다.

| 방향 | 이벤트 | 설명 |
|---|---|---|
| client → server | `room:join` | 권한 검증 후 채널/DM 룸 참가 |
| client → server | `room:leave` | 룸 나가기 |
| client → server | `message:send` | `clientMessageId`, roomId, content 전송 |
| server → client | `message:created` | Firestore 저장 완료 메시지 수신 |
| server → client | `typing:changed` | 타이핑 시작/종료 |
| server → client | `server:ready` | 연결 후 이벤트 계약 버전 알림 |
| client → server | `typing:set` | 일시적 타이핑 이벤트 |

## 전송 순서
1. Firebase Auth ID 토큰을 연결 옵션에 전달하고 서버에서 검증.
2. 서버에서 워크스페이스 멤버십과 채널·DM 룸 접근 권한 확인.
3. `message:send` 수신 시 `clientMessageId` 기준 멱등성 확인.
4. Firestore 저장 성공 후 ACK와 `message:created` 발송.
5. 재연결 시 마지막 확인 메시지 이후 조회, messageId로 중복 제거.

## 테스트
- 10일차: 로컬 연결·헬스체크·허용 Origin·거절 ACK·메시지 미전파.
- 11일차: 유효·위조·미확인·비활성·철회 토큰, Google 로그인, 채널·DM 멤버십, 타 워크스페이스 룸, DM 참여자·멤버십 제거 후 요청 차단.
- ACK 타임아웃/재시도 시 중복 저장 방지.
- 룸 권한 없는 사용자의 join/send 거절.
- 연결 해제/재연결 중 메시지 누락 방지.
- 동일 계정 다중 탭/서로 다른 계정 동시 수신.
