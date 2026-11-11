import { FirebaseError } from 'firebase/app';

export function getAuthErrorMessage(error: unknown): string {
  const code = error instanceof FirebaseError ? error.code : undefined;

  switch (code) {
    case 'auth/invalid-email':
      return '올바른 이메일 주소를 입력해 주세요.';
    case 'auth/weak-password':
      return '비밀번호는 6자 이상으로 입력해 주세요.';
    case 'auth/email-already-in-use':
      return '이미 사용 중인 이메일입니다. 기존 계정으로 로그인해 주세요.';
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return '이메일 또는 비밀번호를 확인해 주세요.';
    case 'auth/account-exists-with-different-credential':
      return '이 이메일은 다른 로그인 방식으로 등록되어 있습니다. 기존 방식으로 로그인한 뒤 계정 설정에서 Google 로그인을 연결해 주세요.';
    case 'auth/credential-already-in-use':
      return '이 로그인 방식은 다른 계정에 연결되어 있습니다. 계정을 자동으로 합치지 않았습니다.';
    case 'auth/provider-already-linked':
      return '이미 연결된 로그인 방식입니다.';
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
      return 'Google 로그인 창이 닫혔습니다. 다시 시도해 주세요.';
    case 'auth/popup-blocked':
      return '팝업이 차단되었습니다. 브라우저에서 팝업을 허용해 주세요.';
    case 'auth/unauthorized-domain':
      return '현재 주소는 Firebase 로그인 허용 도메인이 아닙니다.';
    case 'auth/too-many-requests':
      return '로그인 시도가 많습니다. 잠시 후 다시 시도해 주세요.';
    case 'auth/network-request-failed':
      return '네트워크 연결을 확인한 뒤 다시 시도해 주세요.';
    case 'auth/operation-not-allowed':
      return '이 로그인 방식이 Firebase 프로젝트에서 활성화되지 않았습니다.';
    case 'auth/requires-recent-login':
      return '보안을 위해 다시 로그인한 뒤 시도해 주세요.';
    default:
      return '인증 요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.';
  }
}
