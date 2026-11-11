# Cloud Functions

`createWorkspace`, `inviteMember`, `listInvites`, `revokeInvite`, `acceptInvite` 호출형 함수가 워크스페이스 장과 초대 권한을 검증합니다. 함수 리전은 `asia-northeast3`입니다. 검수·알림·AI 서버 로직은 후속 일차에서 추가합니다.

로컬 에뮬레이터에서는 초대 메일 대신 링크를 Functions 로그에 출력하고 장에게 반환합니다. `npm run emulators`와 테스트 스크립트는 실제 비밀을 조회하지 않도록 무해한 `functions/.secret.local`을 처음 한 번 생성합니다. 실제 발송에는 Firebase Blaze 요금제와 SMTP 제공자가 필요합니다. 배포 전에 `.env.example`을 참고해 무시되는 `functions/.env`에 `INVITE_APP_URL`(웹 앱 HTTPS 주소)과 `INVITE_FROM`(발신자 주소)을 설정하고 `firebase functions:secrets:set INVITE_SMTP_URL`로 SMTP 연결 문자열을 비밀로 저장합니다. 설정이 없으면 실제 초대 요청이 실패하며 초대 문서는 철회됩니다. `npm run build:functions`로 컴파일한 후 배포해야 합니다. 현재 함수는 에뮬레이터에서만 검증했습니다.
