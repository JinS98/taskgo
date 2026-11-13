# Socket.io 이벤트 계약 초안

10일차에 `shared/contracts/src/socket.ts`에 타입 계약을 추가했다. 소켓 연결 시 서버가 `server:ready`와 `protocolVersion: 1`을 보낸다. 룸 입장·퇴장, 메시지 전송, 타이핑 요청은 모두 ACK를 사용한다. ACK는 `{ ok: true, data }` 또는 `{ ok: false, error: { code, message } }` 형태다.

11일차부터 연결 옵션의 `auth.token`으로 Firebase ID 토큰을 전달한다. 서버는 연결 시 토큰과 이메일 확인 상태를 검증하며, 유효하지 않으면 `connect_error`의 `data.code`를 `UNAUTHENTICATED`로 돌려준다. 인증 서비스 오류는 `AUTH_UNAVAILABLE`이다. 토큰 만료 시 연결을 종료하므로 클라이언트는 갱신된 토큰으로 재연결해야 한다. `room:join`은 워크스페이스 멤버십과 채널 소속 또는 DM 참여를 확인한 뒤 성공 ACK를 보낸다.

12일차부터 `message:send`는 룸 참가와 현재 권한을 확인하고 Firestore 트랜잭션에서 멤버십·룸·중복 ID를 다시 확인한다. 한 사용자에게 `clientMessageId`는 모든 룸에서 고유해야 한다. 저장 성공 후 `{ ok: true, data: { messageId } }` ACK를 보내고, 현재 권한이 있는 룸 소켓에만 `message:created`를 전파한다. 동일 요청의 재전송은 같은 `messageId`를 반환하되 재전파하지 않는다. 동일 ID에 다른 내용이나 룸을 제출하면 `CONFLICT`다. 저장 실패는 `INTERNAL_ERROR`이며 저장 전에는 성공 ACK를 보내지 않는다. 성공 ACK는 저장 완료를 뜻하며 모든 수신자에게 전달됐다는 보장은 아니다.

13일차 웹 클라이언트는 연결·재연결마다 현재 Firebase ID 토큰을 전달하고 `room:join` ACK를 받은 뒤 전송을 허용한다. 대화 전환 시 기존 룸을 떠나고 새 룸에 참가한다. `message:created`와 전송 ACK가 어느 순서로 와도 `clientMessageId`·`messageId`로 같은 메시지를 합친다. 기본 `general_{workspaceId}` 채널은 멤버가 처음 참가할 때 서버가 생성한다. 14일차에는 룸 입장·재입장 시 Firestore의 최근 메시지부터 저장된 최신 메시지까지 재조회하고 `messageId`로 중복 제거한다. 15일차에는 브라우저 오프라인에서 소켓 연결을 정리하고 전송을 막는다. 온라인 복귀 후 재인증·룸 재참가를 거쳐 Firestore 서버에서 저장 내역을 재조회하며, 중첩된 재조회 요청은 첫 조회가 끝난 뒤 한 번 더 실행한다. 일시적인 룸 참가 오류는 재시도하고, 확인된 메시지는 늦은 전송 ACK 타임아웃으로 실패 상태가 되지 않는다.

16일차부터 `typing:set`은 참가한 룸과 현재 권한을 확인한 뒤 `{ accepted: true }` ACK를 반환한다. 서버는 발신자를 제외하고 현재 접근 권한이 있는 룸 소켓에만 `typing:changed`를 전달한다. 이 상태는 Firestore에 저장하지 않는다. 입력을 멈추거나 룸을 떠나거나 소켓 연결이 끊기면 종료 이벤트를 보낸다. 웹은 작성 중일 때 상태를 주기적으로 갱신하고 이벤트가 끊겨도 5초 후 표시를 지운다. 연결 오류와 메시지 전송 오류는 따로 안내하며, 실패한 메시지는 같은 `clientMessageId`로 재시도한다.

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
3. `message:send` 수신 시 트랜잭션에서 권한과 `clientMessageId` 기준 멱등성 확인.
4. Firestore 저장 성공 후 ACK와 권한 있는 룸 수신자에게만 `message:created` 발송.
5. 재연결 시 Firestore 서버의 최신 페이지부터 마지막 확인 메시지까지 조회하고 `messageId`로 중복 제거.

## 테스트
- 10일차: 로컬 연결·헬스체크·허용 Origin·거절 ACK·메시지 미전파.
- 11일차: 유효·위조·미확인·비활성·철회 토큰, Google 로그인, 채널·DM 멤버십, 타 워크스페이스 룸, DM 참여자·멤버십 제거 후 요청 차단.
- 12일차: 채널·DM 문서 저장, 허용/금지 읽기, 클라이언트 직접 쓰기 거절, 순차·동시 중복 재시도와 ACK 미수신 후 재전송, ID 충돌, 저장 실패 ACK, 수신자별 최신 권한 확인.
- 13일차: 두 Chrome 세션의 기본 채널 생성·채널/DM 송수신·룸 전환·화면 간 메시지 분리.
- 14일차: Firestore 문서 커서 페이지네이션, 채널·DM 과거 메시지 조회, 이전 페이지 로딩 시 스크롤 위치 유지, 재입장 후 누락 메시지 복원.
- 15일차: 두 Chrome 세션 중 한쪽을 오프라인으로 전환하고 다른 쪽에서 35개 메시지를 전송. 복귀 후 첫 30개 페이지를 넘는 누락 메시지 35개를 각각 한 번씩 표시하고 초안을 유지하는지 확인.
- 16일차: 타이핑 요청 형식·룸 권한 검사, 채널·DM 수신 범위와 룸 퇴장 후 종료 전파. 두 Chrome 세션에서 채널·DM 입력 표시와 종료, 오프라인 상태 표시를 확인.
- 룸 권한 없는 사용자의 join/send 거절.
- 동일 계정 다중 탭/서로 다른 계정 동시 수신.
