# 10일차 — Socket.io 서버

- 예상 작업 시간: 3~4시간 (학습·디버깅에 따라 조정)
- 이전: [09일차](day-09.md) / 다음: [11일차](day-11.md)
- **현재 상태: 완료 — 로컬 소켓 연결과 이벤트 계약 검증**

## 목표

Node.js 서버·헬스체크·이벤트 계약.

## 작업 체크리스트

- [x] 관련 기획 원본과 이전 일차 산출물 확인
- [x] Node.js 서버·헬스체크·이벤트 계약
- [x] 예외 상황·권한·로딩·실패 시나리오 검토
- [x] 타입·로컬 테스트·변경사항 기록
- [x] README와 관련 docs 최신화

## 완료 기준

- [x] 로컬 소켓 연결 확인
- [x] 로컬 테스트 결과 기록

## 구현 메모

- 변경한 파일: `apps/socket-server/`, `shared/contracts/`, 루트 `package.json`·`package-lock.json`, `README.md`, `docs/02-architecture.md`, `docs/04-socket-events.md`, 이 문서.
- 의사결정 및 이유: 단일 Node.js HTTP 서버에서 `/healthz`와 Socket.io를 제공한다. 웹과 서버가 `@taskgo/contracts`의 이벤트 타입을 공유하며 연결 직후 `server:ready`로 계약 버전을 알린다. 브라우저 Origin을 명시적으로 제한한다.
- 발견한 문제/해결: 인증과 룸 권한 검사가 없는 단계에서 소켓 연결만 허용하고 `room:join`, `room:leave`, `message:send`, `typing:set`은 모두 `AUTH_NOT_READY` ACK로 거절한다. 메시지를 저장하거나 방송하지 않는다. Origin 제한은 인증을 대신하지 않는다.
- 다음 일차로 넘길 사항: 11일차에 Firebase ID 토큰 검증과 워크스페이스·채널·DM 접근 권한을 연결한다. 12일차에 메시지 저장·중복 방지·성공 ACK·방송을 연결한다. 웹 채팅 UI의 실제 소켓 연동은 후속 작업이다.

## 포트폴리오 기록

- 문제 정의: 서버의 로컬 연결과 이벤트 형태를 확인하면서 미인증 사용자의 룸 참가·메시지 전송을 차단해야 했다.
- 선택한 접근과 대안: 인증 구현 전에는 요청을 명시적으로 거절해 데이터 흐름이 생기지 않도록 했다.
- 검증 근거(수치 임의 생성 금지): `npm run test:socket`에서 `/healthz`, 허용된 Origin의 소켓 연결, `server:ready`, 네 가지 거절 ACK, 메시지 미방송, WebSocket·polling의 허용되지 않은 Origin 차단을 확인했다. `npm run typecheck`와 `npm run build:socket`도 통과했다. `npm run dev:socket`을 실행하고 `/healthz` 응답을 직접 확인했다.
