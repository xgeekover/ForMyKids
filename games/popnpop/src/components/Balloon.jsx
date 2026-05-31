import { useEffect } from 'react';
import { motion } from 'framer-motion';
import Particles from './Particles';

// 화면 위로 떠오르는 풍선 한 개.
// - balloon:     { id, display, answer, color, x, y, swayPhase, popping }
//                display: 풍선에 적히는 문구  /  answer: 입력 매칭용 정답
// - active:      현재 입력과 일치하는 선두 풍선이면 true (하이라이트 링)
// - onPopDone:   팡 애니메이션이 끝난 뒤 실제로 제거하기 위한 콜백
const Balloon = ({ balloon, active, onPopDone }) => {
  const { id, display, color, x, y, swayPhase, popping } = balloon;

  // 터지는 순간부터 짧은 딜레이 후 목록에서 제거
  useEffect(() => {
    if (!popping) return undefined;
    const t = setTimeout(() => onPopDone(id), 600);
    return () => clearTimeout(t);
  }, [popping, id, onPopDone]);

  const swayX = Math.sin(swayPhase) * 10;

  return (
    <div
      className="absolute no-select"
      style={{
        left: `${x}%`,
        bottom: `${y}%`,
        transform: 'translateX(-50%)',
      }}
    >
      {popping ? (
        <Particles />
      ) : (
        <motion.div
          className="relative flex flex-col items-center"
          style={{ transform: `translateX(${swayX}px)` }}
          initial={{ opacity: 0, scale: 0.5, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 220, damping: 18 }}
        >
          {/* 풍선 몸체 */}
          <div
            className={`relative ${color.body} w-24 h-28 rounded-[50%] shadow-lg flex items-center justify-center`}
          >
            <span className="text-2xl font-black text-white drop-shadow-md tracking-wide px-2 text-center">
              {display}
            </span>
            {/* 하이라이트 */}
            <span className="absolute top-3 left-4 w-5 h-6 rounded-full bg-white/70 blur-[1px]" />
            {/* 풍선 꼭지 */}
            <span
              className={`absolute -bottom-1 left-1/2 -translate-x-1/2 w-3 h-3 ${color.body} rotate-45`}
            />
          </div>

          {/* 풍선 줄 */}
          <div className={`w-[3px] h-16 ${color.string} rounded-full`} />

          {/* 활성 풍선 하이라이트 링 */}
          {active && (
            <motion.div
              className="absolute -inset-2 rounded-[50%] ring-4 ring-yellow-300/80 pointer-events-none"
              style={{ height: '7.5rem', top: 0 }}
              animate={{ scale: [1, 1.08, 1] }}
              transition={{ duration: 0.9, repeat: Infinity, ease: 'easeInOut' }}
            />
          )}
        </motion.div>
      )}
    </div>
  );
};

export default Balloon;
