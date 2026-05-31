# 🧩 퍼즐 이미지 폴더 (public/assets/puzzle/)

여기에 **캐릭터 퍼즐 이미지**를 넣으면 게임에 자동으로 나타납니다.

## 넣는 방법
1. 정사각형에 가까운 이미지를 아래 파일명으로 저장하세요(권장 600×600 이상, 정사각 아니면 보드에 맞춰 늘어남):
   - `pokemon.jpg` — 포켓몬
   - `pokemon2.jpg` — 포켓몬 친구들
   - `sanrio.jpg` — 산리오
   - `onepiece.jpg` — 원피스
2. 다른 캐릭터를 추가하려면 `games/puzzle/puzzle-logic.js` 의 `IMAGES` 배열에
   항목을 복사해 `id / title / src / fallbackEmoji` 만 바꾸세요.

## 파일이 없어도 됩니다
이미지가 없거나 오프라인이면, 각 항목의 `fallbackEmoji` + 파스텔 배경으로
**코드가 자동으로 폴백 그림**을 만들어 퍼즐을 진행합니다. (게임은 항상 정상 동작)

## 명화(masterpiece)
명화는 저작권 없는(Public Domain) 위키미디어 원격 URL을 기본 제공하므로
이 폴더에 따로 파일을 넣을 필요가 없습니다(온라인일 때 자동 로드, 오프라인이면 폴백).
