# 01일차 — 프로젝트 초기 설정

- 예상 작업 시간: 3~4시간 (학습·디버깅에 따라 조정)
- 이전: 없음 / 다음: [02일차](day-02.md)
- **현재 상태: 완료**

## 목표
Vite·React·TypeScript 초기화, SCSS, ESLint.

## 작업 체크리스트
- [x] 관련 기획 정책과 이전 일차 산출물 확인
- [x] Vite·React·TypeScript 초기화, SCSS, ESLint
- [x] 예외 상황·권한·로딩·실패 시나리오 검토
- [x] 타입/테스트/수동 검증 후 변경사항 기록
- [x] README 또는 해당 docs 최신화

## 완료 기준
- [x] 로컬 빌드 확인
- [x] 브라우저 또는 로컬 테스트 결과 기록

## 구현 메모
- 변경한 파일: `package.json`, `package-lock.json`, `.gitignore`, `apps/web/package.json`, `apps/web/eslint.config.mjs`, `apps/web/src/main.tsx`, `README.md`, 이 문서.
- 의사결정 및 이유: 기존 Vite·React·TypeScript·SCSS 스캐폴드를 유지하고 ESLint flat config에 JavaScript·TypeScript·React Hooks 권장 규칙을 연결했다. 의존성 잠금 파일을 포함해 설치 버전을 재현할 수 있게 했다.
- 예외 상황 검토: 루트 DOM 요소가 없으면 명시적 오류를 내도록 변경했다. 인증·권한, 비동기 로딩·실패 UI는 아직 기능이 없는 단계이므로 해당 일차에서 다룬다.
- 발견한 문제/해결: 초기 스캐폴드에 ESLint가 없었고 빌드 시 `*.tsbuildinfo`가 생성되어 Git 무시 목록에 추가했다. 개발 도구 하위 의존성 `minimatch`에 보통 등급 보안 경고 10건이 남아 있으며, `npm audit --omit=dev --audit-level=moderate`에서는 취약점 0건이다. 상위 패키지의 호환 업데이트를 추적한다.
- 다음 일차에 넘길 사항: 2일차 도메인별 폴더·공통 타입·환경변수 정리.

## 포트폴리오 기록
- 문제 정의: 화면만 렌더링되는 초기 스캐폴드에 일관된 정적 검사와 재현 가능한 설치 기준이 없었다.
- 선택한 접근과 대안: 기존 앱을 새로 생성하지 않고 현재 스캐폴드에 ESLint와 잠금 파일을 추가했다.
- 검증 근거(수치 임의 생성 금지): Node.js 22.14.0에서 `npm run typecheck`, `npm run lint`, `npm run build:web` 통과. Vite 개발 서버에서 `/`, `/src/main.tsx`, `/favicon.svg` 모두 HTTP 200 확인.
