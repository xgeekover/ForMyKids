/* ===================================================================
   ForMyKids · 공통 기록 저장소 (localStorage) — v2 다중 프로필(Multi-Profile)
   -------------------------------------------------------------------
   여섯 게임(memory·popnpop·dodge·maze·spot·puzzle)의 기록을 한 곳(같은 origin 의
   localStorage)에 통합 저장한다. ES 모듈이라 React 게임은 번들에 import,
   런처/순수 JS 게임은 <script type="module"> 로 import 한다. (게임 추가 시 GAME_IDS 확장)

   저장 키: "fmk:v1" 에 단일 JSON 으로 보관. (버전 필드로 v1→v2 마이그레이션 판별 — 키는 유지)

   데이터 규격 (v2 — 다중 프로필)
   ───────────
   {
     version: 2,
     activeProfileId: <profileId> | null,   // 현재 '플레이 중'인 아이. null 이면 런처가 프로필 선택 화면을 띄움
     profiles: [                            // 아이별 슬롯(배열)
       {
         id:         <uuid>,                // 프로필 식별자
         name:       string,                // 아이 이름/별명(부모님 방 탭·선택 화면 표시)
         avatar:     '🐶',                  // 아바타 이모지(AVATARS)
         themeColor: 'pink',                // 테마색 id(THEME_COLORS) → --fmk-primary
         createdAt:  number,                // 생성 시각(epoch ms)
         // ↓ 이 프로필 '하위'에만 저장되는 기록(게임 플레이/최고 점수/칭찬 도장)
         totalPlays: number,                // 이 아이의 전체 합산 플레이 횟수
         games: { <gameId>: { plays, bestScore, bestTimeMs, lastPlayed, meta } },
         achievements: { <achId>: { unlockedAt } },  // 이 아이가 획득한 칭찬 도장
         seen: { <achId>: true },           // 이 아이가 도장 모달에서 이미 본 도장(새 도장 연출 1회용)
       }
     ],
     updatedAt: number,                     // 마지막 변경 시각(epoch ms) — 클라우드 동기화 머지 기준(payload 통째)
   }

   게임별 records 의 meta 필드(있을 때만 채워짐)
     bestLevel? · bestStars? · bestStage? · noHintLevel? · lastMode? · bestTimeByLevel?{[level]:ms}

   사용법
   ───────
     import { recordPlay } from '.../shared/fmk-store.js'
     const { newlyUnlocked } = recordPlay('dodge', { score: 240, stage: 2 })
   게임은 결과만 넘기면 되고, '현재 활성 프로필' 하위에 최고 기록 갱신/업적 판정/저장이 일어난다.
   (활성 프로필이 없으면 안전하게 기본 프로필을 만들어 거기에 기록한다 → 데이터 유실 방지)

   마이그레이션
   ───────
   기존 v1.1.0 단일 프로필 데이터(top-level games/achievements/profile)가 남아 있으면,
   앱 실행 시 자동으로 첫 번째 '기본 프로필(Default Profile)'로 변환되어 활성화된다(데이터 보존).
   =================================================================== */

import { celebrate } from './fmk-confetti.js'; // 칭찬 도장 해금 순간의 화면 전체 폭죽(브라우저 전용·Node 안전 no-op)
import { enqueue, listQueue, clearQueue, drainQueue } from './fmk-syncqueue.js'; // 여행 모드 오프라인 큐(브라우저 전용·Node no-op)

const KEY = 'fmk:v1';
export const GAME_IDS = ['memory', 'popnpop', 'dodge', 'maze', 'spot', 'puzzle'];
const DEFAULT_NAME = '우리 아이'; // 마이그레이션/지연 생성된 기본 프로필 이름
// v1→v2 마이그레이션 프로필의 '고정' id. 마이그레이션은 getState() 마다 재실행되는데(저장 전까지),
// 매번 새 난수 id 를 만들면 activeProfileId 가 호출마다 달라진다 → 결정적(고정) id 로 멱등성 보장.
const MIGRATED_PROFILE_ID = 'fmk-default-profile';

// 게임 메타(런처/대시보드 표시용)
export const GAMES = {
  memory:  { icon: '🐾', title: '짝꿍 친구 찾기', scoring: 'time'  }, // 시간형: 낮을수록 좋음
  popnpop: { icon: '🎈', title: '풍선 터트리기', scoring: 'score' }, // 점수형
  dodge:   { icon: '🚀', title: '우주선 똥 피하기', scoring: 'score' }, // 점수형
  maze:    { icon: '🐱', title: '동화책 미로 탈출', scoring: 'time'  }, // 시간형
  spot:    { icon: '🔍', title: '틀린그림찾기', scoring: 'score' },     // 점수형
  puzzle:  { icon: '🧩', title: '조각조각 퍼즐', scoring: 'time'  },    // 시간형
};

// 내 프로필(My Avatar) 선택지 — 아바타 이모지 + 테마 컬러(런처/대시보드 --fmk-primary 에 반영)
export const AVATARS = ['🐶', '🐰', '🐯', '🦕', '🦄', '🐱'];
export const THEME_COLORS = [
  { id: 'pink',   label: '핑크',   color: '#ff8fb1' },
  { id: 'blue',   label: '블루',   color: '#7aa8ff' },
  { id: 'yellow', label: '옐로우', color: '#ffce5a' },
  { id: 'green',  label: '그린',   color: '#5fcf9f' },
  { id: 'purple', label: '퍼플',   color: '#b18cff' },
  { id: 'peach',  label: '피치',   color: '#ff9d6c' },
];
const AVATAR_SET = new Set(AVATARS);
const THEME_SET = new Set(THEME_COLORS.map((t) => t.id));
export function themeColorHex(id) { const t = THEME_COLORS.find((x) => x.id === id); return t ? t.color : null; }

// 업적(칭찬 도장) 카탈로그 — test(state) 가 true 가 되면 자동 획득.
// state 는 '활성 프로필' 객체(totalPlays·games 를 그대로 가짐) → 기존 테스트 함수 그대로 동작.
// 게임은 업적 로직을 몰라도 되고, recordPlay 시점에 (그 프로필 기준으로) 일괄 평가된다.
// color: 도장(stamp)의 파스텔 테마색. 아이가 색만 보고도 어떤 도장인지 떠올리도록 매칭.
export const ACHIEVEMENTS = [
  { id: 'first-step',   icon: '🐣', title: '첫 놀이',       color: '#ffe6a8', desc: '처음으로 놀이를 시작했어요!',         test: (s) => s.totalPlays >= 1 },
  { id: 'memory-play',  icon: '🐾', title: '짝꿍 친구',     color: '#ffc4dd', desc: '짝꿍 친구 찾기를 깼어요!',            test: (s) => s.games.memory.plays >= 1 },
  { id: 'popnpop-play', icon: '🎈', title: '풍선 친구',     color: '#bfe0ff', desc: '풍선 터트리기를 해봤어요!',           test: (s) => s.games.popnpop.plays >= 1 },
  { id: 'dodge-play',   icon: '🚀', title: '우주 조종사',   color: '#d9c7ff', desc: '우주선을 타고 날아봤어요!',           test: (s) => s.games.dodge.plays >= 1 },
  { id: 'explorer',     icon: '🗺️', title: '놀이터 탐험가', color: '#bff0d8', desc: '세 가지 놀이를 모두 해봤어요!',       test: (s) => ['memory', 'popnpop', 'dodge'].every((id) => s.games[id] && s.games[id].plays >= 1) },
  { id: 'memory-3star', icon: '🌟', title: '암기왕',         color: '#ffd86b', desc: '짝꿍 찾기에서 별 셋을 받았어요!',     test: (s) => (s.games.memory.meta.bestStars || 0) >= 3 },
  { id: 'popnpop-lv5',  icon: '🏆', title: '풍선 챔피언',   color: '#ffcf8a', desc: '풍선 터트리기 레벨 5에 닿았어요!',    test: (s) => (s.games.popnpop.meta.bestLevel || 0) >= 5 },
  { id: 'dodge-evolve', icon: '🛸', title: '회피 달인',     color: '#b69bff', desc: '우주선이 200점을 넘겨 진화했어요!',   test: (s) => (s.games.dodge.bestScore || 0) >= 200 },
  { id: 'maze-explorer', icon: '🧭', title: '꼬마 탐험가',  color: '#a9e6c6', desc: '도전 미로(9×9)를 탈출했어요!',        test: (s) => ((s.games.maze && s.games.maze.meta.bestLevel) || 0) >= 4 },
  { id: 'spot-detective', icon: '🔍', title: '돋보기 탐정', color: '#ffd6a8', desc: '힌트 없이 보통 이상 틀린그림을 찾았어요!', test: (s) => ((s.games.spot && s.games.spot.meta.noHintLevel) || 0) >= 2 },
  { id: 'puzzle-master', icon: '🧩', title: '퍼즐 마스터',  color: '#c9b6ff', desc: '36조각(5단계) 이상 퍼즐을 완성했어요!', test: (s) => ((s.games.puzzle && s.games.puzzle.meta.bestLevel) || 0) >= 5 },
  { id: 'regular',      icon: '⭐', title: '단골 손님',     color: '#ffb3c9', desc: '모두 합쳐 열 번이나 놀았어요!',       test: (s) => s.totalPlays >= 10 },
];

// ---------- 식별자 ----------
// 프로필 id 생성(브라우저·Node 모두 안전). crypto.randomUUID 없으면 시각+난수 폴백.
function genId() {
  try { if (typeof crypto !== 'undefined' && crypto && typeof crypto.randomUUID === 'function') return crypto.randomUUID(); } catch (e) {}
  return 'p-' + Date.now().toString(36) + '-' + Math.floor(Math.random() * 1e9).toString(36);
}

// ---------- 기본 상태 ----------
function freshGame() {
  return { plays: 0, bestScore: null, bestTimeMs: null, lastPlayed: null, meta: {} };
}
function freshGames() {
  // GAME_IDS 를 단일 소스로 사용 → 빈 저장소 경로에서도 모든 게임 버킷 보장
  return Object.fromEntries(GAME_IDS.map((id) => [id, freshGame()]));
}
// 프로필 1개 생성(입력값은 허용된 값만 채택, 나머지는 안전한 기본값)
function freshProfile(opts = {}) {
  const name = (opts && typeof opts.name === 'string' && opts.name.trim()) ? opts.name.trim().slice(0, 24) : DEFAULT_NAME;
  return {
    id: (typeof opts.id === 'string' && opts.id.trim()) ? opts.id.trim().slice(0, 64) : genId(),
    name,
    avatar: AVATAR_SET.has(opts.avatar) ? opts.avatar : AVATARS[0],
    themeColor: THEME_SET.has(opts.themeColor) ? opts.themeColor : THEME_COLORS[0].id,
    createdAt: Date.now(),
    totalPlays: 0,
    games: freshGames(),
    achievements: {},
    seen: {},
    customPuzzleId: null,                 // 커스텀(가족 사진) 퍼즐 이미지 id — 실제 사진은 IndexedDB(fmk-photos)
    dailyLimitMin: null,                  // 일일 최대 플레이 시간(분). null/0 = 제한 없음
    screen: { date: '', usedSec: 0 },     // 당일 누적 플레이 시간(초). date 가 오늘과 다르면 리셋
  };
}
// 빈 v2 상태(프로필 없음 → 런처가 '누가 놀까요?' 선택 화면을 띄움)
function freshState() {
  return { version: 2, activeProfileId: null, profiles: [], updatedAt: 0 };
}

// ---------- 저장소 접근(실패 시 in-memory 폴백) ----------
// 사생활 보호 모드 / file:// 등에서 localStorage 가 없거나 던져도 앱이 죽지 않도록.
let _mem = null; // 폴백 보관용(직렬화 문자열)
function _ls() {
  try { if (typeof localStorage !== 'undefined' && localStorage) return localStorage; } catch (e) {}
  return null;
}
function _read() {
  const ls = _ls();
  if (!ls) return _mem;
  try { return ls.getItem(KEY); } catch (e) { return _mem; }
}
function _write(str) {
  _mem = str; // 항상 메모리에도 보관(폴백 + 같은 세션 일관성)
  const ls = _ls();
  if (!ls) return;
  try { ls.setItem(KEY, str); } catch (e) {}
}

// ---------- 상태 읽기/쓰기(보정·마이그레이션 포함) ----------
// 유한수 또는 숫자형 문자열만 통과(아니면 undefined) — 손상/NaN/Infinity 방어.
// 주의: Number(null)===0, Number('')===0 이므로 그런 값이 0 으로 둔갑하지 않도록 타입을 가린다.
function num(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}
const KNOWN_ACH = new Set(ACHIEVEMENTS.map((a) => a.id));

// 저장된 게임 1개를 '알려진 필드만' 으로 안전하게 재구성(손상/잘못된 타입 정화).
// 알 수 없는 추가 필드는 버리고, 숫자 메타는 유한수로 보정한다.
function normGame(g) {
  const src = (g && typeof g === 'object' && !Array.isArray(g)) ? g : {};
  const meta = {};
  const m = (src.meta && typeof src.meta === 'object' && !Array.isArray(src.meta)) ? src.meta : {};
  for (const k of ['bestLevel', 'bestStars', 'bestStage', 'noHintLevel']) {
    const n = num(m[k]); if (n !== undefined) meta[k] = n;
  }
  if (typeof m.lastMode === 'string') meta.lastMode = m.lastMode;
  // 난이도별 최단 시간(memory): { level: ms } — 유한·양수 값만 보존
  if (m.bestTimeByLevel && typeof m.bestTimeByLevel === 'object' && !Array.isArray(m.bestTimeByLevel)) {
    const clean = {};
    for (const k of Object.keys(m.bestTimeByLevel)) {
      const n = num(m.bestTimeByLevel[k]);
      if (n !== undefined && n > 0) clean[k] = n;
    }
    if (Object.keys(clean).length) meta.bestTimeByLevel = clean;
  }
  const plays = num(src.plays);
  return {
    plays: plays !== undefined ? Math.max(0, Math.floor(plays)) : 0,
    bestScore: num(src.bestScore) ?? null,
    bestTimeMs: num(src.bestTimeMs) ?? null,
    lastPlayed: num(src.lastPlayed) ?? null,
    meta,
  };
}

// 프로필 1개를 우리 스키마로 안전하게 정규화(손상/잘못된 타입 정화).
function normProfile(p) {
  const src = (p && typeof p === 'object' && !Array.isArray(p)) ? p : {};

  // 게임 버킷: 알려진 게임 + 저장돼 있던(미래 추가) 버킷까지 모두 보존·정규화
  const ids = new Set(GAME_IDS);
  const games = (src.games && typeof src.games === 'object' && !Array.isArray(src.games)) ? src.games : {};
  for (const k of Object.keys(games)) ids.add(k);
  const g = {};
  for (const id of ids) g[id] = normGame(games[id]);

  // 업적: 객체(배열 아님) + 알려진 id 만 화이트리스트로 보존
  const achievements = {};
  if (src.achievements && typeof src.achievements === 'object' && !Array.isArray(src.achievements)) {
    for (const k of Object.keys(src.achievements)) {
      if (!KNOWN_ACH.has(k)) continue;
      const v = src.achievements[k];
      achievements[k] = (v && typeof v === 'object') ? v : { unlockedAt: 0 };
    }
  }
  // 본 도장(seen): 객체 + 알려진 id 만 보존
  const seen = {};
  if (src.seen && typeof src.seen === 'object' && !Array.isArray(src.seen)) {
    for (const k of Object.keys(src.seen)) { if (KNOWN_ACH.has(k) && src.seen[k]) seen[k] = true; }
  }

  const tp = num(src.totalPlays);
  const ca = num(src.createdAt);

  // 커스텀 퍼즐 사진 id(IndexedDB 참조) — 문자열만 보존
  const customPuzzleId = (typeof src.customPuzzleId === 'string' && src.customPuzzleId.trim())
    ? src.customPuzzleId.trim().slice(0, 80) : null;
  // 일일 제한(분) — 양수만, 그 외 null(제한 없음)
  const dlm = num(src.dailyLimitMin);
  const dailyLimitMin = (dlm !== undefined && dlm > 0) ? Math.floor(dlm) : null;
  // 당일 누적 사용량(초) — { date:'YYYY-MM-DD', usedSec:number }
  let screen = { date: '', usedSec: 0 };
  if (src.screen && typeof src.screen === 'object' && !Array.isArray(src.screen)) {
    const d = (typeof src.screen.date === 'string') ? src.screen.date.slice(0, 10) : '';
    const u = num(src.screen.usedSec);
    // 하루 최대치(24h)로 상한 — 손상된 거대값이 종일 잠금을 유발하지 않도록 방어
    screen = { date: d, usedSec: (u !== undefined && u >= 0) ? Math.min(Math.floor(u), 24 * 3600) : 0 };
  }

  // 일자별 플레이 횟수(잔디 활동 캘린더용). { 'YYYY-MM-DD': count } — 최근 ~370일만 보존(무한 성장 방지).
  let days = {};
  if (src.days && typeof src.days === 'object' && !Array.isArray(src.days)) {
    const keys = Object.keys(src.days).filter((k) => /^\d{4}-\d{2}-\d{2}$/.test(k)).sort();
    for (const k of keys.slice(-370)) {
      const v = num(src.days[k]);
      if (v !== undefined && v > 0) days[k] = Math.min(Math.floor(v), 100000);
    }
  }

  return {
    id: (typeof src.id === 'string' && src.id.trim()) ? src.id.trim().slice(0, 64) : genId(),
    name: (typeof src.name === 'string' && src.name.trim()) ? src.name.trim().slice(0, 24) : DEFAULT_NAME,
    avatar: AVATAR_SET.has(src.avatar) ? src.avatar : AVATARS[0],
    themeColor: THEME_SET.has(src.themeColor) ? src.themeColor : THEME_COLORS[0].id,
    createdAt: ca !== undefined ? Math.max(0, Math.floor(ca)) : 0,
    totalPlays: tp !== undefined ? Math.max(0, Math.floor(tp)) : 0,
    games: g,
    achievements,
    seen,
    customPuzzleId,
    dailyLimitMin,
    screen,
    days,
  };
}

// 임의의 객체를 v2 스키마로 안전하게 정규화(자가 치유 + v1→v2 마이그레이션 핵심).
// getState/importState/selfHeal 이 공유. 저장소를 건드리지 않는 순수 함수.
function normalizeState(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return freshState();

  // (1) v2: profiles 배열(또는 손상으로 객체화된 배열 {"0":..,"1":..})을 복구·정규화
  let profilesArr = null;
  if (Array.isArray(obj.profiles)) profilesArr = obj.profiles;
  else if (obj.profiles && typeof obj.profiles === 'object') profilesArr = Object.values(obj.profiles); // 배열이 객체로 뭉개진 손상 복구(데이터 보존)
  if (profilesArr) {
    // null/문자열/숫자 등 깨진 엔트리는 버린다(유령 프로필 생성 방지) → 진짜 객체만 정규화
    const profiles = profilesArr.filter((p) => p && typeof p === 'object' && !Array.isArray(p)).map(normProfile);
    // id 중복 방어(손상 데이터): 충돌 시 새 id 부여
    const ids = new Set();
    for (const p of profiles) {
      if (ids.has(p.id)) p.id = genId();
      ids.add(p.id);
    }
    let activeProfileId = (typeof obj.activeProfileId === 'string') ? obj.activeProfileId : null;
    if (!profiles.some((p) => p.id === activeProfileId)) activeProfileId = null; // 가리키는 프로필이 없으면 무효화(선택 화면 유도)
    const ua = num(obj.updatedAt);
    return {
      version: 2,
      activeProfileId,
      profiles,
      updatedAt: ua !== undefined ? Math.max(0, Math.floor(ua)) : 0,
    };
  }

  // (2) v1 단일 프로필 → 자동으로 '기본 프로필' 하나로 변환(마이그레이션, 데이터 보존)
  const looksV1 =
    (obj.games && typeof obj.games === 'object' && !Array.isArray(obj.games)) ||
    obj.totalPlays !== undefined ||
    obj.achievements !== undefined ||
    (obj.profile && typeof obj.profile === 'object');
  if (looksV1) {
    const legacy = (obj.profile && typeof obj.profile === 'object' && !Array.isArray(obj.profile)) ? obj.profile : {};
    const prof = normProfile({
      id: MIGRATED_PROFILE_ID, // 결정적 id → 저장 전 재마이그레이션에도 activeProfileId 일관
      name: DEFAULT_NAME,
      avatar: legacy.avatar,
      themeColor: legacy.themeColor,
      createdAt: num(obj.updatedAt) || Date.now(), // v1 updatedAt 이 0/없음이면 '지금'을 생성 시각으로
      totalPlays: obj.totalPlays,
      games: obj.games,
      achievements: obj.achievements,
      seen: obj.seen,
    });
    const ua = num(obj.updatedAt);
    return {
      version: 2,
      activeProfileId: prof.id,
      profiles: [prof],
      updatedAt: ua !== undefined ? Math.max(0, Math.floor(ua)) : 0,
    };
  }

  // (3) 알 수 없는/빈 객체 → 빈 v2(프로필 선택 화면 유도)
  return freshState();
}

export function getState() {
  const raw = _read();
  if (!raw) return freshState();
  try { return normalizeState(JSON.parse(raw)); } catch (e) { return freshState(); }
}

// 로컬 변경 저장: 항상 즉시 localStorage 에 기록(Offline First) + 변경 시각 갱신 + 백그라운드 동기화 예약.
function saveState(s) {
  s.updatedAt = Date.now();
  _write(JSON.stringify(s));
  scheduleSync(); // 브라우저·온라인일 때만 디바운스 푸시(Node·오프라인이면 안전 no-op)
}

// ---------- 프로필 해결(active) 헬퍼 ----------
function _activeIndex(s) {
  if (!s || !s.activeProfileId || !Array.isArray(s.profiles)) return -1;
  return s.profiles.findIndex((p) => p && p.id === s.activeProfileId);
}
// 쓰기용: 활성 프로필 보장(없으면 기본 프로필을 만들어 활성화 → 데이터 유실 방지)
function _ensureActive(s) {
  const i = _activeIndex(s);
  if (i !== -1) return s.profiles[i];
  if (!Array.isArray(s.profiles)) s.profiles = [];
  if (s.profiles.length) { s.activeProfileId = s.profiles[0].id; return s.profiles[0]; }
  const p = freshProfile({ name: DEFAULT_NAME });
  s.profiles.push(p);
  s.activeProfileId = p.id;
  return p;
}
// 조회용: 프로필 찾기(없으면 null). profileId 미지정이면 활성 프로필.
function _findProfile(s, profileId) {
  if (!Array.isArray(s.profiles)) return null;
  if (profileId) return s.profiles.find((p) => p && p.id === profileId) || null;
  const i = _activeIndex(s);
  return i !== -1 ? s.profiles[i] : null;
}
// 조회용(저장 안 함): 프로필이 없으면 '빈 프로필'을 임시로 돌려 0 통계를 안전히 표시.
function _readProfile(s, profileId) {
  return _findProfile(s, profileId) || freshProfile({ name: DEFAULT_NAME });
}
function _unlockedCount(p) {
  return ACHIEVEMENTS.filter((a) => p.achievements && p.achievements[a.id]).length;
}

// ---------- 핵심 API ----------
/**
 * 한 판이 끝났을 때 호출. '현재 활성 프로필' 하위에 최고 기록 갱신 + 업적 판정 + 저장까지 처리.
 * 활성 프로필이 없으면 기본 프로필을 만들어 거기에 기록한다(데이터 유실 방지).
 * @param {'memory'|'popnpop'|'dodge'|'maze'|'spot'|'puzzle'|string} gameId  (GAME_IDS, 새 게임은 자동 등록)
 * @param {{score?:number, timeMs?:number, level?:number, stars?:number, stage?:number, mode?:string, noHintLevel?:number}} result
 * @returns {{ ok:boolean, stats?:object, newlyUnlocked:Array, state?:object }}
 */
export function recordPlay(gameId, result = {}) {
  if (!gameId || typeof gameId !== 'string') return { ok: false, newlyUnlocked: [] };
  const s = getState();
  // 활성 프로필이 없는데 프로필은 존재(아직 '누가 놀까요?'에서 선택 전)하면, 엉뚱한 프로필(첫 번째)에
  // 잘못 적재하지 않도록 기록을 보류한다. 프로필이 하나도 없을 때만 _ensureActive 가 기본 프로필을
  // 만들어 기록한다(직접 게임 진입/유닛테스트 대비 — 데이터 유실 방지).
  if (_activeIndex(s) === -1 && Array.isArray(s.profiles) && s.profiles.length > 0) {
    return { ok: false, newlyUnlocked: [] };
  }
  const prof = _ensureActive(s);
  let g = prof.games[gameId];
  if (!g) g = prof.games[gameId] = freshGame(); // 새 게임도 첫 기록 시 자동 등록(확장성)

  prof.totalPlays += 1;
  g.plays += 1;
  g.lastPlayed = Date.now();

  // 일자별 플레이 횟수 누적(잔디 활동 캘린더용). 오래된 날짜는 잘라 무한 성장 방지.
  if (!prof.days || typeof prof.days !== 'object' || Array.isArray(prof.days)) prof.days = {};
  const today = dayKey(Date.now());
  prof.days[today] = (Number(prof.days[today]) || 0) + 1;
  const dayKeys = Object.keys(prof.days);
  if (dayKeys.length > 370) {
    for (const k of dayKeys.sort().slice(0, dayKeys.length - 370)) delete prof.days[k];
  }

  const fin = (v) => typeof v === 'number' && Number.isFinite(v);
  if (fin(result.score) && result.score >= 0) {
    g.bestScore = (g.bestScore == null) ? result.score : Math.max(g.bestScore, result.score);
  }
  if (fin(result.timeMs) && result.timeMs > 0) {
    g.bestTimeMs = (g.bestTimeMs == null) ? result.timeMs : Math.min(g.bestTimeMs, result.timeMs);
  }
  if (fin(result.level) && result.level >= 0) g.meta.bestLevel = Math.max(Number(g.meta.bestLevel) || 0, result.level);
  if (fin(result.stars) && result.stars >= 0) g.meta.bestStars = Math.max(Number(g.meta.bestStars) || 0, result.stars);
  if (fin(result.stage) && result.stage >= 0) g.meta.bestStage = Math.max(Number(g.meta.bestStage) || 0, result.stage);
  // noHintLevel: 힌트 없이 클리어한 최고 난이도(틀린그림찾기 '돋보기 탐정' 업적용)
  if (fin(result.noHintLevel) && result.noHintLevel >= 0) g.meta.noHintLevel = Math.max(Number(g.meta.noHintLevel) || 0, result.noHintLevel);
  if (result.mode) g.meta.lastMode = String(result.mode);

  // 난이도별 최단 시간(시간형 게임: timeMs + level 을 함께 넘긴 경우 = memory)
  if (fin(result.timeMs) && result.timeMs > 0 && fin(result.level) && result.level >= 0) {
    if (!g.meta.bestTimeByLevel || typeof g.meta.bestTimeByLevel !== 'object') g.meta.bestTimeByLevel = {};
    const key = String(Math.floor(result.level));
    const prev = Number(g.meta.bestTimeByLevel[key]);
    g.meta.bestTimeByLevel[key] = Number.isFinite(prev) ? Math.min(prev, result.timeMs) : result.timeMs;
  }

  const newlyUnlocked = [];
  for (const a of ACHIEVEMENTS) {
    if (!prof.achievements[a.id] && safeTest(a, prof)) {
      prof.achievements[a.id] = { unlockedAt: Date.now() };
      newlyUnlocked.push({ id: a.id, icon: a.icon, title: a.title, desc: a.desc });
    }
  }

  saveState(s);
  // 새 칭찬 도장이 해금되는 순간 → 화면 전체 폭죽으로 시각적 보상(브라우저에서만, Node 안전 no-op)
  if (newlyUnlocked.length) { try { celebrate(); } catch (e) {} }
  return { ok: true, stats: { ...g }, newlyUnlocked, state: s };
}

function safeTest(a, prof) { try { return !!a.test(prof); } catch (e) { return false; } }

// ---------- 조회 헬퍼 (profileId 미지정 시 활성 프로필) ----------
export function getGameStats(gameId, profileId) {
  return _readProfile(getState(), profileId).games[gameId] || freshGame();
}

export function getAchievements(profileId) {
  const p = _readProfile(getState(), profileId);
  const seen = p.seen || {};
  return ACHIEVEMENTS.map((a) => {
    const rec = p.achievements[a.id];
    return {
      id: a.id, icon: a.icon, title: a.title, desc: a.desc, color: a.color,
      unlocked: !!rec,
      unlockedAt: rec ? rec.unlockedAt : null,
      // 해금됐지만 아직 모달에서 본 적 없는 도장 = '새 도장'(연출 대상). 타이밍 비의존.
      isNew: !!rec && !seen[a.id],
    };
  });
}
export function getUnlockedCount(profileId) {
  return _unlockedCount(_readProfile(getState(), profileId));
}
export function getTotalAchievements() { return ACHIEVEMENTS.length; }

/** 해당 프로필(미지정 시 활성)의 해금된 도장을 모두 '본 것'으로 표시. */
export function markAchievementsViewed(profileId) {
  const s = getState();
  const p = _findProfile(s, profileId);
  if (!p) return;
  for (const id of Object.keys(p.achievements)) p.seen[id] = true;
  saveState(s);
}

/**
 * 부모님 대시보드용 집계 데이터(프로필 단위). profileId 미지정 시 활성 프로필.
 * @returns {{ totalPlays, perGame, favoriteId, games, achievements:{unlocked,total}, profile:{id,name,avatar,themeColor} }}
 */
// 로컬 날짜(YYYY-MM-DD). 활동 캘린더/스크린타임은 '아이의 하루' 기준이라 로컬 시간으로 끊는다.
export function dayKey(ms) {
  const d = (ms == null) ? new Date() : new Date(ms);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const da = String(d.getDate()).padStart(2, '0');
  return y + '-' + m + '-' + da;
}

// 순수 함수: days({'YYYY-MM-DD':count}) → 잔디 캘린더 격자. 오늘(todayKey, 기본=오늘) 포함 weeks 주.
// 반환: { weeks:[[{date,count,level}]], maxCount, totalDays, activeDays } (level 0~4: CSS 색 단계)
export function buildActivityCalendar(days, todayKey, weeks) {
  const map = (days && typeof days === 'object' && !Array.isArray(days)) ? days : {};
  const W = (Number.isFinite(weeks) && weeks > 0) ? Math.floor(weeks) : 12;
  const today = (typeof todayKey === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(todayKey)) ? todayKey : dayKey();
  // today 기준으로 이번 주 일요일까지 채워 7×W 격자를 만든다(맨 끝 칸 = 오늘)
  const base = new Date(today + 'T00:00:00');
  const dow = base.getDay();                 // 0(일)~6(토)
  const totalCells = W * 7;
  const start = new Date(base);
  start.setDate(base.getDate() - (totalCells - 1 - (6 - dow))); // 격자 마지막 열이 '오늘이 속한 주'가 되도록
  const cells = [];
  let maxCount = 0, activeDays = 0;
  for (let i = 0; i < totalCells; i++) {
    const dt = new Date(start);
    dt.setDate(start.getDate() + i);
    const key = dayKey(dt.getTime());
    const future = key > today; // 오늘 이후 칸은 비활성
    const count = future ? 0 : Math.max(0, Number(map[key]) || 0); // 미래 칸은 통계(maxCount/activeDays)에서 제외
    if (count > maxCount) maxCount = count;
    if (count > 0) activeDays++;
    cells.push({ date: key, count, future });
  }
  // level: 0(없음)~4. 1~3판 저강도, 많을수록 진하게(최댓값 기준 4분위).
  for (const c of cells) {
    if (c.future || c.count === 0) { c.level = 0; continue; }
    if (maxCount <= 1) { c.level = 2; continue; }
    const r = c.count / maxCount;
    c.level = r > 0.75 ? 4 : r > 0.5 ? 3 : r > 0.25 ? 2 : 1;
  }
  const weeksArr = [];
  for (let w = 0; w < W; w++) weeksArr.push(cells.slice(w * 7, w * 7 + 7));
  return { weeks: weeksArr, maxCount, totalDays: totalCells, activeDays };
}

// 순수 함수: 오늘의 '스크린타임 대비 플레이 효율'. 플레이 1판당 분(낮을수록 알차게 많이 놂) +
// 분당 플레이수 + 0~100 점수(친근한 게이지용). 화면시간 0 이면 효율 계산 보류(null).
export function playEfficiency(todayPlays, usedSec) {
  const plays = Math.max(0, Math.floor(Number(todayPlays) || 0));
  const sec = Math.max(0, Math.floor(Number(usedSec) || 0));
  const minutes = sec / 60;
  if (sec === 0 || plays === 0) {
    return { plays, minutes: Math.round(minutes * 10) / 10, perPlayMin: null, playsPerMin: 0, score: 0 };
  }
  const perPlayMin = minutes / plays;              // 한 판에 평균 몇 분
  const playsPerMin = plays / minutes;             // 분당 몇 판
  // 점수: 분당 0.5판(=2분/판)을 기준 100% 로, 0~100 클램프(아이 게임 1판 평균 1~3분 가정)
  const score = Math.max(0, Math.min(100, Math.round(playsPerMin / 0.5 * 100)));
  return {
    plays,
    minutes: Math.round(minutes * 10) / 10,
    perPlayMin: Math.round(perPlayMin * 10) / 10,
    playsPerMin: Math.round(playsPerMin * 100) / 100,
    score,
  };
}

export function getDashboard(profileId) {
  const p = _readProfile(getState(), profileId);
  const total = p.totalPlays || 0;
  const perGame = GAME_IDS.map((id) => {
    const g = p.games[id] || freshGame();
    return {
      id,
      icon: GAMES[id] ? GAMES[id].icon : '🎮',
      title: GAMES[id] ? GAMES[id].title : id,
      plays: g.plays,
      pct: 0,
    };
  });
  // largest-remainder 반올림 → 막대 비율 합이 정확히 100% (반올림 누적 오차 제거)
  if (total > 0) {
    const raw = perGame.map((pg) => (pg.plays / total) * 100);
    const floors = raw.map((x) => Math.floor(x));
    perGame.forEach((pg, i) => { pg.pct = floors[i]; });
    let rem = 100 - floors.reduce((a, b) => a + b, 0);
    const order = raw
      .map((x, i) => ({ i, frac: x - Math.floor(x) }))
      .sort((a, b) => b.frac - a.frac);
    for (let k = 0; k < order.length && rem > 0; k++) { perGame[order[k].i].pct += 1; rem--; }
  }
  let favoriteId = null, max = 0;
  for (const pg of perGame) { if (pg.plays > max) { max = pg.plays; favoriteId = pg.id; } }

  // 좋아하는 게임 랭킹(플레이 횟수 desc, 0판 제외). 동률은 GAME_IDS 순서 유지(안정 정렬).
  const ranking = perGame.filter((pg) => pg.plays > 0).slice().sort((a, b) => b.plays - a.plays);
  // 오늘 기록 + 스크린타임 효율
  const today = dayKey();
  const days = (p.days && typeof p.days === 'object' && !Array.isArray(p.days)) ? p.days : {};
  const todayPlays = Math.max(0, Number(days[today]) || 0);
  const todayUsedSec = (p.screen && p.screen.date === today) ? Math.max(0, Number(p.screen.usedSec) || 0) : 0;

  return {
    totalPlays: total,
    perGame,
    favoriteId,
    ranking,
    games: p.games,
    achievements: { unlocked: _unlockedCount(p), total: ACHIEVEMENTS.length },
    profile: { id: p.id, name: p.name, avatar: p.avatar, themeColor: p.themeColor },
    days,
    today,
    todayPlays,
    todayUsedSec,
    efficiency: playEfficiency(todayPlays, todayUsedSec),
  };
}

// ---------- 다중 프로필 관리 ----------
/** 현재 활성 프로필 id. 가리키는 프로필이 없으면 null(런처가 선택 화면을 띄움). */
export function getActiveProfileId() {
  const s = getState();
  return _activeIndex(s) !== -1 ? s.activeProfileId : null;
}
/** 현재 활성 프로필 객체(없으면 null). */
export function getActiveProfile() {
  const s = getState();
  const i = _activeIndex(s);
  return i !== -1 ? s.profiles[i] : null;
}
/** 모든 프로필의 요약(선택 화면·부모님 방 탭용). 기록 자체는 포함하지 않음(경량). */
export function getProfiles() {
  const s = getState();
  return s.profiles.map((p) => ({
    id: p.id,
    name: p.name,
    avatar: p.avatar,
    themeColor: p.themeColor,
    createdAt: p.createdAt,
    totalPlays: p.totalPlays,
    unlocked: _unlockedCount(p),
    totalAchievements: ACHIEVEMENTS.length,
    isActive: p.id === s.activeProfileId,
  }));
}
/** 활성 프로필 전환. 존재하면 전환 후 저장, 요약 반환. 없으면 null. */
export function setActiveProfile(id) {
  const s = getState();
  const p = s.profiles.find((x) => x && x.id === id);
  if (!p) return null;
  s.activeProfileId = p.id;
  saveState(s);
  return { id: p.id, name: p.name, avatar: p.avatar, themeColor: p.themeColor };
}
/**
 * 새 프로필 생성. 기본적으로 생성 즉시 활성화(activate=true).
 * @returns 생성된 프로필 요약 {id,name,avatar,themeColor}
 */
export function createProfile(opts = {}, ctrl = {}) {
  const activate = ctrl.activate !== false;
  const s = getState();
  const name = (opts && typeof opts.name === 'string' && opts.name.trim()) ? opts.name.trim().slice(0, 24) : `친구 ${s.profiles.length + 1}`;
  const p = freshProfile({ name, avatar: opts.avatar, themeColor: opts.themeColor });
  s.profiles.push(p);
  if (activate || !s.activeProfileId) s.activeProfileId = p.id;
  saveState(s);
  return { id: p.id, name: p.name, avatar: p.avatar, themeColor: p.themeColor };
}
/** 프로필의 이름/아바타/테마색 수정(허용값만). */
export function updateProfile(id, partial = {}) {
  const s = getState();
  const p = s.profiles.find((x) => x && x.id === id);
  if (!p) return null;
  if (partial && typeof partial === 'object') {
    if (typeof partial.name === 'string' && partial.name.trim()) p.name = partial.name.trim().slice(0, 24);
    if (AVATAR_SET.has(partial.avatar)) p.avatar = partial.avatar;
    if (THEME_SET.has(partial.themeColor)) p.themeColor = partial.themeColor;
  }
  saveState(s);
  return { id: p.id, name: p.name, avatar: p.avatar, themeColor: p.themeColor };
}
/** 프로필 삭제. 활성 프로필이었다면 남은 첫 프로필(없으면 null)로 활성 전환. */
export function deleteProfile(id) {
  const s = getState();
  const idx = s.profiles.findIndex((x) => x && x.id === id);
  if (idx === -1) return { ok: false };
  const removedPhotoId = s.profiles[idx].customPuzzleId; // 커스텀 사진(IndexedDB) 고아 방지용
  s.profiles.splice(idx, 1);
  if (s.activeProfileId === id) s.activeProfileId = s.profiles.length ? s.profiles[0].id : null;
  saveState(s);
  // 삭제된 프로필의 커스텀 사진도 IndexedDB 에서 정리(브라우저 전용·Node 안전).
  // 스토어를 photos 모듈에 정적 결합하지 않도록 동적 import 로 분리.
  if (removedPhotoId) { import('./fmk-photos.js').then((m) => m.deletePhoto(removedPhotoId)).catch(() => {}); }
  return { ok: true, remaining: s.profiles.length, activeProfileId: s.activeProfileId };
}
/** 특정 프로필의 기록만 초기화(이름/아바타/테마색 등 정체성은 보존). */
export function resetProfile(id) {
  const s = getState();
  const p = s.profiles.find((x) => x && x.id === id);
  if (!p) return false;
  p.totalPlays = 0;
  p.games = freshGames();
  p.achievements = {};
  p.seen = {};
  saveState(s);
  return true;
}

// ---------- 커스텀 퍼즐(가족 사진) ----------
// 실제 사진은 IndexedDB(fmk-photos)에 두고, 여기엔 그 id 만 보관.
export function setCustomPuzzleId(profileId, photoId) {
  const s = getState();
  const p = profileId ? s.profiles.find((x) => x && x.id === profileId) : _findProfile(s);
  if (!p) return null;
  p.customPuzzleId = (typeof photoId === 'string' && photoId.trim()) ? photoId.trim().slice(0, 80) : null;
  saveState(s);
  return p.customPuzzleId;
}
export function getCustomPuzzleId(profileId) {
  return _readProfile(getState(), profileId).customPuzzleId || null;
}

// ---------- 건강한 플레이 타임(스크린 타임) ----------
// 로컬 '오늘' 날짜 문자열(YYYY-MM-DD). 날짜가 바뀌면 당일 누적이 자동 리셋된다.
function _todayStr() {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}
function _todayUsed(p) {
  if (!p || !p.screen || p.screen.date !== _todayStr()) return 0; // 다른 날짜의 기록은 0(리셋)
  return p.screen.usedSec || 0;
}
/** 일일 제한(분) 설정. 0/falsy = 제한 없음. */
export function setDailyLimit(profileId, minutes) {
  const s = getState();
  const p = profileId ? s.profiles.find((x) => x && x.id === profileId) : _findProfile(s);
  if (!p) return null;
  const m = num(minutes);
  p.dailyLimitMin = (m !== undefined && m > 0) ? Math.floor(m) : null;
  saveState(s);
  return p.dailyLimitMin;
}
export function getDailyLimit(profileId) {
  return _readProfile(getState(), profileId).dailyLimitMin || null;
}
export function getUsageToday(profileId) {
  return _todayUsed(_readProfile(getState(), profileId));
}
/** 당일 사용량(초) 누적. 날짜가 바뀌었으면 먼저 리셋. (활성 프로필 기본) */
export function addUsageToday(sec, profileId) {
  const add = num(sec);
  if (add === undefined || add <= 0) return;
  const s = getState();
  const p = profileId ? s.profiles.find((x) => x && x.id === profileId) : _findProfile(s);
  if (!p) return;
  const today = _todayStr();
  if (!p.screen || p.screen.date !== today) p.screen = { date: today, usedSec: 0 };
  p.screen.usedSec = Math.floor((p.screen.usedSec || 0) + add);
  saveState(s);
}
/** 오늘 제한을 초과했는가(제한 없음이면 항상 false). */
export function isOverLimit(profileId) {
  const p = _readProfile(getState(), profileId);
  const lim = p.dailyLimitMin;
  if (!lim || lim <= 0) return false;
  return _todayUsed(p) >= lim * 60;
}
/** 화면용 종합 정보. */
export function getScreenInfo(profileId) {
  const p = _readProfile(getState(), profileId);
  const lim = p.dailyLimitMin || null;
  const used = _todayUsed(p);
  const limitSec = lim ? lim * 60 : null;
  return {
    limitMin: lim,
    usedSec: used,
    limitSec,
    remainingSec: (limitSec != null) ? Math.max(0, limitSec - used) : null,
    locked: (limitSec != null) && used >= limitSec,
  };
}

/** 활성 프로필의 모든 기록 초기화(부모용). 정체성(이름·아바타·테마색)은 보존. */
export function resetAll() {
  const s = getState();
  const p = _ensureActive(s); // 활성 프로필 보장 후
  p.totalPlays = 0;
  p.games = freshGames();
  p.achievements = {};
  p.seen = {};
  saveState(s); // 즉시 저장 + 동기화 예약(다른 기기에도 전파)
}

// ---------- 내 프로필(활성 프로필의 아바타/테마색/이름) ----------
// 런처의 '🎨 내 프로필' 모달은 '현재 플레이 중인 아이'의 꾸미기를 다룬다.
export function getProfile() {
  const p = getActiveProfile();
  if (!p) return { avatar: null, themeColor: null, name: null, id: null };
  return { avatar: p.avatar, themeColor: p.themeColor, name: p.name, id: p.id };
}
export function setProfile(partial) {
  const s = getState();
  const p = _ensureActive(s);
  if (partial && typeof partial === 'object') {
    if (AVATAR_SET.has(partial.avatar)) p.avatar = partial.avatar;
    if (THEME_SET.has(partial.themeColor)) p.themeColor = partial.themeColor;
    if (typeof partial.name === 'string' && partial.name.trim()) p.name = partial.name.trim().slice(0, 24);
  }
  saveState(s);
  return { avatar: p.avatar, themeColor: p.themeColor, name: p.name, id: p.id };
}

/**
 * 데이터 자가 치유. 크래시/시작 시 호출 가능.
 * - 파싱 가능: 정규화/마이그레이션된 상태로 재저장(부분 손상 정화, 데이터 파괴 X)
 * - 파싱 불가: 원본을 백업 키(fmk:v1:corrupt-backup)에 보존 후 안전 기본값으로 복구
 */
export function selfHeal() {
  const raw = _read();
  if (!raw) { _write(JSON.stringify(freshState())); return { ok: true, mode: 'init' }; }
  try {
    const obj = JSON.parse(raw);
    saveState(normalizeState(obj)); // 유효 필드는 보존, 손상 필드만 정화(+ v1→v2 마이그레이션)
    return { ok: true, mode: 'normalized' };
  } catch (e) {
    try { const ls = _ls(); if (ls) ls.setItem(KEY + ':corrupt-backup', raw); } catch (_) {}
    _write(JSON.stringify(freshState()));
    return { ok: true, mode: 'reset', backedUp: true };
  }
}

/** 현재 기록을 보기 좋은 JSON 문자열로 내보내기(백업 다운로드용). */
export function exportState() { return JSON.stringify(getState(), null, 2); }

/**
 * 백업 JSON 문자열을 검증 후 복구(가져오기). v2(profiles) 또는 v1(games) 백업 모두 허용.
 * 우리 형식이 아니면 차단하고 사유를 반환 — 손상 파일은 적용하지 않는다.
 * @returns {{ ok:boolean, reason?:string, state?:object }}
 */
export function importState(text) {
  let obj;
  try { obj = JSON.parse(text); } catch (e) { return { ok: false, reason: 'JSON 형식이 아니에요' }; }
  const isObj = obj && typeof obj === 'object' && !Array.isArray(obj);
  const hasProfiles = isObj && Array.isArray(obj.profiles);
  const hasV1Games = isObj && obj.games && typeof obj.games === 'object' && !Array.isArray(obj.games);
  if (!isObj || (!hasProfiles && !hasV1Games)) {
    return { ok: false, reason: 'ForMyKids 백업 파일이 아니에요' };
  }
  const normalized = normalizeState(obj); // v1 백업이면 자동 마이그레이션
  saveState(normalized);
  return { ok: true, state: normalized };
}

/* ===================================================================
   클라우드 동기화 (Offline First / v1.1.0)
   - 원칙: 로컬스토리지가 항상 진실의 원천. 저장은 위 saveState 가 '즉시' 로컬에 기록.
   - 여기서는 '온라인일 때만' 백그라운드로 백엔드(/api/sync)와 머지/푸시한다.
   - 머지 전략: 마지막 변경 시각(updatedAt) 기준 Last-Writer-Wins(payload 통째 = 전 프로필).
   - 모든 함수는 브라우저 전용 가드(typeof window/fetch) → Node 유닛테스트에서 안전 no-op.
   =================================================================== */
const SYNC_URL = '/api/sync';   // Nginx 가 /api → backend 로 프록시(같은 오리진)
const SYNC_TIMEOUT_MS = 8000;   // 여행지 약한 네트워크에서 fetch 가 무한 대기하지 않도록 타임아웃
let _syncTimer = null;
let _dirty = false;             // 푸시 대기 중인 로컬 변경 존재 여부(인메모리 빠른 플래그)
let _onlineHooked = false;
let _syncStatus = 'offline';    // 'online' | 'offline' | 'syncing'
let _statusCb = null;

/** 현재 동기화 상태('online'|'offline'|'syncing'). UI 배지에서 사용. */
export function getSyncStatus() { return _syncStatus; }

function _setStatus(st) {
  if (st === _syncStatus) return;
  _syncStatus = st;
  if (_statusCb) { try { _statusCb(st); } catch (e) {} }
}

function _isOnline() {
  if (typeof navigator === 'undefined') return false; // Node → 동기화 비활성
  return navigator.onLine !== false;                  // onLine 미지원이면 낙관적으로 시도
}

let _sessionDeviceId = null; // 저장소가 막힌 환경용 '세션 한정' id(전역 공유 'anon' 금지)
function _deviceId() {
  try {
    const ls = (typeof localStorage !== 'undefined') ? localStorage : null;
    if (ls) {
      let id = ls.getItem('fmk-device-id');
      if (!id) { id = 'fmk-' + Date.now().toString(36) + '-' + Math.floor(Math.random() * 1e9).toString(36); ls.setItem('fmk-device-id', id); }
      return id;
    }
  } catch (e) {}
  // 저장소 사용 불가/예외(사생활 모드·차단 등) → 기기별 영속 id 를 못 만든다.
  // 전역 상수('anon')를 쓰면 그런 기기들이 같은 서버 행(fmk_users.id)을 공유해 서로의 데이터를
  // LWW 로 덮어쓴다. → '세션 한정 임의 id'로 격리(같은 페이지 로드 내에서만 일관, 기기 간 충돌 없음).
  if (!_sessionDeviceId) _sessionDeviceId = 'fmk-s-' + Date.now().toString(36) + '-' + Math.floor(Math.random() * 1e9).toString(36);
  return _sessionDeviceId;
}

// 첫 변경/동기화 시 1회만 online/offline 리스너 등록(브라우저 전용).
function _ensureOnlineHook() {
  if (_onlineHooked || typeof window === 'undefined' || !window.addEventListener) return;
  _onlineHooked = true;
  // 온라인 복귀 → 영속 큐(여행 모드)부터 비우고, 인메모리 대기 변경도 올린다.
  window.addEventListener('online', () => {
    _setStatus('syncing');
    if (_syncTimer) { clearTimeout(_syncTimer); _syncTimer = null; } // 디바운스 푸시와 드레인이 같은 payload 를 중복 전송하지 않도록
    _drainQueue().then((res) => { if (!(res && (res.sent || res.reason === 'busy'))) _flush(); });
  });
  window.addEventListener('offline', () => _setStatus('offline'));
}

// fetch 타임아웃(AbortController). 미지원 환경에선 일반 fetch 로 폴백.
function _fetchWithTimeout(url, opts = {}) {
  if (typeof AbortController === 'undefined') return fetch(url, opts);
  const ctrl = new AbortController();
  const t = setTimeout(() => { try { ctrl.abort(); } catch (e) {} }, SYNC_TIMEOUT_MS);
  return fetch(url, Object.assign({}, opts, { signal: ctrl.signal })).finally(() => clearTimeout(t));
}

// 주어진 payload 를 백엔드로 1회 POST(성공 true/실패 false). 타임아웃·네트워크 오류는 false.
async function _postPayload(payload) {
  if (typeof fetch === 'undefined') return false;
  try {
    const res = await _fetchWithTimeout(SYNC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: _deviceId(), updatedAt: (payload && payload.updatedAt) || 0, payload }),
    });
    return !!(res && res.ok);
  } catch (e) { return false; } // 타임아웃(abort)·네트워크 오류 → 실패
}

// 단일 전송 게이트: 어떤 경로(_pushRemote / 드레인)든 동시에 두 번 POST 하지 않게 막는다(중복 전송 방지).
// 반환: true=성공, false=실패, 'skip'=이미 전송 중(호출측은 아무 것도 하지 않음 — 진행 중 전송이 같은 데이터를 처리).
let _posting = false;
async function _send(payload) {
  if (_posting) return 'skip';
  _posting = true;
  try { return await _postPayload(payload); }
  finally { _posting = false; }
}

// 보낼 변경을 IndexedDB 에 영속 저장(여행 모드). 전체-payload LWW 라 '최신 하나'만 유지(무한 증가 방지).
function _persistPending(s) {
  try {
    const rec = { id: _deviceId(), updatedAt: (s && s.updatedAt) || 0, payload: s, queuedAt: Date.now() };
    Promise.resolve(clearQueue()).then(() => enqueue(rec)).catch(() => {}); // 비우고 1건만 추가
  } catch (e) {}
}

// 영속 큐 드레인: 큐가 비어있지 않으면 '현재 최신 상태(getState)'를 한 번 전송(bulk)하고, 성공 시 큐를 비운다.
// 동시 드레인은 큐 모듈의 _draining 가드가, 동시 POST 는 _send 게이트가 막는다.
function _drainQueue() {
  if (typeof window === 'undefined') return Promise.resolve({ sent: false, reason: 'node' });
  if (!_isOnline()) { _setStatus('offline'); return Promise.resolve({ sent: false, reason: 'offline' }); }
  return drainQueue({
    list: listQueue,
    send: async () => {
      const r = await _send(getState()); // freshest. 'skip'=다른 전송 진행 중
      if (r === true) { _dirty = false; _setStatus('online'); return true; }
      if (r === 'skip') return false;     // 진행 중 → 이번 드레인은 큐 유지(다음 기회)
      _setStatus('offline');
      return false;
    },
    clearAll: clearQueue,
  });
}

// saveState 가 호출 → 디바운스 후 푸시. 오프라인이면 IndexedDB 큐에 영속 저장(여행 모드).
function scheduleSync() {
  if (typeof window === 'undefined') return;     // Node 안전(유닛테스트 무영향)
  _ensureOnlineHook();
  _dirty = true;
  if (!_isOnline()) {
    _setStatus('offline');
    _persistPending(getState()); // 오프라인 → 큐에 영속 저장(새로고침/종료에도 살아남음 → 온라인 복귀 시 전송)
    return;
  }
  if (_syncTimer) clearTimeout(_syncTimer);
  _syncTimer = setTimeout(_pushRemote, 1500);    // 연속 변경을 한 번으로 합치는 디바운스
}

// 로컬 전체 payload(전 프로필) 를 백엔드로 업로드(POST). 실패 시 IndexedDB 큐에 영속 저장. (동시 POST 는 _send 가 차단)
async function _pushRemote() {
  if (typeof fetch === 'undefined' || !_isOnline()) { _setStatus('offline'); return; }
  _syncTimer = null; // 디바운스 타이머 소진
  const s = getState();
  const r = await _send(s); // true|false|'skip'
  if (r === 'skip') return; // 다른 전송이 진행 중 → 그쪽이 같은 데이터를 처리(중복 방지)
  if (r === true) {
    _dirty = false;
    _setStatus('online');
    try { await clearQueue(); } catch (e) {} // 성공 → 영속 큐도 비움
  } else {
    _setStatus('offline');
    _persistPending(s); // 실패(타임아웃 등) → 큐에 영속 저장(다음 기회 재시도)
  }
}

// 백엔드에서 최신 payload 를 받아(GET) 원격이 더 최신이면 로컬에 '채택'(타임스탬프 보존, 재푸시 없음).
async function _pullRemote() {
  if (typeof fetch === 'undefined' || !_isOnline()) return false;
  try {
    const res = await fetch(SYNC_URL + '?id=' + encodeURIComponent(_deviceId()));
    if (!res || !res.ok) throw new Error('no remote');
    const data = await res.json();
    if (data && data.payload && typeof data.payload === 'object') {
      const remoteAt = Number(data.updatedAt || data.payload.updatedAt || 0);
      const localAt = Number(getState().updatedAt || 0);
      if (remoteAt > localAt) {
        const localActive = getState().activeProfileId; // 채택 전 이 기기가 보던 아이(기기 로컬 세션 상태)
        const adopted = normalizeState(data.payload);    // 원격 채택(+ v1 payload 면 자동 마이그레이션)
        // activeProfileId 는 '이 기기에서 지금 노는 아이'다 — 원격 값으로 덮으면 다른 기기 선택이 이 기기를 가로챈다.
        // 로컬 active 가 채택된 프로필 목록에 아직 있으면 보존(기록 자체는 머지된 payload 그대로 채택).
        if (localActive && adopted.profiles.some((p) => p.id === localActive)) adopted.activeProfileId = localActive;
        _write(JSON.stringify(adopted)); // saveState 거치지 않아 재푸시 루프 없음
        _dirty = false;
        return true; // 데이터가 바뀜(UI 갱신 필요)
      }
    }
    return false;
  } catch (e) { return false; }
}

// 동기화 큐 비우기: 대기 중 변경이 있으면 푸시.
function _flush() {
  if (typeof fetch === 'undefined' || !_isOnline()) { _setStatus('offline'); return; }
  if (_dirty) _pushRemote(); else _setStatus('online');
}

/**
 * 앱(런처) 시작 시 1회 호출. 온라인이면 원격과 화해(pull→필요 시 push) + 상태 리스너 설치.
 * Offline First: 오프라인이면 아무것도 받아오지 않고 로컬만 사용한다.
 * @param {{onStatus?:(st:string)=>void, onSync?:()=>void}} [opts]
 * @returns 현재 상태 문자열
 */
export function initSync(opts) {
  if (typeof window === 'undefined') return _syncStatus; // Node 안전
  if (opts && typeof opts.onStatus === 'function') _statusCb = opts.onStatus;
  _ensureOnlineHook();
  if (!_isOnline()) { _setStatus('offline'); return _syncStatus; }
  _setStatus('syncing');
  _pullRemote()
    .then((adopted) => {
      if (adopted && opts && typeof opts.onSync === 'function') { try { opts.onSync(); } catch (e) {} }
      // 새로고침 = 서버 접근 가능 시점 → 이전 세션에 쌓인 영속 큐(여행 모드)부터 비운다.
      return _drainQueue().then((res) => {
        // 큐로 안 보냈는데(빈 큐) 로컬이 최신(원격 미채택)이거나 대기 변경이 있으면 현재 상태를 올린다.
        if (!(res && res.sent) && (_dirty || !adopted)) return _pushRemote();
      });
    })
    .then(() => { _setStatus(_isOnline() ? 'online' : 'offline'); })
    .catch(() => _setStatus('offline'));
  return _syncStatus;
}
