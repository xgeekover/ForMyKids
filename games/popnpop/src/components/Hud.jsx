import { motion } from 'framer-motion';
import { START_HEALTH } from '../constants';

const Heart = ({ filled }) => (
  <svg
    viewBox="0 0 24 24"
    className={`w-8 h-8 transition-colors ${filled ? 'text-pink-500' : 'text-gray-300'}`}
  >
    <path
      fill="currentColor"
      d="M12 21s-7-4.35-9.5-8.5C.5 8.5 3.5 4 7.5 4c2 0 3.5 1 4.5 2.5C13 5 14.5 4 16.5 4c4 0 7 4.5 5 8.5C19 16.65 12 21 12 21z"
    />
  </svg>
);

// 상단 HUD: 레벨 / 점수 / 하트
const Hud = ({ level, score, health, language }) => {
  const labels =
    language === 'en'
      ? { level: 'Level', score: 'Score' }
      : { level: '레벨', score: '점수' };

  // pl-16 sm:pl-24: 좌상단에 떠 있는 플랫폼 '🏠 홈으로' 버튼과 '레벨' 표시가 겹치지 않도록 왼쪽 여백 확보
  return (
    <div className="fmk-safe-top flex items-center justify-between pl-16 sm:pl-24 pr-6 py-3 bg-white/60 backdrop-blur border-b-4 border-white shadow-sm">
      <div className="flex items-center gap-2">
        <span className="text-lg md:text-xl font-black text-sky-700">
          {labels.level}
        </span>
        <motion.span
          key={level}
          initial={{ scale: 0.5, rotate: -8 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: 'spring', stiffness: 260, damping: 14 }}
          className="text-2xl md:text-3xl font-black text-sky-600 bg-white rounded-2xl px-4 py-1 shadow-md"
        >
          {level}
        </motion.span>
      </div>

      <div className="flex items-center gap-2">
        <span className="text-lg md:text-xl font-black text-amber-700">
          {labels.score}
        </span>
        <motion.span
          key={score}
          initial={{ scale: 1.3 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', stiffness: 300, damping: 16 }}
          className="text-2xl md:text-3xl font-black text-amber-500 bg-white rounded-2xl px-4 py-1 shadow-md"
        >
          {score}
        </motion.span>
      </div>

      <div className="flex items-center gap-1">
        {Array.from({ length: START_HEALTH }).map((_, i) => (
          <motion.div
            key={i}
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: i * 0.05 }}
          >
            <Heart filled={i < health} />
          </motion.div>
        ))}
      </div>
    </div>
  );
};

export default Hud;
