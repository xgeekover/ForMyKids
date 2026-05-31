/* 상단 정보 바 — 레벨 고르기 · 횟수 · 시간 · 찾은 짝 · 다시 하기
   (좌상단 🏠 '홈으로'(플랫폼 런처) 버튼과 헷갈리지 않도록, 이 게임의
    레벨 선택으로 가는 버튼은 📋 아이콘으로 구분한다.)
   같이 하기(Co-op)면 가운데에 두 아이의 차례/점수를 보여준다(현재 차례 = 파란 테두리). */
export default function Hud({ moves, time, matched, total, onHome, onRestart, coop, players, current, scores }) {
  return (
    <header className="hud">
      <button className="icon-btn" type="button" aria-label="레벨 고르기" onClick={onHome}>📋</button>

      {coop && players && players.length === 2 ? (
        <div className="coop-turns" aria-label="누구 차례인지와 점수">
          {players.map((p, i) => (
            <div
              key={p.id}
              className={`coop-player ${i === current ? 'is-turn' : ''}`}
              aria-current={i === current ? 'true' : 'false'}
            >
              <span className="coop-avatar" aria-hidden="true">{p.avatar}</span>
              <span className="coop-name">{p.name}</span>
              <span className="coop-score" title="맞춘 짝">💖 {(scores && scores[i]) || 0}</span>
            </div>
          ))}
        </div>
      ) : (
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
      )}

      <button className="icon-btn" type="button" aria-label="다시 하기" onClick={onRestart}>🔄</button>
    </header>
  )
}
