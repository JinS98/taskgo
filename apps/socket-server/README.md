# Socket.io 서버 — 구현 예정

10일차부터 Node.js + Socket.io 서버를 구현합니다. Cloud Run 배포 전에는 로컬 실행을 우선합니다.

- Firebase ID 토큰 검증 및 채널/DM 접근 제어
- 메시지 저장 성공 후 ACK 및 브로드캐스트
- `clientMessageId`로 중복 전송 방지
- 재연결 후 누락 메시지 복구
- Cloud Run 최소 인스턴스 0, 최대 1 (초기 검증용)

**현재 실행 가능한 서버 코드는 없습니다.**
