# 데이터 모델

> 8일차에 워크스페이스·초대·멤버십 경로와 읽기 권한을 구현했고, 12일차에 서버 전용 메시지 저장 필드를 구현했다. 17일차에 업무 생성 문서와 서버 검증을 구현했다. 로그인한 이메일 사용자의 최초 워크스페이스 생성 3문서 일괄 쓰기만 클라이언트에서 허용하고 나머지 쓰기는 차단한다.

- `workspaces/{workspaceId}`: name, ownerId, createdAt. 클라이언트가 생성할 때 장 멤버십과 본인 목록 미러를 같은 일괄 쓰기로 생성해야 한다.
- `users/{uid}`: displayName, setupComplete, createdAt, updatedAt. 첫 로그인 후 본인만 이름을 등록·수정한다.
- `workspaces/{workspaceId}/members/{uid}`: uid, email, displayName, role(owner/member), joinedAt. 문서 ID를 Firebase UID로 고정하고 이름 변경 시 본인 멤버십에 반영한다. 기존 문서에 이름이 없으면 화면에는 UID 기반 임시 이름을 보여준다.
- `users/{uid}/workspaces/{workspaceId}`: workspaceId, name, role, joinedAt. 본인의 워크스페이스 목록용 미러로 생성자 일괄 쓰기 또는 초대 수락 서버 트랜잭션에서 기록한다.
- `workspaceInvites/{inviteId}`: workspaceId, invitedEmail, invitedBy, tokenHash, status(pending/accepted/revoked), createdAt, emailSentAt, expiresAt, acceptedBy, acceptedAt, revokedAt. 원본 토큰은 저장하지 않고 초대 문서는 클라이언트가 직접 읽지 못한다.
- `channels/{channelId}`: workspaceId, name. 8일차 규칙은 워크스페이스 전체 공개 채널만 지원한다.
- `dmRooms/{roomId}`: workspaceId, participantIds
- `messages/{messageId}`: workspaceId, sourceType(channel/dm), channelId 또는 dmRoomId, senderId, clientMessageId, content, createdAt. 서버가 사용자 UID와 `clientMessageId`로 결정한 ID에 트랜잭션으로 한 번만 생성한다. `createdAt`은 소켓 서버가 생성한 Firestore Timestamp다. 같은 사용자의 클라이언트 ID는 룸과 워크스페이스를 통틀어 고유해야 한다.
- `tasks/{taskId}`: workspaceId, sourceMessageId, sourceType(channel/dm), title, description, requesterId, createdById, assigneeId, dueDate, proposedDueDate, estimatedMinutes, status, reviewRequired, reviewWorkingDays, reviewCycle, reviewSubmittedAt, reviewRejectionReason, reviewDeadlineAt, completionReason, createdAt, updatedAt. 날짜 필드는 Firestore Timestamp이며, 미확정 값은 null이다. 기존 업무에는 `createdById`가 없을 수 있다. 타입 계약은 `shared/contracts/src/task.ts`에 둔다.
- `taskEvents/{eventId}`: taskId, actorId, action, createdAt, metadata
- `notifications/{id}`: recipientId, taskId, reviewCycle, type, scheduledAt, sentAt
- `meetings/{id}`: workspaceId, title, startsAt, endsAt

메시지 내역은 `workspaceId`·`sourceType`·`channelId` 또는 `dmRoomId`로 룸을 제한하고, `createdAt`과 문서 ID의 내림차순으로 30개씩 조회한다. 동시각 메시지도 문서 ID로 정렬이 고정된다. 필요한 채널·DM 복합 인덱스는 `firestore.indexes.json`에 정의한다. 클라이언트의 직접 쓰기 금지와 룸별 읽기 권한은 Firestore 규칙에서 유지한다.

## 업무 생성 스키마 (17일차)

- `createTask` 호출은 `workspaceId`, `sourceMessageId`, `title`, `assigneeId`, 미래의 UTC ISO `dueDate`, `reviewRequired`를 받는다. `requesterId`는 선택값이며 생략하면 생성자가 요청자가 된다. `description`(선택, 최대 2,000자), `reviewWorkingDays`(검수 선택 시 1~10)와 `estimatedMinutes`(선택 시 15분 단위 15~480분)도 선택값이다.
- 서버는 로그인 사용자·선택한 요청자·담당자가 모두 워크스페이스 멤버인지 확인한다. 원본 메시지의 워크스페이스와 채널·DM 소속을 다시 읽고, DM이면 생성자가 참여자인지 확인한다. 클라이언트가 보낸 생성자·상태 등 정의되지 않은 필드는 거부한다.
- 서버가 `createdById`를 로그인 UID로, `sourceType`을 원본 메시지로부터 정한다. 생성자가 다른 멤버를 담당자로 지정하면 `REQUESTED`, 본인을 지정하면 `ACCEPTED`로 생성하고 같은 트랜잭션에 자동 수락 이력을 기록한다. 요청자를 다른 멤버로 선택해도 실제 생성자는 이력에 남는다. 검수 회차는 `0`이며 제안 마감·검수 기한·완료 사유는 null이다. 업무 문서에는 DM 본문이나 DM 룸 ID를 복사하지 않는다.
- 팀 멤버는 업무 제목·설명·담당·마감·상태 등 공개 메타데이터를 읽는다. `sourceMessageId`만으로 원본 DM의 읽기 권한이 생기지 않는다. 18일차에 저장된 채팅 메시지에서 수동 업무 요청 UI를 연결했고, 20일차에 요청 수락·거절·마감 변경 제안을 연결했다.

## 업무 요청 응답 (20일차)

- `respondTask` 호출은 `taskId`, `action`을 받고 마감 변경 제안 시에만 미래 UTC ISO `proposedDueDate`를 추가한다. 액션은 `accept`, `decline`, `startProgress`, `proposeDueDate`, `approveDueDate`, `rejectDueDate`다.
- 담당자만 수락·거절·진행 시작·마감 변경을 제안한다. 요청자만 제안을 승인·거절한다. 수락·거절은 `REQUESTED`에서만 가능하며 모든 액션의 상태와 권한을 트랜잭션으로 검증한다.
- 마감 변경 제안은 `proposedDueDate`만 기록한다. 요청자 승인 시 `dueDate`로 옮기고 제안을 지운다. 거절 시 제안만 지운다. 제안이 대기 중이면 담당자 수락은 막는다. 거절은 `DECLINED`, 수락은 `ACCEPTED`로 전이한다.
- 각 응답은 `taskEvents/{eventId}`에 `taskId`, `actorId`, `action`, `createdAt`, `metadata`를 남긴다. 클라이언트 쓰기는 계속 금지한다.

## 진행·마감 협의 (21일차)

- 담당자만 `ACCEPTED` 업무에 `startProgress`를 호출해 `IN_PROGRESS`로 전이한다. 중복 호출이나 다른 상태에서의 호출은 거부한다.
- 담당자는 `REQUESTED`·`ACCEPTED`·`IN_PROGRESS` 상태에서 새 마감을 제안할 수 있다. 요청자만 승인·거절한다. 승인 전에는 `dueDate`와 상태를 보존하고 제안일을 `proposedDueDate`에 둔다. 승인 후에도 상태는 그대로 유지한다.
- 제안·승인·거절과 진행 시작은 서버 트랜잭션으로 기록한다. 제안 이력에는 기존·제안 마감, 승인 이력에는 기존·확정 마감을 남긴다. 업무별 이력 조회는 워크스페이스 멤버에게만 허용하고, UI는 기존 업무를 위해 `createdAt`을 요청 생성 이력으로 함께 표시한다.

## 검수 제출 (22일차)

- 검수 대상 업무의 담당자만 `IN_PROGRESS`에서 `submitForReview`를 호출할 수 있다. 대기 중인 마감 제안이 있거나 검수 기간 설정이 유효하지 않으면 거부한다.
- 서버는 업무 상태를 `REVIEW_PENDING`으로, 검수 회차를 `1`로 바꾸고 `reviewSubmittedAt`에 제출 시각을 기록한다. 같은 트랜잭션에서 `taskEvents`에 제출 이벤트와 선택된 검수 기간을 남긴다. 중복 제출은 상태 검사로 거부한다.
- `reviewDeadlineAt`은 24일차 근무시간·공휴일 계산에서 설정한다. 현재 보드에는 제출 시각과 선택한 기간을 표시한다.

## 검수 승인·재작업 (23일차)

- 검수 미선택 업무는 담당자가 `IN_PROGRESS`에서 `complete`를 호출해 `DONE`으로 완료한다. `completionReason`은 `NO_REVIEW`다. 마감 변경 제안이 남아 있으면 완료할 수 없다.
- 검수 대기(`REVIEW_PENDING`) 업무는 요청자만 승인 또는 사유를 포함해 반려한다. `approveReview`는 `DONE`과 `completionReason=APPROVED`로, `rejectReview`는 `REWORK`와 `reviewRejectionReason`으로 기록한다. 반려 사유는 공백을 제외해 2~1000자로 검증한다.
- 담당자만 `REWORK`에서 `resubmitForReview`를 호출할 수 있다. 재제출 시 `REVIEW_PENDING`으로 돌아가 검수 회차를 올리고 제출 시각을 갱신하며 반려 사유를 지운다. 이후 요청자는 다시 승인·반려할 수 있다. 모든 전이와 이력 이벤트는 같은 트랜잭션으로 저장한다.
- 검수 회차는 향후 예약 알림 구분에 사용한다. 검수 기한의 근무시간·공휴일 계산과 예약 알림은 아직 연결되지 않았으며 24일차 이후 범위다.

## 권한
- 워크스페이스 장만 초대를 발송·철회·조회한다. 초대 수락은 서버 트랜잭션에서 로그인 이메일과 초대 이메일의 일치·토큰 해시·만료·사용 여부·멤버십 중복을 검증하고 멤버십·목록 미러·초대 상태를 한 번에 기록한다. 초대 기한은 7일이다.
- 워크스페이스 생성은 초대 메일과 독립적이다. Firestore 규칙은 인증된 이메일·생성자 UID·장 역할·필드 구성·서버 타임스탬프를 검증하고 3문서 일괄 쓰기가 누락되면 거부한다.
- 워크스페이스·채널·업무 접근은 인증만으로 허용하지 않고 해당 워크스페이스 멤버십을 확인한다.
- 채널·DM·메시지·업무·일정·알림의 클라이언트 직접 생성/수정/삭제는 금지한다. 메시지는 소켓 서버가, 업무 생성은 `createTask` 함수가 검증해 기록한다. Firestore 규칙은 Admin SDK 쓰기에 적용되지 않으므로 서버가 역할과 필드를 검증한다.
- 팀 전체: 업무 공개 메타데이터만 읽기.
- DM 메시지: 참여자만 읽기.
- 메시지 쓰기: 인증된 서버 전용.
- 업무 상태 변경: 서버에서 요청자/담당자 역할·상태 전이 검증.
- AI 입력: 접근 가능한 대화만 전달.

주의: 업무의 원본 메시지 ID가 공개되더라도 DM 원문 조회 권한은 부여되지 않음.
