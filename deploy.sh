#!/usr/bin/env bash
# ===================================================================
# ForMyKids · 이미지 기반 배포 (v1.3.0)
# -------------------------------------------------------------------
# 흐름: ① 로컬에서 docker 이미지 빌드 → ② docker save | ssh docker load 로 원격 전송
#       → ③ 원격에서 docker compose up -d (빌드 없이 전송받은 이미지 사용)
# (홈 서버라 별도 레지스트리 없이 save|load 방식. 소스 rsync/원격 빌드는 더 이상 하지 않음)
#
# 사용법:
#   npm run deploy                                  # 대상/계정/비밀번호는 .env.deploy 에서 읽음(권장)
#   bash deploy.sh                                  # 기본: user@SERVER_HOST:~/ForMyKids-app
#   bash deploy.sh deploy@<서버IP>                  # 계정/호스트 지정
#   bash deploy.sh deploy@<서버IP> ~/apps/fmk       # 원격 경로까지 지정
#   FMK_REMOTE=pi@<서버IP> FMK_SSH_PORT=2222 bash deploy.sh
#
# 민감정보(서버 주소/계정/SSH 비밀번호)는 커밋되는 이 스크립트가 아니라 .gitignore 된
# .env.deploy 에 둔다. 예) .env.deploy:
#   FMK_REMOTE=<계정>@<서버IP>
#   FMK_SSH_PORT=<포트>
#   FMK_SSH_PASS=<비밀번호>          # 키 인증이면 생략
# (.env.deploy 는 원격으로 전송되지 않는다 — scp 대상은 .env 뿐.)
# ===================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# 배포 대상/계정/SSH 비밀번호를 로컬 전용 .env.deploy 에서 불러온다(있을 때만).
# 주의: set -a 로 가져오므로 같은 이름의 환경변수가 명령줄에 있으면 .env.deploy 값으로 덮어쓴다.
if [ -f .env.deploy ]; then set -a; . ./.env.deploy; set +a; fi

# ── 설정 (인자 > 환경변수/.env.deploy > 자리표시자 기본값) ───────
REMOTE="${1:-${FMK_REMOTE:-user@SERVER_HOST}}"
REMOTE_DIR="${2:-${FMK_REMOTE_DIR:-~/ForMyKids-app}}"
SSH_PORT="${FMK_SSH_PORT:-22}"
IMAGES=("formykids-backend:latest" "formykids-frontend:latest")  # docker-compose.yml 의 image: 와 일치

echo "──────────────────────────────────────────────"
echo " 🚀 ForMyKids 이미지 배포"
echo "    원격 대상 : $REMOTE"
echo "    원격 경로 : $REMOTE_DIR"
echo "    SSH 포트  : $SSH_PORT"
echo "    이미지    : ${IMAGES[*]}"
echo "──────────────────────────────────────────────"

# ── 필수 도구 확인 ──────────────────────────────────────────────
command -v docker >/dev/null 2>&1 || { echo "❌ docker 가 필요합니다(로컬 빌드용)."; exit 1; }
command -v ssh    >/dev/null 2>&1 || { echo "❌ ssh 가 필요합니다."; exit 1; }
command -v scp    >/dev/null 2>&1 || { echo "❌ scp 가 필요합니다."; exit 1; }

# 로컬 compose 명령(v2 우선, 없으면 v1)
if docker compose version >/dev/null 2>&1; then DC_LOCAL="docker compose"; else DC_LOCAL="docker-compose"; fi

# ── SSH/SCP 명령 구성(옵션 + 선택적 비밀번호 인증) ────────────────
# 키 인증이 기본. FMK_SSH_PASS 가 있으면 askpass 로 '비대화식' 비밀번호 인증(키 미설정 서버 대응).
SSH_OPTS="-o StrictHostKeyChecking=accept-new -o ConnectTimeout=20"
SSH_PW_OPTS=""
if [ -n "${FMK_SSH_PASS:-}" ]; then
  _ASKPASS="$(mktemp)"; printf '#!/bin/sh\nprintf "%%s\\n" "$FMK_SSH_PASS"\n' > "$_ASKPASS"; chmod 700 "$_ASKPASS"
  export FMK_SSH_PASS SSH_ASKPASS="$_ASKPASS" SSH_ASKPASS_REQUIRE=force DISPLAY="${DISPLAY:-:0}"
  trap 'rm -f "$_ASKPASS"' EXIT
  SSH_PW_OPTS="-o PreferredAuthentications=password -o PubkeyAuthentication=no -o NumberOfPasswordPrompts=1"
fi
SSH="ssh -p $SSH_PORT $SSH_OPTS $SSH_PW_OPTS"
SCP="scp -P $SSH_PORT $SSH_OPTS $SSH_PW_OPTS"

# ── 1) 로컬 이미지 빌드(compose 의 image: 태그로 태깅됨) ─────────
# 원격과 CPU 아키텍처가 다르면(예: arm64 Mac → x86_64 서버) FMK_PLATFORM 으로 크로스 빌드해야
# 원격에서 'exec format error' 가 나지 않는다. (예: FMK_PLATFORM=linux/amd64)
if [ -n "${FMK_PLATFORM:-}" ]; then
  echo "🔨 [1/4] 크로스 빌드(buildx, $FMK_PLATFORM): backend + frontend"
  docker buildx build --platform "$FMK_PLATFORM" -t formykids-backend:latest --load ./backend
  docker buildx build --platform "$FMK_PLATFORM" -t formykids-frontend:latest --load .
else
  echo "🔨 [1/4] 로컬 이미지 빌드: $DC_LOCAL build"
  $DC_LOCAL build
fi

# ── 2) 원격 폴더 준비 + compose(.env) 전송 ──────────────────────
echo "📁 [2/4] 원격 폴더 준비 + compose 전송"
$SSH "$REMOTE" "mkdir -p $REMOTE_DIR"
$SCP docker-compose.yml "$REMOTE:$REMOTE_DIR/docker-compose.yml"
# DB 백업 스크립트도 함께 전송(서버에서 cron 등록용 — .env 와 같은 폴더에 위치)
if [ -f backup-db.sh ]; then $SCP backup-db.sh "$REMOTE:$REMOTE_DIR/backup-db.sh"; fi
# 로컬에 .env 가 있으면 함께 전송(없으면 compose 기본값 사용 — 비밀은 서버 .env 권장)
if [ -f .env ]; then $SCP .env "$REMOTE:$REMOTE_DIR/.env"; fi

# ── 3) 이미지 전송 (docker save | gzip | ssh docker load) ───────
#     원격 파이프는 bash -o pipefail 로 실행 → gunzip 실패가 docker load 성공에 가려지지 않게.
echo "🚚 [3/4] 이미지 전송(docker save | ssh docker load)..."
docker save "${IMAGES[@]}" | gzip -c | $SSH "$REMOTE" "bash -o pipefail -c 'gunzip -c | docker load'"

# ── 4) 원격 사전점검 → 기동 → 정리 (빌드 없이 전송받은 이미지 사용) ──
echo "🔎 [4/4] 원격 점검(이미지/네트워크) → 기동..."
# (a) 전송된 이미지가 원격에 실제로 있는지 확인(없으면 up 이 빌드를 시도하다 실패 → 명확히 중단)
$SSH "$REMOTE" "docker image inspect ${IMAGES[*]} >/dev/null 2>&1" \
  || { echo "❌ 원격에 이미지가 없습니다(load 실패). 중단합니다."; exit 1; }
# (b) mariadb-server 가 속한 외부 네트워크가 원격에 존재하는지 확인(없으면 up -d 가 곧장 실패)
$SSH "$REMOTE" "bash -lc 'cd $REMOTE_DIR; [ -f .env ] && set -a && . ./.env && set +a; docker network inspect \"\${MARIADB_NETWORK:-mariadb_default}\" >/dev/null 2>&1'" \
  || { echo "❌ 외부 네트워크(\${MARIADB_NETWORK:-mariadb_default})를 찾을 수 없습니다."; \
       echo "   mariadb-server 의 네트워크 이름을 원격 .env 의 MARIADB_NETWORK 로 지정하세요. 확인:"; \
       echo "   docker inspect -f '{{range \$k,\$v := .NetworkSettings.Networks}}{{\$k}} {{end}}' mariadb-server"; exit 1; }

echo "🐳 원격 기동: docker compose up -d (빌드 없음) + 오래된(dangling) 이미지 정리"
# cd 경로는 따옴표로 감싸지 않는다 — 원격 셸이 '~' 를 $HOME 으로 펼치게(따옴표 안 '~'는 안 펼쳐짐)
$SSH "$REMOTE" "bash -lc 'cd $REMOTE_DIR && \
  if docker compose version >/dev/null 2>&1; then DC=\"docker compose\"; else DC=\"docker-compose\"; fi && \
  echo \"   using: \$DC\" && \
  \$DC up -d && \
  (docker image prune -f >/dev/null 2>&1 || true)'"

HOST_ONLY="${REMOTE#*@}"
echo "──────────────────────────────────────────────"
echo " ✅ 배포 완료!  →  http://${HOST_ONLY}:8080"
echo "──────────────────────────────────────────────"
