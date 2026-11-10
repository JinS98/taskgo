# 02일차 — 설계·폴더 구조

- 예상 작업 시간: 3~4시간 (학습·디버깅에 따라 조정)
- 이전: [01일차](day-01.md) / 다음: [03일차](day-03.md)
- **현재 상태: 완료**

## 목표
도메인별 폴더·공통 타입·환경변수·README.

## 작업 체크리스트
- [x] 관련 기획 정책과 이전 일차 산출물 확인
- [x] 도메인별 폴더·공통 타입·환경변수·README
- [x] 예외 상황·권한·로딩·실패 시나리오 검토
- [x] 타입/테스트/수동 검증 후 변경사항 기록
- [x] README 또는 해당 docs 최신화

## 완료 기준
- [x] 설계 문서 확인
- [x] 브라우저 또는 로컬 테스트 결과 기록

## 구현 메모
- 변경한 파일: `.env.example`을 `apps/web/.env.example`로 이동, `apps/web/src/types/domain.ts`, `apps/web/src/vite-env.d.ts`, `apps/web/src/config/env.ts`, `apps/web/src/features/workspaces/.gitkeep`, `README.md`, `docs/02-architecture.md`, 이 문서. 빈 `apps/web/src/types/.gitkeep` 제거.
- 의사결정 및 이유: 기존 도메인 폴더를 유지하고 새 워크스페이스 영역을 추가했다. Firestore 스키마 확정 전이므로 공통 타입은 ID·역할·뷰 이름으로 제한했다. 웹·소켓 간 이벤트 계약은 `shared/contracts/`에 나중에 정의한다.
- 환경 설정: Vite의 웹 프로젝트 루트인 `apps/web/`에 예시 파일을 두고 타입을 선언했다. Firebase 기능을 사용할 때만 필수 값을 검사해 설정이 없는 초기 화면도 실행된다. `VITE_` 값에는 서버 비밀키를 넣지 않는다.
- 예외 상황·권한·로딩 검토: 누락된 Firebase 설정은 사용 시 명시적 오류를 내도록 했다. 인증·멤버십 권한은 7~8일차, 로딩·실패 UI는 해당 기능 구현 시 처리한다. 클라이언트 타입만으로 권한을 보장하지 않는다.
- 발견한 문제/해결: 기존 루트 `.env.example`은 웹 앱의 Vite 환경 파일 위치와 달라 옮겼다. 소켓 주소 기본값은 `http://localhost:3001`로 유지했다.
- 다음 일차에 넘길 사항: 3일차 2단 워크스페이스 레이아웃과 반응형 화면.

## 포트폴리오 기록
- 문제 정의: 기능별 빈 폴더는 있었지만 타입·환경 설정의 위치와 책임이 정해지지 않았다.
- 선택한 접근과 대안: 현재 웹 앱에 필요한 최소 타입만 두고, 서버 공유 계약과 실제 데이터 스키마는 해당 일차까지 미뤘다.
- 검증 근거(수치 임의 생성 금지): `npm run typecheck`, `npm run lint`, `npm run build:web` 통과. Vite 모듈 로드에서 Firebase 필수 값 누락 오류와 소켓 주소 기본값 확인. 개발 서버의 `/`, `/src/config/env.ts` HTTP 200 확인.
