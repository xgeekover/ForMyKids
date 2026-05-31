import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import Balloon from './Balloon';
import Hud from './Hud';
import { useGameLoop } from '../hooks/useGameLoop';
import {
  MAX_LEVEL,
  POPS_PER_LEVEL,
  PRAISE,
  START_HEALTH,
} from '../constants';

const normalize = (s) => (s ?? '').trim().toLowerCase();

const GameScreen = ({ language, onGameOver }) => {
  const [level, setLevel] = useState(1);
  const [score, setScore] = useState(0);
  const [health, setHealth] = useState(START_HEALTH);
  const [popsThisLevel, setPopsThisLevel] = useState(0);
  const [input, setInput] = useState('');
  const [praise, setPraise] = useState(null);
  const [levelUpBanner, setLevelUpBanner] = useState(null);

  const inputRef = useRef(null);
  // 한글 IME 조합 중인지 추적 (조합 도중 setInput('')만으로는 입력칸의
  // 조합 글자가 안 지워질 수 있어, blur로 강제 종료가 필요하다)
  const isComposingRef = useRef(false);
  // 게임 오버 기록(recordPlay)이 정확히 한 번만 발생하도록 보장하는 가드.
  // (AnimatePresence 퇴장 애니메이션 동안 마지막 입력으로 score/level 이 바뀌어도 중복 호출 방지)
  const overFiredRef = useRef(false);
  const playing = health > 0;

  const handleEscape = useCallback((count) => {
    setHealth((h) => Math.max(0, h - count));
  }, []);

  const { balloons, popBalloons, removeBalloon, clearBalloons } = useGameLoop({
    playing,
    level,
    language,
    onBalloonEscape: handleEscape,
  });

  // 현재 입력으로 시작되는 풍선 중 가장 위에 있는 것(=선두)을 활성 표시
  const activeBalloonId = useMemo(() => {
    const trimmed = normalize(input);
    if (!trimmed) return null;
    const candidates = balloons
      .filter((b) => !b.popping && normalize(b.answer).startsWith(trimmed))
      .sort((a, b) => b.y - a.y);
    return candidates[0]?.id ?? null;
  }, [balloons, input]);

  const tryPop = useCallback(
    (text) => {
      const target = normalize(text);
      if (!target) return 0;
      const popped = popBalloons((b) => normalize(b.answer) === target);
      if (popped > 0) {
        setScore((s) => s + popped * level * 10);
        setPopsThisLevel((p) => p + popped);
        const pool = PRAISE[language] ?? PRAISE.ko;
        setPraise({
          id: Date.now() + Math.random(),
          text: pool[Math.floor(Math.random() * pool.length)],
        });
      }
      return popped;
    },
    [popBalloons, level, language]
  );

  // 입력칸을 안전하게 비운다.
  // - setInput('')만으로는 IME 조합 중인 글자가 시각적으로 남는 경우가 있어,
  //   조합 중이면 blur를 걸어 조합을 강제로 종료시킨다 (onBlur가 즉시 재포커스).
  const resetInput = () => {
    setInput('');
    if (isComposingRef.current) {
      inputRef.current?.blur();
      isComposingRef.current = false;
    }
  };

  const handleChange = (e) => {
    const v = e.target.value;
    setInput(v);
    if (tryPop(v) > 0) {
      resetInput();
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      tryPop(input);
      // 엔터는 항상 입력을 비움 (틀려도 부정적 피드백 없이 다음 시도로)
      resetInput();
    }
  };

  const handleCompositionStart = () => {
    isComposingRef.current = true;
  };

  const handleCompositionEnd = (e) => {
    isComposingRef.current = false;
    // 조합이 끝난 시점의 최종 글자로 매치를 한 번 더 시도한다.
    // (조합 중간 onChange에서 매치되지 못한 경우 대비)
    const v = e.target.value;
    if (v && tryPop(v) > 0) {
      setInput('');
    }
  };

  // 레벨업 처리
  useEffect(() => {
    if (popsThisLevel >= POPS_PER_LEVEL && level < MAX_LEVEL) {
      const nextLevel = level + 1;
      setLevel(nextLevel);
      setPopsThisLevel(0);
      clearBalloons();
      setLevelUpBanner({
        id: Date.now(),
        text: language === 'en' ? `Level ${nextLevel}!` : `레벨 ${nextLevel}!`,
      });
    }
  }, [popsThisLevel, level, language, clearBalloons]);

  // 칭찬 문구 자동 소멸
  useEffect(() => {
    if (!praise) return undefined;
    const t = setTimeout(() => setPraise(null), 900);
    return () => clearTimeout(t);
  }, [praise]);

  // 레벨업 배너 자동 소멸
  useEffect(() => {
    if (!levelUpBanner) return undefined;
    const t = setTimeout(() => setLevelUpBanner(null), 1400);
    return () => clearTimeout(t);
  }, [levelUpBanner]);

  // 게임 오버 — 한 번만 발생(중복 recordPlay 방지)
  useEffect(() => {
    if (health <= 0 && !overFiredRef.current) {
      overFiredRef.current = true;
      onGameOver({ score, level });
    }
  }, [health, onGameOver, score, level]);

  // 포커스 유지
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const focusInput = () => inputRef.current?.focus();

  const placeholder =
    language === 'en'
      ? 'Type the balloon word!'
      : language === 'math'
        ? '풍선 숫자/정답을 입력해보세요!'
        : '풍선 글자를 따라 입력해보세요!';

  const inputMode = language === 'math' ? 'numeric' : 'text';

  const progress = Math.min(popsThisLevel / POPS_PER_LEVEL, 1);

  return (
    <div className="relative h-full w-full flex flex-col" onClick={focusInput}>
      <Hud level={level} score={score} health={health} language={language} />

      {/* 레벨 진행 바 + 남은 풍선 개수 */}
      <div className="px-6 pt-3 pb-1 flex items-center gap-4">
        <div className="flex-1 h-4 bg-white/60 rounded-full overflow-hidden shadow-inner">
          <motion.div
            className="h-full bg-gradient-to-r from-pink-400 via-yellow-300 to-emerald-400"
            animate={{ width: `${progress * 100}%` }}
            transition={{ type: 'spring', stiffness: 160, damping: 22 }}
          />
        </div>
        <motion.div
          key={popsThisLevel}
          initial={{ scale: 1.25 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', stiffness: 280, damping: 14 }}
          className="shrink-0 bg-white rounded-2xl px-4 py-1 shadow-md text-base md:text-lg font-black text-sky-700"
        >
          {language === 'en'
            ? `${Math.max(POPS_PER_LEVEL - popsThisLevel, 0)} to level up!`
            : `레벨업까지 ${Math.max(POPS_PER_LEVEL - popsThisLevel, 0)}개!`}
        </motion.div>
      </div>

      {/* 플레이 영역 */}
      <div className="relative flex-1 overflow-hidden">
        {/* 배경 구름 */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-6 left-8 w-32 h-10 bg-white/70 rounded-full blur-sm animate-drift" />
          <div className="absolute top-24 right-14 w-40 h-12 bg-white/60 rounded-full blur-sm animate-drift" />
          <div className="absolute top-1/3 left-1/3 w-24 h-8 bg-white/50 rounded-full blur-sm animate-drift" />
          <div className="absolute bottom-20 right-1/4 w-28 h-9 bg-white/50 rounded-full blur-sm animate-drift" />
        </div>

        {/* 풍선들 */}
        {balloons.map((b) => (
          <Balloon
            key={b.id}
            balloon={b}
            active={activeBalloonId === b.id}
            onPopDone={removeBalloon}
          />
        ))}

        {/* 맞췄을 때 칭찬 */}
        <AnimatePresence>
          {praise && (
            <motion.div
              key={praise.id}
              className="absolute top-1/3 left-1/2 -translate-x-1/2 pointer-events-none"
              initial={{ opacity: 0, scale: 0.6, y: 20 }}
              animate={{ opacity: 1, scale: 1.15, y: -10 }}
              exit={{ opacity: 0, y: -60, scale: 0.9 }}
              transition={{ duration: 0.55 }}
            >
              <span className="text-4xl md:text-5xl font-black text-yellow-500 drop-shadow-lg">
                {praise.text}
              </span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* 레벨업 배너 */}
        <AnimatePresence>
          {levelUpBanner && (
            <motion.div
              key={levelUpBanner.id}
              className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none"
              initial={{ scale: 0.4, opacity: 0, rotate: -12 }}
              animate={{ scale: 1.1, opacity: 1, rotate: 0 }}
              exit={{ scale: 1.4, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 220, damping: 14 }}
            >
              <div className="px-10 py-5 bg-white rounded-3xl shadow-2xl border-4 border-yellow-300">
                <span className="text-5xl md:text-6xl font-black text-pink-500">
                  {levelUpBanner.text}
                </span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* 입력창 */}
      <div className="fmk-safe-bottom p-4 md:p-5 bg-white/60 backdrop-blur border-t-4 border-white">
        <input
          ref={inputRef}
          value={input}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onCompositionStart={handleCompositionStart}
          onCompositionEnd={handleCompositionEnd}
          onBlur={focusInput}
          placeholder={placeholder}
          autoFocus
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          inputMode={inputMode}
          className="w-full text-center text-3xl md:text-4xl font-black py-4 rounded-2xl bg-white shadow-inner focus:outline-none focus:ring-4 focus:ring-sky-300 tracking-wide text-sky-800 placeholder:text-sky-300"
        />
      </div>
    </div>
  );
};

export default GameScreen;
