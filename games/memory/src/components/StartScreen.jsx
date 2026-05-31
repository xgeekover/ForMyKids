import { LEVELS, LEVEL_ORDER } from '../data/levels.js'

/* 시작 화면 — 난이도 6단계 선택 */
export default function StartScreen({ onSelect }) {
  return (
    <section className="screen screen--start is-active">
      <div className="title-card">
        <h1 className="game-title">
          <span className="title-emojis">⚡🎀</span>
          <span className="title-text">짝꿍 친구 찾기</span>
          <span className="title-emojis">☁️😈</span>
        </h1>
        <p className="title-sub">같은 친구 두 장을 찾아주세요!</p>
      </div>

      <div className="level-pick">
        {LEVEL_ORDER.map((key) => {
          const L = LEVELS[key]
          return (
            <button
              key={key}
              type="button"
              className={`level-btn level-btn--${key}`}
              onClick={() => onSelect(key)}
            >
              <span className="level-emoji">{L.emoji}</span>
              <span className="level-name">{L.label}</span>
              <span className="level-grid">🃏 {L.pairs * 2}장</span>
            </button>
          )
        })}
      </div>

      <p className="start-hint">난이도를 골라 시작해요 ✨</p>
    </section>
  )
}
