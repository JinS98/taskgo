# 아키텍처

```text
React / TypeScript / Vite / SCSS / Zustand
  | Firebase SDK              | Socket.io client
  v                           v
Firebase Auth/Firestore     Node.js Socket.io server (Cloud Run)
  ^                           | Firebase Admin SDK
  |                           v
  +------------------------ Firestore
  |
Cloud Functions + Scheduler (검수/알림/AI)
```

## 경계
- Auth: Firebase Auth의 이메일·비밀번호와 Google 로그인. 두 방식 모두 Firebase 사용자 ID로 식별하고, 로그인 방식 전환 시 계정 연결·충돌을 처리한다. 소켓 연결 시 ID 토큰 서버 검증.
- 워크스페이스 초대: 장의 요청을 서버에서 권한 확인한 뒤 Gmail 주소에 일회용 초대 링크를 메일로 전송한다. 링크 수락 시 인증된 이메일 일치·만료·철회·사용 여부를 서버에서 확인하고 멤버십을 원자적으로 생성한다. 메일 발송 서비스는 구현 시 선정한다.
- 채팅 쓰기: Socket.io 서버만 허용. 서버에서 참여 권한 검사 → Firestore 저장 → ACK → 룸 전파.
- 채팅 읽기: 권한을 확인한 Firestore 조회(과거), 새 메시지 Socket.io 이벤트.
- 업무/캘린더: Firestore 구독(`onSnapshot`) + 서버 검증이 필요한 상태 변경은 Functions.
- 연결 끊김: 소켓 자동 재연결 + 마지막 확인 메시지 이후 재조회 + 중복 제거.
- Cloud Run 단일 인스턴스는 **포트폴리오 검증용 제한**. 다중 인스턴스에서는 인스턴스 간 브로드캐스트 계층 필요.

## 배포 후보
프론트 Firebase Hosting, 소켓 Cloud Run, 백엔드 Functions. 프론트 호스팅은 최종 배포 시 선택할 수 있음.
