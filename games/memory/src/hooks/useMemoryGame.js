/* ===================================================================
   useMemoryGame — 순수 리듀서(gameLogic)에 타이머/사운드/지연 판정 같은
   부수효과를 결합하는 훅.
   · 미리 보기 5초 카운트다운 (라운드마다 재시작, 리셋 시 취소)
   · 두 장 뒤집힘 → 0.5s(매칭)/1s(불일치) 지연 후 판정
   · 승리 시 0.65s 뒤 팝업
   · 모든 setTimeout 은 추적 후 다시하기/처음으로/언마운트에서 정리(stale 콜백 방지)
   =================================================================== */
import { useReducer, useEffect, useRef, useCallback, useState } from 'react'
import { reducer, initialState, totalPairs, matchedPairsOf } from '../gameLogic.js'
import { LEVELS } from '../data/levels.js'
import { sound } from '../sound.js'

export function useMemoryGame() {
  const [state, dispatch] = useReducer(reducer, initialState)
  const [announce, setAnnounce] = useState('') // 스크린리더용 라이브 안내 메시지

  const timeoutsRef = useRef([])     // 매칭/불일치/승리 setTimeout 모음
  const resolvingRef = useRef(false) // 한 쌍 판정 중복 예약 방지
  const startTimeRef = useRef(0)

  const clearTimeouts = useCallback(() => {
    timeoutsRef.current.forEach(clearTimeout)
    timeoutsRef.current = []
    resolvingRef.current = false
  }, [])

  /* 미리 보기 카운트다운 — round 가 바뀔 때마다 재시작, cleanup 으로 안전 취소 */
  useEffect(() => {
    if (!state.inPreview) return
    let n = state.previewCount // 난이도별 미리 보기 시간(START 에서 설정됨)
    const id = setInterval(() => {
      n -= 1
      if (n > 0) {
        dispatch({ type: 'PREVIEW_TICK', value: n })
        sound.tick(n)
      } else {
        clearInterval(id)
        sound.start()
        dispatch({ type: 'PREVIEW_END' })
      }
    }, 1000)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.round, state.inPreview])

  /* 게임 타이머 — 미리 보기 종료(timerRunning) 후 시작 */
  useEffect(() => {
    if (!state.timerRunning) return
    startTimeRef.current = performance.now()
    const id = setInterval(() => {
      dispatch({ type: 'TICK', value: Math.floor((performance.now() - startTimeRef.current) / 1000) })
    }, 250)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.timerRunning, state.round])

  /* 두 장 뒤집힘 → 지연 판정 */
  useEffect(() => {
    const open = state.cards.filter((c) => c.flipped && !c.matched)
    if (open.length === 2 && !resolvingRef.current) {
      resolvingRef.current = true
      const [a, b] = open
      if (a.id === b.id) {
        const t = setTimeout(() => {
          dispatch({ type: 'RESOLVE_MATCH', id: a.id })
          sound.match()
          setAnnounce(`${a.name} 짝 맞춤! 🎉`)
          resolvingRef.current = false
        }, 500)
        timeoutsRef.current.push(t)
      } else {
        sound.wrong()
        dispatch({ type: 'MARK_WRONG', uids: [a.uid, b.uid] })
        const t = setTimeout(() => {
          dispatch({ type: 'RESOLVE_MISMATCH', uids: [a.uid, b.uid] })
          setAnnounce('아이고, 다시 해볼까?')
          resolvingRef.current = false
        }, 1000)
        timeoutsRef.current.push(t)
      }
    }
  }, [state.cards])

  /* 승리 판정 */
  useEffect(() => {
    if (!state.level || state.win) return
    const total = LEVELS[state.level].pairs
    if (total > 0 && matchedPairsOf(state.cards) === total) {
      const t = setTimeout(() => {
        dispatch({ type: 'WIN' })
        sound.win()
      }, 650)
      timeoutsRef.current.push(t)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.cards])

  /* 언마운트 정리 */
  useEffect(() => () => clearTimeouts(), [clearTimeouts])

  const startGame = useCallback((level) => { clearTimeouts(); setAnnounce(''); sound.resume(); dispatch({ type: 'START', level }) }, [clearTimeouts])
  const restart   = useCallback(() => { clearTimeouts(); setAnnounce(''); dispatch({ type: 'RESTART' }) }, [clearTimeouts])
  const goMenu    = useCallback(() => { clearTimeouts(); setAnnounce(''); dispatch({ type: 'MENU' }) }, [clearTimeouts])

  const flipCard = useCallback((uid) => {
    if (state.lockBoard || state.inPreview || state.win) return
    const c = state.cards.find((x) => x.uid === uid)
    if (!c || c.flipped || c.matched) return
    sound.flip()
    setAnnounce(c.name) // 뒤집은 캐릭터 이름 안내
    dispatch({ type: 'FLIP', uid })
  }, [state.lockBoard, state.inPreview, state.win, state.cards])

  return {
    state,
    total: totalPairs(state.level),
    matchedPairs: matchedPairsOf(state.cards),
    announce,
    startGame,
    restart,
    goMenu,
    flipCard,
  }
}
