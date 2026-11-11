import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import AuthApp from './features/auth/AuthApp';
import './styles/global.scss';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Taskgo 앱의 루트 요소를 찾을 수 없습니다.');
}

createRoot(rootElement).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthApp />
    </BrowserRouter>
  </React.StrictMode>,
);
