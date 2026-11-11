# 11일차 — 소켓 인증

- 예상 작업 시간: 3~4시간 (학습·디버깅에 따라 조정)
- 이전: [10일차](day-10.md) / 다음: [12일차](day-12.md)
- **현재 상태: 완료 — Firebase 토큰·채널·DM 권한 검증**

## 목표
Firebase ID 토큰·채널·DM 참여 권한.

## 작업 체크리스트
- [x] 관련 기획 정책과 이전 일차 산출물 확인
- [x] Firebase ID 토큰·채널·DM 참여 권한
- [x] 예외 상황·권한·로딩·실패 시나리오 검토
- [x] 타입/테스트/수동 검증 후 변경사항 기록
- [x] README와 관련 docs 최신화

## 완료 기준
- [x] 권한 검증 확인
- [x] 로컬 에뮬레이터 테스트 결과 기록

## 구현 메모
- 변경한 파일: `apps/socket-server/`의 인증·권한 서비스·서버·통합 테스트, `shared/contracts/src/socket.ts`, 루트 `package.json`·`package-lock.json`, `README.md`, `docs/02-architecture.md`, `docs/04-socket-events.md`, `docs/06-security-testing.md`, 이 문서.
- 의사결정 및 이유: Firebase Admin SDK로 연결 시 ID 토큰의 서명·만료·철회·비활성·이메일 확인 상태를 검증한다. 채널은 `workspaces/{workspaceId}/members/{uid}`와 `channels/{roomId}.workspaceId`, DM은 멤버십과 `dmRooms/{roomId}.participantIds`를 확인한다. 토큰 만료 시 소켓을 종료하고, 메시지·타이핑 요청은 매번 현재 권한을 다시 확인한다.
- 발견한 문제/해결: Origin 제한만으로 사용자를 인증할 수 없어 토큰을 별도로 검증했다. 권한이 없는 룸은 `FORBIDDEN`, 잘못된 ID는 `INVALID_REQUEST`로 응답하며, 저장·방송 전 단계의 요청은 `FEATURE_NOT_READY`로 거절한다. 실제 프로젝트와 에뮬레이터의 혼용을 막기 위해 Auth·Firestore 에뮬레이터 주소를 함께 설정하도록 했다.
- 다음 일차에 넘길 사항: 12일차에 권한 검사 뒤 Firestore 저장·멱등성·성공 ACK·방송을 연결한다. 방송 직전 수신자의 최신 멤버십·DM 참여 상태를 확인하고, 웹 클라이언트의 토큰 갱신·재연결을 연결해야 한다.

## 포트폴리오 기록
- 문제 정의: 연결된 사용자의 신원과 채널·DM별 접근 범위를 서버에서 확인해야 했다.
- 선택한 접근과 대안: Firebase 토큰을 연결 미들웨어에서 확인하고 Firestore 멤버십·룸 문서를 서버가 직접 조회한다. 브라우저 Origin이나 클라이언트가 제출한 사용자 ID는 권한 근거로 사용하지 않는다.
- 검증 근거(수치 임의 생성 금지): `npm run test:socket`의 Auth·Firestore 에뮬레이터 통합 테스트에서 이메일·Google 계정, 위조·미확인·비활성·철회 토큰, 채널·DM 접근, 타 워크스페이스 룸 차단, DM 참여자·멤버십 제거 후 요청 거절, 메시지 미저장을 확인했다. `npm run typecheck`도 통과했다.
