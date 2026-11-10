# 06일차 — Firebase 준비

- 예상 작업 시간: 3~4시간 (학습·디버깅에 따라 조정)
- 이전: [05일차](day-05.md) / 다음: [07일차](day-07.md)
- **현재 상태: 완료 (7일차 로그인 UI 대기)**

## 목표
Firebase Auth·Firestore·에뮬레이터와 이메일·비밀번호/Google 로그인 방식 설정.

## 작업 체크리스트
- [x] 관련 기획 정책과 이전 일차 산출물 확인
- [x] Firebase Auth·Firestore·에뮬레이터
- [x] 이메일·비밀번호와 Google 로그인 공급자 활성화 및 개발 환경 확인
- [x] 예외 상황·권한·로딩·실패 시나리오 검토
- [x] 타입/테스트/수동 검증 후 변경사항 기록
- [x] README 또는 해당 docs 최신화

## 완료 기준
- [x] 개발 환경 확인
- [x] 브라우저 또는 로컬 테스트 결과 기록

## 구현 메모
- 변경한 파일: `firebase.json`, `firebase.auth.example.json`, `firestore.rules`, `firestore.indexes.json`, `apps/web/.env.emulator`, `.env.example`, `src/config/env.ts`, `src/services/firebase.ts`, `src/vite-env.d.ts`, `scripts/verify-firebase.mjs`, 두 `package.json`, `package-lock.json`, `.gitignore`, `README.md`, `docs/02-architecture.md`, 이 문서. 빈 `services/.gitkeep` 제거. 실제 웹 설정과 OAuth 지원 이메일은 Git에서 제외한 `.env.local`, `firebase.auth.local.json`에 저장했다.
- 의사결정 및 이유: 로그인된 Firebase 계정에 `taskgo-jins98` 프로젝트와 `taskgo-web` 앱을 만들고 이메일·비밀번호/Google 공급자를 활성화했다. Firestore 기본 데이터베이스는 서울 리전에 만들었다. 개발 에뮬레이터는 `demo-taskgo` 가상 프로젝트를 사용해 실제 데이터와 분리했다. 웹 SDK는 기능 사용 시 초기화되며, 명시된 에뮬레이터 모드에서만 로컬 서비스에 연결된다.
- 예외 상황·권한·로딩 검토: Firebase 웹 설정이 누락되면 기존 설정 함수가 필수 변수 이름을 알린다. 에뮬레이터 설정을 프로덕션 빌드에서 사용하려고 하면 오류를 낸다. 실제 Firestore는 초기 차단 규칙을 배포했으며, 인증 상태별 권한과 로딩·실패 UI는 7~8일차에 구현한다. 현재 샘플 화면은 Firebase 호출을 하지 않는다.
- 발견한 문제/해결: 새 프로젝트에서 Firestore API가 꺼져 있어 데이터베이스 생성이 처음 실패했다. API 활성화 후 다시 생성했고 차단 규칙을 배포했다. 설치된 Node 22에서 최신 Firebase SDK의 엔진 경고가 나와 호환되는 11.10.0을 사용했다.
- 다음 일차에 넘길 사항: 7일차에는 로그인·가입·Google 팝업, 로그아웃, 동일 이메일 계정 연결·충돌과 인증 로딩 상태를 구현한다. 8일차에는 멤버십별 Firestore 규칙으로 초기 차단 규칙을 교체한다.

## 포트폴리오 기록
- 문제 정의: 실제 프로젝트와 Auth·Firestore 개발 환경이 없어 이후 로그인과 데이터 권한 작업을 시작할 수 없었다.
- 선택한 접근과 대안: 실제 프로젝트에는 로그인 공급자와 차단 규칙만 배포하고, 기능 개발·검증에는 별도 가상 프로젝트의 Auth·Firestore 에뮬레이터를 사용했다. OAuth 지원 이메일은 공개 저장소에 기록하지 않았다.
- 검증 근거(수치 임의 생성 금지): CLI에서 실제 프로젝트의 이메일·비밀번호/Google 공급자 활성화와 서울 리전의 기본 Firestore 데이터베이스를 확인했다. 실제 Firestore 비인증 읽기는 `permission-denied`였다. `npm run test:firebase`에서 로컬 이메일 사용자 생성과 Firestore 차단 규칙을 확인했다. `npm run typecheck`, `npm run lint`, `npm run build:web`, `npm run test:ui`도 통과했다. 로그인 UI는 아직 없으므로 두 방식의 브라우저 로그인 플로우 검증은 7일차에 진행한다.
