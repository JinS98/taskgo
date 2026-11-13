# Taskgo UI/UX 검토 시안

[상호작용 시안](taskgo-ui-preview.html)에서 Chat·Board·Calendar 탭, 워크스페이스 메뉴, 채팅 메시지의 **업무로 변환** 모달을 확인할 수 있다. 데이터와 일부 컨트롤은 시안용이며 현재 앱의 테마와 기능에 적용되지 않았다.

| 화면 | 미리보기 |
|---|---|
| Chat | [채팅](taskgo-chat.png) |
| Task Create | [업무 생성 모달](taskgo-modal.png) |
| Board | [업무 보드](taskgo-board.png) |
| Calendar | [캘린더](taskgo-calendar.png) |
| Mobile | [모바일 채팅](taskgo-mobile.png) |

## 제안 팔레트

| 역할 | 색상 |
|---|---|
| 페이지 배경 | `#F5F6F9` |
| 카드·메인 화면 | `#FFFFFF` |
| 기본 텍스트 | `#202838` |
| 보조 텍스트 | `#677284` |
| 경계선 | `#E4E8EF` |
| 주요 액션 | `#5849C8` |
| 선택 배경 | `#F0EDFF` |
| 완료·진행 보조색 | `#187765` |

사이드바 264px, 상단 헤더 65px, 뷰 탭 51px의 2단 구조를 기준으로 했다. 카드 모서리는 9~15px, 주요 여백은 8·16·24·32px 계열로 맞췄다. 월간 캘린더는 확정 업무를 단색 블록으로, 요청 대기를 점선 테두리로 구분한다. 이 시안은 정적 HTML·CSS·소량의 JavaScript로 구성해 React·SCSS 컴포넌트로 옮기기 쉽게 작성했다.
