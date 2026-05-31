import Card from './Card.jsx'
import { LEVELS } from '../data/levels.js'

/* 카드 격자 — 열 수는 data-level 에 따라 styles.css 에서 결정.
   cols 는 카드의 접근성 위치 안내(줄/열)에 사용 */
export default function Board({ cards, level, inPreview, onFlip }) {
  const cols = (level && LEVELS[level].cols) || 4
  return (
    <div className="board-wrap">
      <div className={'board' + (inPreview ? ' is-preview' : '')} data-level={level}>
        {cards.map((card, i) => (
          <Card
            key={card.uid}
            card={card}
            index={i}
            cols={cols}
            preview={inPreview}
            onFlip={() => onFlip(card.uid)}
          />
        ))}
      </div>
    </div>
  )
}
