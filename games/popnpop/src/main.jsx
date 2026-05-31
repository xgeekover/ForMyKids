import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import ErrorBoundary from '../../../shared/ErrorBoundary.jsx';
import { installCrashGuard, registerServiceWorker } from '../../../shared/fmk-guard.js';
import * as sfx from '../../../shared/fmk-sound.js';
import './index.css';
import '../../../shared/theme.css'; // 플랫폼 공통 Storybook 테마 (번들에 포함)

installCrashGuard({ homeHref: '../../index.html' }); // 비(非)React 런타임 에러 폴백
registerServiceWorker('../../sw.js');                // 오프라인 캐싱(운영 빌드)
sfx.armBGM('lively');                                // 첫 제스처에 경쾌한 게임 BGM 루프

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary homeHref="../../index.html">
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
