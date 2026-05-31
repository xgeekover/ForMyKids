#!/bin/bash
# ForMyKids 놀이터 실행 도우미 — 더블클릭하면 한 번 빌드 후 정적 서버가 켜지고 브라우저가 열립니다.
cd "$(dirname "$0")" || exit 1

if [ ! -d node_modules ]; then
  echo "📦 처음 실행이라 의존성을 설치합니다 (npm install)..."
  npm install || { echo "설치 실패 — Node.js 설치 여부를 확인하세요."; exit 1; }
fi

echo "🎀 ForMyKids 빌드 중... (한 번의 빌드로 런처+모든 게임 생성)"
npm run build || { echo "빌드 실패"; exit 1; }

PORT=8080
echo "🎮 놀이터 여는 중... http://localhost:$PORT/"
cd dist || exit 1
python3 -m http.server "$PORT" >/dev/null 2>&1 &
SERVER_PID=$!
sleep 1
open "http://localhost:$PORT/"
echo "끝내려면 이 창을 닫거나 Ctrl+C 를 누르세요."
trap 'kill $SERVER_PID 2>/dev/null' EXIT
wait $SERVER_PID
