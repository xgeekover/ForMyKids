import { useMemo } from 'react'

const COLORS = ['#ff8fb1', '#ffd93b', '#a8d8ff', '#b39ddb', '#9be3c4', '#ffb38a', '#ff6fa3']

/* 꽃가루(위에서 낙하) + 중앙 폭죽 버스트. 위치는 마운트 시 1회만 생성 */
export default function Confetti() {
  const { pieces, bursts } = useMemo(() => {
    const pieces = []
    for (let i = 0; i < 46; i++) {
      pieces.push({
        left: Math.random() * 100,
        color: COLORS[i % COLORS.length],
        dur: 2.4 + Math.random() * 2.2,
        delay: Math.random() * 0.8,
        w: 8 + Math.random() * 8,
        h: 10 + Math.random() * 10,
        round: i % 3 === 0,
      })
    }
    const bursts = []
    for (let i = 0; i < 28; i++) {
      const a = (Math.PI * 2 * i) / 28
      const d = 120 + Math.random() * 120
      bursts.push({ bx: Math.cos(a) * d, by: Math.sin(a) * d, color: COLORS[i % COLORS.length], delay: Math.random() * 0.25 })
    }
    return { pieces, bursts }
  }, [])

  return (
    <div className="confetti" aria-hidden="true">
      {pieces.map((p, i) => (
        <i
          key={'p' + i}
          style={{
            left: `${p.left}%`,
            background: p.color,
            animationDuration: `${p.dur}s`,
            animationDelay: `${p.delay}s`,
            width: `${p.w}px`,
            height: `${p.h}px`,
            borderRadius: p.round ? '50%' : '3px',
          }}
        />
      ))}
      {bursts.map((b, i) => (
        <b
          key={'b' + i}
          style={{ '--bx': `${b.bx}px`, '--by': `${b.by}px`, background: b.color, animationDelay: `${b.delay}s` }}
        />
      ))}
    </div>
  )
}
