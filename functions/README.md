# Cloud Functions

`inviteMember`, `listInvites`, `revokeInvite`, `acceptInvite` 호출형 함수가 초대 권한을 검증합니다. `createTask`는 확인된 로그인 사용자·워크스페이스 멤버십·담당자·원본 메시지 접근 권한을 검증한 뒤 공개 업무 메타데이터를 기록합니다. `suggestTask`는 사용자가 버튼을 눌렀을 때 같은 대화방의 선택 메시지까지 최대 8개를 읽어 업무 제목 후보를 제안합니다. DM은 참여자만 호출할 수 있으며 일일 10회로 제한합니다. 초대 주소는 Gmail에 제한되지 않으며 수락하는 사용자의 확인된 로그인 이메일과 일치해야 합니다. 워크스페이스 생성은 Firestore 규칙으로 검증한 클라이언트 일괄 쓰기이며 초대 함수를 호출하지 않습니다. 함수 리전은 `asia-northeast3`입니다. 업무 상태 전이·검수·알림은 후속 일차에서 추가합니다.

업무 생성 스키마와 권한은 `npm run test:task-model`로 검증합니다. 호출 요청의 날짜는 UTC ISO 문자열이며, 저장 문서는 Firestore Timestamp를 사용합니다.

로컬 에뮬레이터에서는 초대 메일 대신 링크를 Functions 로그에 출력하고 장에게 반환합니다. `npm run emulators`와 테스트 스크립트는 실제 비밀을 조회하지 않도록 무해한 `functions/.secret.local`을 생성하거나 필요한 키를 보충합니다. 실제 발송에는 Firebase Blaze 요금제와 SMTP 제공자가 필요합니다. 배포 전에 `.env.example`을 참고해 무시되는 `functions/.env`에 `INVITE_APP_URL`(웹 앱 HTTPS 주소)과 `INVITE_FROM`(발신자 주소)을 설정하고 `firebase functions:secrets:set INVITE_SMTP_URL`로 SMTP 연결 문자열을 비밀로 저장합니다. 설정이 없으면 실제 초대 요청이 실패하며 초대 문서는 철회됩니다.

AI 제안을 사용하려면 `firebase functions:secrets:set OPENAI_API_KEY`로 OpenAI API 키를 비밀로 저장하세요. 모델은 `functions/.env`의 `OPENAI_TASK_MODEL`로 지정하며 미설정 시 `gpt-4.1-mini`를 사용합니다. 사용자가 제안 버튼을 누르면 권한을 확인한 채널·DM 메시지가 OpenAI Responses API로 전송됩니다. 요청에는 `store: false`를 지정하고 후보는 구조화된 응답으로 받습니다. 키가 없는 배포 환경에서는 제안 요청이 실패해 수동 업무 입력을 계속 사용할 수 있습니다. 로컬 에뮬레이터의 기본 키 `local-disabled`에서는 외부 전송 없이 문장 기반 초안을 보여주며 AI 결과가 아님을 표시합니다. 로컬에서 실제 AI 호출을 검증할 때만 Git에서 제외된 `functions/.secret.local`의 `OPENAI_API_KEY`에 실제 키를 설정하세요. `npm run build:functions`로 컴파일한 후 배포해야 합니다. 현재 실제 OpenAI API 호출과 실서비스 배포는 검증하지 않았습니다.
