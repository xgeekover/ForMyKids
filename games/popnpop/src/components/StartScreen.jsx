import { useState } from 'react';
import { motion } from 'framer-motion';

// 장식용 배경 풍선
const FLOATERS = [
  { color: 'bg-pink-300',    left: '8%',  delay: 0   },
  { color: 'bg-yellow-300',  left: '22%', delay: 0.4 },
  { color: 'bg-emerald-300', left: '75%', delay: 0.2 },
  { color: 'bg-sky-300',     left: '88%', delay: 0.6 },
  { color: 'bg-fuchsia-300', left: '60%', delay: 0.8 },
];

const StartScreen = ({ onStart }) => {
  const [language, setLanguage] = useState('ko');

  return (
    <div className="relative h-full w-full flex flex-col items-center justify-center gap-10 px-6 text-center overflow-hidden">
      {/* 배경에 떠다니는 풍선들 */}
      {FLOATERS.map((f, i) => (
        <motion.div
          key={i}
          className={`absolute w-16 h-20 rounded-[50%] ${f.color} opacity-70 shadow-md`}
          style={{ left: f.left, bottom: '-120px' }}
          animate={{ y: ['0%', '-120vh'] }}
          transition={{
            duration: 16 + i * 2,
            delay: f.delay,
            repeat: Infinity,
            ease: 'linear',
          }}
        />
      ))}

      {/* 타이틀 */}
      <motion.div
        initial={{ y: -40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 200, damping: 18 }}
        className="relative z-10"
      >
        <h2 className="text-3xl md:text-4xl font-black text-sky-700 drop-shadow-sm">
          우리 아이의
        </h2>
        <h1 className="mt-2 text-6xl md:text-7xl font-black text-pink-500 drop-shadow-lg animate-bob">
          풍선터트리기
        </h1>
      </motion.div>

      {/* 모드 선택 */}
      <div className="relative z-10 flex flex-col items-center gap-3">
        <p className="text-lg md:text-xl font-bold text-sky-800">
          모드를 골라주세요 / Pick your mode
        </p>
        <div className="flex gap-4 flex-wrap justify-center">
          {[
            { code: 'ko',   label: '한글' },
            { code: 'en',   label: 'English' },
            { code: 'math', label: '산수' },
          ].map((opt) => {
            const selected = language === opt.code;
            return (
              <motion.button
                key={opt.code}
                whileHover={{ scale: 1.05, rotate: -1 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => setLanguage(opt.code)}
                className={`px-8 py-3 text-2xl font-black rounded-2xl shadow-md border-4 transition-colors ${
                  selected
                    ? 'bg-yellow-300 text-sky-900 border-yellow-400'
                    : 'bg-white/90 text-sky-700 border-white hover:bg-white'
                }`}
              >
                {opt.label}
              </motion.button>
            );
          })}
        </div>
      </div>

      {/* 시작 버튼 */}
      <motion.button
        whileHover={{ scale: 1.08, rotate: -2 }}
        whileTap={{ scale: 0.94 }}
        onClick={() => onStart(language)}
        className="relative z-10 px-14 py-6 text-4xl md:text-5xl font-black bg-pink-400 text-white rounded-full shadow-2xl border-4 border-white hover:bg-pink-500 transition-colors"
      >
        {language === 'en' ? 'Start Game!' : '게임 시작!'}
      </motion.button>

      <p className="relative z-10 text-sm md:text-base text-sky-700/80 max-w-md">
        {language === 'en'
          ? 'Type the word on the balloon to pop it!'
          : language === 'math'
            ? '풍선의 숫자나 식의 정답을 입력하면 풍선이 팡! 터져요.'
            : '풍선에 적힌 글자를 아래 칸에 똑같이 입력하면 풍선이 팡! 터져요.'}
      </p>
    </div>
  );
};

export default StartScreen;
