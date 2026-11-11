# 데이터 모델 초안

> 8일차에 워크스페이스·초대·멤버십 경로와 읽기 권한을 구현했고, 12일차에 서버 전용 메시지 저장 필드를 구현했다. 업무 필드는 후속 일차에서 확정한다. 확인된 사용자의 최초 워크스페이스 생성 3문서 일괄 쓰기만 클라이언트에서 허용하고 나머지 쓰기는 차단한다.

- `workspaces/{workspaceId}`: name, ownerId, createdAt. 클라이언트가 생성할 때 장 멤버십과 본인 목록 미러를 같은 일괄 쓰기로 생성해야 한다.
- `workspaces/{workspaceId}/members/{uid}`: uid, email, role(owner/member), joinedAt. 문서 ID를 Firebase UID로 고정한다.
- `users/{uid}/workspaces/{workspaceId}`: workspaceId, name, role, joinedAt. 본인의 워크스페이스 목록용 미러로 생성자 일괄 쓰기 또는 초대 수락 서버 트랜잭션에서 기록한다.
- `workspaceInvites/{inviteId}`: workspaceId, invitedEmail, invitedBy, tokenHash, status(pending/accepted/revoked), createdAt, emailSentAt, expiresAt, acceptedBy, acceptedAt, revokedAt. 원본 토큰은 저장하지 않고 초대 문서는 클라이언트가 직접 읽지 못한다.
- `channels/{channelId}`: workspaceId, name. 8일차 규칙은 워크스페이스 전체 공개 채널만 지원한다.
- `dmRooms/{roomId}`: workspaceId, participantIds
- `messages/{messageId}`: workspaceId, sourceType(channel/dm), channelId 또는 dmRoomId, senderId, clientMessageId, content, createdAt. 서버가 사용자 UID와 `clientMessageId`로 결정한 ID에 트랜잭션으로 한 번만 생성한다. `createdAt`은 소켓 서버가 생성한 Firestore Timestamp다. 같은 사용자의 클라이언트 ID는 룸과 워크스페이스를 통틀어 고유해야 한다.
- `tasks/{taskId}`: workspaceId, sourceMessageId, sourceType, title, requesterId, assigneeId, dueDate, proposedDueDate, status, reviewRequired, reviewWorkingDays, reviewCycle, reviewDeadlineAt, completionReason
- `taskEvents/{eventId}`: taskId, actorId, action, createdAt, metadata
- `notifications/{id}`: recipientId, taskId, reviewCycle, type, scheduledAt, sentAt
- `meetings/{id}`: workspaceId, title, startsAt, endsAt

## 권한
- 워크스페이스 장만 초대를 발송·철회·조회한다. 초대 수락은 서버 트랜잭션에서 로그인 이메일 확인 여부·초대 이메일 일치·토큰 해시·만료·사용 여부·멤버십 중복을 검증하고 멤버십·목록 미러·초대 상태를 한 번에 기록한다. 초대 기한은 7일이다.
- 워크스페이스 생성은 초대 메일과 독립적이다. Firestore 규칙은 인증된 이메일·생성자 UID·장 역할·필드 구성·서버 타임스탬프를 검증하고 3문서 일괄 쓰기가 누락되면 거부한다.
- 워크스페이스·채널·업무 접근은 인증만으로 허용하지 않고 해당 워크스페이스 멤버십을 확인한다.
- 채널·DM·메시지·업무·일정·알림의 클라이언트 생성/수정/삭제는 후속 서버 로직이 생길 때까지 금지한다. Firestore 규칙은 Admin SDK 쓰기에 적용되지 않으므로 서버 함수가 역할과 필드를 검증한다.
- 팀 전체: 업무 공개 메타데이터만 읽기.
- DM 메시지: 참여자만 읽기.
- 메시지 쓰기: 인증된 서버 전용.
- 업무 상태 변경: 서버에서 요청자/담당자 역할·상태 전이 검증.
- AI 입력: 접근 가능한 대화만 전달.

주의: 업무의 원본 메시지 ID가 공개되더라도 DM 원문 조회 권한은 부여되지 않음.
