# 🎀 ForMyKids — 7~8세를 위한 통합 게임 놀이터

파스텔톤 동화책(Storybook) 테마로 묶은 어린이 게임 플랫폼.
**하나의 Vite 멀티페이지 앱(MPA)** 이라서 `npm run build` 한 번이면 런처와 모든 게임이
함께 빌드되고, 게임끼리 React 같은 공통 코드는 자동으로 공유(코드 스플리팅)됩니다.

메인 화면(`index.html`)에서 큰 카드를 눌러 게임을 고르고, 모든 게임 좌상단의
**🏠 홈으로** 버튼으로 언제든 메인으로 돌아옵니다. 점수·기록·업적은
세 게임이 **하나의 localStorage 저장소**(`shared/fmk-store.js`)로 통합 관리됩니다.

## 🎮 게임

| 게임 | 폴더(페이지) | 설명 | 기술 |
|------|------|------|------|
| 🐾 짝꿍 친구 찾기 | `games/memory/` | 같은 카드를 찾는 기억력 놀이 (6단계) | React |
| 🎈 풍선 터트리기 | `games/popnpop/` | 글자/숫자를 따라 입력해 풍선을 터트림 | React + Tailwind + framer-motion |
| 🚀 우주선 똥 피하기 | `games/dodge/` | 좌우로 움직여 떨어지는 물건을 피하고 우주선을 진화 | Vanilla Canvas + rAF |

## ▶️ 실행

```bash
npm install        # 최초 1회 (node_modules 가 없을 때)
npm run build      # 한 번의 빌드 → dist/ 에 전체 플랫폼 생성
npm run preview    # http://localhost:8080/ 에서 빌드 결과 미리보기
```

- **가장 쉬운 방법 (macOS):** `serve.command` 더블클릭 → 빌드 후 브라우저가 자동으로 열립니다.
- **개발 모드(HMR):** `npm run dev` → 모든 페이지를 핫리로드로 개발. 새 게임 페이지도 즉시 반영.

> React 페이지는 ES 모듈을 쓰므로 `file://` 더블클릭이 아닌 **정적 서버**(preview/serve)로 열어야 합니다.

## 🏗️ 구조

```
ForMyKids/
├── index.html                # 런처(메인 화면) 페이지
├── vite.config.js            # MPA: games/<id>/index.html 을 빌드 입력으로 자동 수집
├── package.json              # 단일 프로젝트(모든 의존성 통합)
├── tailwind.config.js        # content 를 popnpop 으로 한정(다른 페이지에 영향 X)
├── postcss.config.js
├── src/
│   ├── games.config.js       # ★ 게임 레지스트리(런처 카드 표시 정보)
│   └── launcher/main.js      # 런처 로직(카드 동적 생성 + 기록/업적 표시)
├── shared/
│   ├── theme.css             # 공통 Storybook 테마(토큰 + 🏠 홈 버튼 등)
│   ├── fmk-store.js          # 공통 기록/업적 저장소(localStorage)
│   └── fmk-store.test.mjs    # 저장소 단위 테스트 (npm run test:store)
├── games/
│   ├── memory/   (index.html + src/)
│   ├── popnpop/  (index.html + src/)
│   └── dodge/    (index.html + dodge.js + dodge.css)
└── dist/                     # 한 번의 빌드 결과 (배포/실행 대상)
```

## ➕ 새 게임 추가하기 (페이지로 확장)

1. **페이지 폴더 생성:** `games/<id>/index.html` 을 만든다. (React든 순수 JS든 자유)
   - `vite.config.js` 가 `games/*/index.html` 을 자동으로 빌드 입력에 등록 → **설정 수정 불필요.**
   - 공통 테마는 `<link rel="stylesheet" href="../../shared/theme.css">` (순수 JS) 또는
     `import '../../../shared/theme.css'` (React) 로 적용.
   - 좌상단 홈 버튼: `<a class="fmk-home-btn" href="../../index.html">🏠</a>`.
2. **기록 연동(선택):** 게임 종료 시
   `import { recordPlay } from '../../shared/fmk-store.js'` 후
   `recordPlay('<id>', { score, timeMs, level, stars, stage, mode })` 호출.
3. **런처 카드 등록:** `src/games.config.js` 배열에 한 줄 추가
   (`id`, `title`, `sub`, `icon`, `floaters`, `c1`/`c2`/`ink` 색, `path`).

→ 다시 `npm run build` 하면 끝. 런처에 카드가 자동으로 나타나고 페이지가 함께 배포됩니다.

## 💾 통합 기록 데이터 (`shared/fmk-store.js`)

localStorage 키 **`fmk:v1`** 에 단일 JSON 으로 저장(버전 포함 → 마이그레이션 용이).
사생활 보호 모드/`file://` 등 localStorage 사용 불가 시 **메모리 폴백**으로 죽지 않습니다.

```jsonc
{
  "version": 1,
  "totalPlays": 12,
  "games": {
    "memory":  { "plays": 4, "bestScore": null, "bestTimeMs": 8000,
                 "lastPlayed": 0, "meta": { "bestStars": 3, "bestLevel": 5 } },
    "popnpop": { "plays": 5, "bestScore": 320, "bestTimeMs": null,
                 "lastPlayed": 0, "meta": { "bestLevel": 7, "lastMode": "ko" } },
    "dodge":   { "plays": 3, "bestScore": 250, "bestTimeMs": null,
                 "lastPlayed": 0, "meta": { "bestStage": 2 } }
  },
  "achievements": { "first-step": { "unlockedAt": 0 }, "explorer": { "unlockedAt": 0 } }
}
```

- **게임별 최고 기록:** 점수형(popnpop·dodge)은 `bestScore`(max), 시간형(memory)은 `bestTimeMs`(min).
- **누적 플레이 횟수:** 게임별 `plays`, 전체 `totalPlays`.
- **업적(칭찬 도장):** `recordPlay` 시 카탈로그(`ACHIEVEMENTS`)를 자동 평가해 획득.
  런처의 "🏆 모은 칭찬 도장" 칩을 누르면 전체 목록(획득/미획득)을 볼 수 있습니다.

API: `recordPlay(id, result)`, `getState()`, `getGameStats(id)`, `getAchievements()`,
`getUnlockedCount()`, `getTotalAchievements()`, `resetAll()`.
