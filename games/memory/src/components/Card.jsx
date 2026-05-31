/* 카드 한 장 (CSS 3D Flip). 앞면 노출은 is-flipped/is-matched/is-preview 클래스가 제어 */
export default function Card({ card, preview, index, cols, onFlip }) {
  const cls = ['card']
  if (card.flipped) cls.push('is-flipped')
  if (card.matched) cls.push('is-matched')
  if (card.wrong) cls.push('is-wrong')
  if (preview) cls.push('is-preview')

  // 접근성: 위치(줄/열)와 상태를 라벨로 안내
  const row = Math.floor(index / cols) + 1
  const col = (index % cols) + 1
  const pos = `${row}번째 줄 ${col}번째`
  let label
  if (card.matched) label = `${card.name}, 짝 맞춤 완료`
  else if (card.flipped || preview) label = `${card.name}, ${pos}`
  else label = `뒤집기, ${pos}`

  return (
    <button
      type="button"
      className={cls.join(' ')}
      aria-label={label}
      aria-pressed={card.flipped || card.matched}
      style={{ '--char-color': card.color, animationDelay: `${index * 0.04}s` }}
      onClick={onFlip}
    >
      <span className="card-inner">
        <span className="card-face card-back"></span>
        <span className="card-face card-front" style={{ background: card.color }}>
          <span className="card-emoji">{card.emoji}</span>
          <span className="card-name">{card.name}</span>
        </span>
      </span>
    </button>
  )
}
