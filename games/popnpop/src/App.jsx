import { useCallback, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import StartScreen from './components/StartScreen';
import GameScreen from './components/GameScreen';
import GameOverScreen from './components/GameOverScreen';
import { recordPlay } from '../../../shared/fmk-store.js'; // 플랫폼 공통 기록 저장소
import { installGameGuard } from '../../../shared/fmk-screentime.js'; // 스크린 타임 가드

const App = () => {
  // 스크린 타임: 진입 시 초과면 잠금, 플레이 중 초과 시 잠금 오버레이(언마운트 시 타이머 정리)
  useEffect(() => installGameGuard({ homeHref: '../../index.html' }), []);
  // stage: 'start' | 'play' | 'over'
  const [stage, setStage] = useState('start');
  const [language, setLanguage] = useState('ko');
  const [result, setResult] = useState({ score: 0, level: 1 });

  const handleStart = useCallback((lang) => {
    setLanguage(lang);
    setStage('play');
  }, []);

  const handleGameOver = useCallback((r) => {
    // 게임 종료 시 플랫폼 공통 기록 저장(최고 점수·최고 레벨·모드·플레이 횟수·업적)
    recordPlay('popnpop', { score: r.score, level: r.level, mode: language });
    setResult(r);
    setStage('over');
  }, [language]);

  const handleRestart = useCallback(() => {
    setStage('start');
  }, []);

  return (
    <div className="h-full w-full">
      {/* 플랫폼 메인(게임 런처)으로 돌아가는 공통 '홈으로' 버튼 — 모든 화면 좌상단 */}
      <a className="fmk-home-btn" href="../../index.html" aria-label="홈으로 — 게임 고르기로 돌아가기">
        <span className="fmk-home-emoji" aria-hidden="true">🏠</span>
        <span className="fmk-home-text">홈</span>
      </a>
      <AnimatePresence mode="wait">
        {stage === 'start' && (
          <motion.div
            key="start"
            className="h-full w-full"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
          >
            <StartScreen onStart={handleStart} />
          </motion.div>
        )}

        {stage === 'play' && (
          <motion.div
            key="play"
            className="h-full w-full"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
          >
            <GameScreen language={language} onGameOver={handleGameOver} />
          </motion.div>
        )}

        {stage === 'over' && (
          <motion.div
            key="over"
            className="h-full w-full"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
          >
            <GameOverScreen
              result={result}
              language={language}
              onRestart={handleRestart}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default App;
