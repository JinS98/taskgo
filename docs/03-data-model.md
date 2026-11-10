# 데이터 모델 초안

> 실제 컬렉션·인덱스·보안 규칙은 8일차/17일차에 확정. 아래는 설계용 필드 예시.

- `workspaces/{workspaceId}`: name, memberIds
- `channels/{channelId}`: workspaceId, name, memberIds
- `dmRooms/{roomId}`: workspaceId, participantIds
- `messages/{messageId}`: workspaceId, channelId 또는 dmRoomId, senderId, clientMessageId, content, createdAt
- `tasks/{taskId}`: workspaceId, sourceMessageId, sourceType, title, requesterId, assigneeId, dueDate, proposedDueDate, status, reviewRequired, reviewWorkingDays, reviewCycle, reviewDeadlineAt, completionReason
- `taskEvents/{eventId}`: taskId, actorId, action, createdAt, metadata
- `notifications/{id}`: recipientId, taskId, reviewCycle, type, scheduledAt, sentAt
- `meetings/{id}`: workspaceId, title, startsAt, endsAt

## 권한
- 팀 전체: 업무 공개 메타데이터만 읽기.
- DM 메시지: 참여자만 읽기.
- 메시지 쓰기: 인증된 서버 전용.
- 업무 상태 변경: 서버에서 요청자/담당자 역할·상태 전이 검증.
- AI 입력: 접근 가능한 대화만 전달.

주의: 업무의 원본 메시지 ID가 공개되더라도 DM 원문 조회 권한은 부여되지 않음.
