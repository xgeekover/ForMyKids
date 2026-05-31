import { useEffect } from 'react'
import { useMemoryGame } from './hooks/useMemoryGame.js'
import { sound } from './sound.js'
import { LEVEL_ORDER } from './data/levels.js'
import { recordPlay, getCoopProfiles } from '../../../shared/fmk-store.js'   // 플랫폼 공통 기록 저장소(+같이 하기)
import { celebrate } from '../../../shared/fmk-confetti.js' // 클리어 시 화면 전체 폭죽
import { cheerActive } from '../../../shared/fmk-audio.js'  // 클리어 시 아이 이름 부르며 칭찬(TTS)
import { installGameGuard } from '../../../shared/fmk-screentime.js' // 스크린 타임 가드
import BgDecor from './components/BgDecor.jsx'
import StartScreen from './components/StartScreen.jsx'
import Hud from './components/Hud.jsx'
import PreviewBanner from './components/PreviewBanner.jsx'
import Board from './components/Board.jsx'
import WinPopup from './components/WinPopup.jsx'
import Announcer from './components/Announcer.jsx'

function formatTime(s) {
  const m = Math.floor(s / 60)
  return `${m}:${String(s % 60).padStart(2, '0')}`
}

export default function App() {
  const { state, total, matchedPairs, announce, startGame, restart, goMenu, flipCard } = useMemoryGame()

  // 첫 사용자 입력에서 오디오 컨텍스트 깨우기
  useEffect(() => {
    const h = () => sound.resume()
    document.addEventListener('pointerdown', h, { once: true })
    return () => document.removeEventListener('pointerdown', h)
  }, [])

  // 스크린 타임: 진입 시 초과면 잠금, 플레이 중 초과 시 잠금 오버레이(언마운트 시 타이머 정리)
  useEffect(() => installGameGuard({ homeHref: '../../index.html' }), [])

  // 한 판 클리어 시 플랫폼 공통 기록 저장(최단 시간·최고 별·최고 레벨·플레이 횟수·업적)
  useEffect(() => {
    if (!state.win) return
    recordPlay('memory', {
      timeMs: state.win.elapsed * 1000,
      stars: state.win.stars,
      level: LEVEL_ORDER.indexOf(state.level) + 1,
    })
    celebrate() // 짝꿍 다 맞춤(클리어)! 화면 전체 폭죽
    cheerActive() // "우와, OO 최고!" 음성 칭찬(음소거/미지원 시 무시)
  }, [state.win]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      {/* 플랫폼 메인(게임 런처)으로 돌아가는 공통 '홈으로' 버튼 — 모든 화면 좌상단 */}
      <a className="fmk-home-btn" href="../../index.html" aria-label="홈으로 — 게임 고르기로 돌아가기">
        <span className="fmk-home-emoji" aria-hidden="true">🏠</span>
        <span className="fmk-home-text">홈</span>
      </a>
      <BgDecor />
      <main className="app">
        {state.screen === 'start' ? (
          // 시작 시 같이 하기(Co-op) 참여자를 읽어 전달 — 단일이면 [] 라 기존과 동일
          <StartScreen onSelect={(level) => startGame(level, getCoopProfiles())} />
        ) : (
          <section className="screen screen--game is-active">
            <Hud
              moves={state.moves}
              time={formatTime(state.elapsed)}
              matched={matchedPairs}
              total={total}
              onHome={goMenu}
              onRestart={restart}
              coop={state.coop}
              players={state.players}
              current={state.current}
              scores={state.scores}
            />
            <PreviewBanner show={state.inPreview} count={state.previewCount} />
            <Board cards={state.cards} level={state.level} inPreview={state.inPreview} onFlip={flipCard} />
          </section>
        )}
      </main>
      <WinPopup
        win={state.win}
        time={state.win ? formatTime(state.win.elapsed) : ''}
        onAgain={restart}
        onMenu={goMenu}
      />
      <Announcer message={announce} />
    </>
  )
}
