import { motion } from 'framer-motion';
import { GAMEOVER_TEXT } from '../constants';

const GameOverScreen = ({ result, language, onRestart }) => {
  const { score, level } = result;
  const t = GAMEOVER_TEXT[language] ?? GAMEOVER_TEXT.ko;

  return (
    <div className="relative h-full w-full flex flex-col items-center justify-center gap-8 px-6 text-center overflow-hidden">
      {/* 축하 풍선 장식 */}
      {['bg-pink-300', 'bg-yellow-300', 'bg-emerald-300', 'bg-sky-300', 'bg-fuchsia-300'].map(
        (c, i) => (
          <motion.div
            key={i}
            className={`absolute w-14 h-16 rounded-[50%] ${c} opacity-70 shadow-md`}
            style={{ left: `${10 + i * 18}%`, bottom: '-100px' }}
            animate={{ y: ['0%', '-110vh'] }}
            transition={{ duration: 10 + i, delay: i * 0.3, repeat: Infinity, ease: 'linear' }}
          />
        )
      )}

      <motion.h1
        initial={{ scale: 0.4, opacity: 0, rotate: -6 }}
        animate={{ scale: 1, opacity: 1, rotate: 0 }}
        transition={{ type: 'spring', stiffness: 200, damping: 16 }}
        className="relative z-10 text-5xl md:text-7xl font-black text-pink-500 drop-shadow-lg"
      >
        {t.title}
      </motion.h1>

      <motion.p
        initial={{ y: 10, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.15 }}
        className="relative z-10 text-xl md:text-2xl text-sky-800 font-bold"
      >
        {t.sub}
      </motion.p>

      <div className="relative z-10 flex gap-5">
        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.25 }}
          className="bg-white rounded-3xl px-8 py-6 shadow-xl min-w-[140px]"
        >
          <div className="text-base md:text-lg text-sky-600 font-bold">{t.score}</div>
          <div className="text-4xl md:text-5xl font-black text-amber-500">{score}</div>
        </motion.div>

        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.35 }}
          className="bg-white rounded-3xl px-8 py-6 shadow-xl min-w-[140px]"
        >
          <div className="text-base md:text-lg text-sky-600 font-bold">{t.level}</div>
          <div className="text-4xl md:text-5xl font-black text-sky-600">{level}</div>
        </motion.div>
      </div>

      <motion.button
        initial={{ y: 30, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.5 }}
        whileHover={{ scale: 1.08, rotate: -2 }}
        whileTap={{ scale: 0.94 }}
        onClick={onRestart}
        className="relative z-10 px-12 py-5 text-3xl md:text-4xl font-black bg-sky-400 text-white rounded-full shadow-2xl border-4 border-white hover:bg-sky-500 transition-colors"
      >
        {t.button}
      </motion.button>
    </div>
  );
};

export default GameOverScreen;
