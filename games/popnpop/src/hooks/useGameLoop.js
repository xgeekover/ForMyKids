import { useCallback, useEffect, useRef, useState } from 'react';
import { BALLOON_COLORS, getBalloonContent, getLevelConfig } from '../constants';

// 고유 ID 생성기 (모듈 스코프, 리렌더와 무관하게 증가)
let balloonIdCounter = 0;

const pickColor = () => BALLOON_COLORS[Math.floor(Math.random() * BALLOON_COLORS.length)];

// 풍선 생성/이동/이탈을 담당하는 게임 루프 훅.
// - playing:          게임이 진행 중인지
// - level, language:  현재 레벨/언어에 맞춰 단어를 뽑음
// - onBalloonEscape:  풍선이 화면 위로 빠져나갔을 때 호출 (하트 감소용)
//
// 반환값
// - balloons:       현재 화면 위의 풍선 목록
// - popBalloons:    조건에 맞는 풍선을 "popping" 상태로 바꿈
// - removeBalloon:  특정 풍선을 목록에서 제거 (애니메이션 끝난 뒤)
// - clearBalloons:  화면의 모든 풍선 초기화 (레벨업 시 사용)
export const useGameLoop = ({ playing, level, language, onBalloonEscape }) => {
  const [balloons, setBalloons] = useState([]);

  const rafRef = useRef(null);
  const lastTickRef = useRef(null);
  const lastSpawnRef = useRef(0);

  // popBalloons가 React의 비동기 updater에 의존하지 않도록
  // 최신 balloons 스냅샷을 ref로 동기 참조한다.
  const balloonsRef = useRef([]);
  useEffect(() => {
    balloonsRef.current = balloons;
  }, [balloons]);

  // 최신 값을 루프 안에서 참조하기 위한 ref 미러
  const levelRef = useRef(level);
  const languageRef = useRef(language);
  const playingRef = useRef(playing);
  const onEscapeRef = useRef(onBalloonEscape);

  useEffect(() => { levelRef.current = level; }, [level]);
  useEffect(() => { languageRef.current = language; }, [language]);
  useEffect(() => { playingRef.current = playing; }, [playing]);
  useEffect(() => { onEscapeRef.current = onBalloonEscape; }, [onBalloonEscape]);

  useEffect(() => {
    if (!playing) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      lastTickRef.current = null;
      lastSpawnRef.current = 0;
      return undefined;
    }

    const tick = (now) => {
      if (!playingRef.current) return;

      if (lastTickRef.current == null) {
        lastTickRef.current = now;
        lastSpawnRef.current = now;
      }
      const dt = (now - lastTickRef.current) / 1000;
      lastTickRef.current = now;

      const config = getLevelConfig(languageRef.current, levelRef.current);

      // 1) 스폰 타이밍
      if (now - lastSpawnRef.current >= config.spawnMs) {
        lastSpawnRef.current = now;
        const content = getBalloonContent(languageRef.current, levelRef.current);
        const newBalloon = {
          id: ++balloonIdCounter,
          display: content.display,         // 풍선에 보이는 문구 (ex. "3+5")
          answer: content.answer,           // 입력해서 맞춰야 하는 정답 (ex. "8")
          color: pickColor(),
          x: 10 + Math.random() * 80,      // 가로 위치(%)
          y: 0,                            // 아래에서부터 몇 % 올라왔는지
          swayPhase: Math.random() * Math.PI * 2,
          popping: false,
        };
        setBalloons((prev) => [...prev, newBalloon]);
      }

      // 2) 이동 & 이탈 처리
      setBalloons((prev) => {
        let escaped = 0;
        const next = [];
        for (const b of prev) {
          if (b.popping) {
            next.push(b);
            continue;
          }
          const ny = b.y + config.speed * dt;
          if (ny >= 105) {
            escaped += 1;
          } else {
            next.push({
              ...b,
              y: ny,
              swayPhase: b.swayPhase + dt * 1.6,
            });
          }
        }
        if (escaped > 0 && onEscapeRef.current) {
          onEscapeRef.current(escaped);
        }
        return next;
      });

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      lastTickRef.current = null;
    };
  }, [playing]);

  // 조건에 맞는 풍선들을 팡! 터뜨림.
  // 동기적으로 맞은 개수를 반환해야 하므로 ref 스냅샷에서 먼저 개수를 구하고,
  // 상태 갱신은 그다음에 수행한다. (React 18의 updater는 비동기로 실행됨)
  const popBalloons = useCallback((predicate) => {
    const matchIds = new Set();
    for (const b of balloonsRef.current) {
      if (!b.popping && predicate(b)) matchIds.add(b.id);
    }
    if (matchIds.size === 0) return 0;
    setBalloons((prev) =>
      prev.map((b) => (matchIds.has(b.id) ? { ...b, popping: true } : b))
    );
    return matchIds.size;
  }, []);

  const removeBalloon = useCallback((id) => {
    setBalloons((prev) => prev.filter((b) => b.id !== id));
  }, []);

  const clearBalloons = useCallback(() => {
    setBalloons([]);
    lastSpawnRef.current = 0;
  }, []);

  return { balloons, popBalloons, removeBalloon, clearBalloons };
};
