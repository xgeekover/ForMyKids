/* 상단 정보 바 — 레벨 고르기 · 횟수 · 시간 · 찾은 짝 · 다시 하기
   (좌상단 🏠 '홈으로'(플랫폼 런처) 버튼과 헷갈리지 않도록, 이 게임의
    레벨 선택으로 가는 버튼은 📋 아이콘으로 구분한다.) */
export default function Hud({ moves, time, matched, total, onHome, onRestart }) {
  return (
    <header className="hud">
      <button className="icon-btn" type="button" aria-label="레벨 고르기" onClick={onHome}>📋</button>

      <div className="hud-stats">
        <div className="stat" title="뒤집은 횟수">
          <span className="stat-icon">👆</span>
          <span className="stat-value">{moves}</span>
        </div>
        <div className="stat" title="시간">
          <span className="stat-icon">⏱️</span>
          <span className="stat-value">{time}</span>
        </div>
        <div className="stat" title="찾은 짝꿍">
          <span className="stat-icon">💖</span>
          <span className="stat-value">{matched}/{total}</span>
        </div>
      </div>

      <button className="icon-btn" type="button" aria-label="다시 하기" onClick={onRestart}>🔄</button>
    </header>
  )
}
