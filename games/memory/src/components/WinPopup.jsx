import Confetti from './Confetti.jsx'

const MESSAGES = {
  3: '정말 대단해요! 짝꿍 박사님이네요! 🏆',
  2: '참 잘했어요! 정말 멋져요! 🌈',
  1: '참 잘했어요! 우리 한 번 더 놀아볼까? 💪',
}
const EMOJI = { 3: '🏆', 2: '🎉', 1: '🌟' }

// 같이 하기 결과 한 줄 — 무승부/승자
function coopResult(win) {
  const ps = win.players || []
  if (win.winner === -1) return `🤝 ${ps.map((p) => p.name).join(' & ')} 비겼어요! 둘 다 최고!`
  const w = ps[win.winner]
  return w ? `🥇 이번엔 ${w.name} 승! (${win.scores[0]} : ${win.scores[1]})` : ''
}

/* 축하 팝업 — 별점 · 횟수 · 시간 · 폭죽 (+같이 하기면 두 아이 점수/승자) */
export default function WinPopup({ win, time, onAgain, onMenu }) {
  if (!win) return null
  const { stars } = win
  return (
    <div className="overlay is-open">
      <Confetti />
      <div className="popup" role="dialog" aria-modal="true" aria-label="결과">
        <div className="popup-emoji">{EMOJI[stars]}</div>
        <h2 className="popup-title">참 잘했어요!</h2>

        {win.coop && win.players && win.players.length === 2 && (
          <div className="coop-result">
            <div className="coop-result-row">
              {win.players.map((p, i) => (
                <span key={p.id} className={'coop-result-player' + (win.winner === i ? ' is-winner' : '')}>
                  <span aria-hidden="true">{p.avatar}</span> {p.name} <b>💖 {win.scores[i]}</b>
                </span>
              ))}
            </div>
            <p className="coop-result-msg">{coopResult(win)}</p>
          </div>
        )}

        <div className="stars" aria-label={`별 ${stars}개`}>
          {[1, 2, 3].map((i) => (
            <span
              key={i}
              className={'star' + (i <= stars ? ' is-on' : '')}
              style={{ animationDelay: `${0.15 + (i - 1) * 0.22}s` }}
            >⭐</span>
          ))}
        </div>

        <div className="popup-stats">
          <div className="popup-stat">
            <span className="popup-stat-icon">👆</span>
            <span className="popup-stat-label">횟수</span>
            <span className="popup-stat-value">{win.moves}</span>
          </div>
          <div className="popup-stat">
            <span className="popup-stat-icon">⏱️</span>
            <span className="popup-stat-label">시간</span>
            <span className="popup-stat-value">{time}</span>
          </div>
        </div>

        <p className="popup-msg">{MESSAGES[stars]}</p>

        <div className="popup-actions">
          <button className="big-btn big-btn--again" type="button" onClick={onAgain}><span>🔁</span> 한 번 더!</button>
          <button className="big-btn big-btn--menu" type="button" onClick={onMenu}><span>📋</span> 레벨 고르기</button>
        </div>
      </div>
    </div>
  )
}
