import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import ErrorBoundary from '../../../shared/ErrorBoundary.jsx'
import { installCrashGuard, registerServiceWorker } from '../../../shared/fmk-guard.js'
import * as sfx from '../../../shared/fmk-sound.js'
import '../../../shared/theme.css'   // 플랫폼 공통 Storybook 테마 (번들에 포함)
import './styles.css'

installCrashGuard({ homeHref: '../../index.html' }) // 비(非)React 런타임 에러 폴백
registerServiceWorker('../../sw.js')                // 오프라인 캐싱(운영 빌드)
sfx.armBGM('lively')                                // 첫 제스처에 경쾌한 게임 BGM 루프

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary homeHref="../../index.html">
      <App />
    </ErrorBoundary>
  </StrictMode>
)
