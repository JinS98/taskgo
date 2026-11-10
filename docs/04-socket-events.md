# Socket.io 이벤트 계약 초안

| 방향 | 이벤트 | 설명 |
|---|---|---|
| client → server | `room:join` | 권한 검증 후 채널/DM 룸 참가 |
| client → server | `room:leave` | 룸 나가기 |
| client → server | `message:send` | `clientMessageId`, roomId, content 전송 |
| server → client | `message:created` | Firestore 저장 완료 메시지 수신 |
| server → client | `typing:changed` | 타이핑 시작/종료 |
| client → server | `typing:set` | 일시적 타이핑 이벤트 |

## 전송 순서
1. Firebase Auth ID 토큰으로 소켓 인증.
2. 서버에서 룸 접근 권한 확인.
3. `message:send` 수신 시 `clientMessageId` 기준 멱등성 확인.
4. Firestore 저장 성공 후 ACK와 `message:created` 발송.
5. 재연결 시 마지막 확인 메시지 이후 조회, messageId로 중복 제거.

## 테스트
- ACK 타임아웃/재시도 시 중복 저장 방지.
- 룸 권한 없는 사용자의 join/send 거절.
- 연결 해제/재연결 중 메시지 누락 방지.
- 동일 계정 다중 탭/서로 다른 계정 동시 수신.
