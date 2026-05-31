#!/usr/bin/env bash
# ===================================================================
# ForMyKids · MariaDB 백업 (formykids DB → 타임스탬프 .sql.gz)
# -------------------------------------------------------------------
# 홈 서버에서 실행한다. 'mariadb-server' 컨테이너가 있으면 그 안에서(권장),
# 없으면 호스트의 클라이언트로 외부 fmk_user 계정에 직접 접속해 mysqldump 한다.
# 비밀번호는 이 파일에 적지 않는다 — 같은 폴더의 .env(또는 환경변수)에서 읽는다.
#   (이 스크립트는 git 에 커밋되므로 절대 비밀번호를 하드코딩하지 말 것)
#
# ┌─ cron 등록 안내 (매일 새벽 3시 자동 백업) ─────────────────────────────┐
# │ 1) 이 스크립트를 .env 와 같은 폴더(예: ~/ForMyKids-app/)에 두고 실행권한 부여:   │
# │      chmod +x ~/ForMyKids-app/backup-db.sh                                   │
# │ 2) crontab -e 후 아래 한 줄 추가:                                            │
# │      0 3 * * * /home/<계정>/ForMyKids-app/backup-db.sh >> /home/<계정>/fmk-backups/backup.log 2>&1 │
# │   ※ cron 은 PATH 가 짧아 docker 를 못 찾을 수 있음 → 절대경로 지정:           │
# │      which docker  →  예) 0 3 * * * FMK_DOCKER=/usr/bin/docker /home/<계정>/.../backup-db.sh ... │
# └────────────────────────────────────────────────────────────────────────────┘
# ===================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ── 설정값: .env(스크립트 폴더) 또는 환경변수에서 읽고, 없으면 기본값 ──
ENV_FILE="${FMK_ENV_FILE:-$SCRIPT_DIR/.env}"
if [ -f "$ENV_FILE" ]; then set -a; . "$ENV_FILE"; set +a; fi

DB_NAME="${DB_NAME:-formykids}"
DB_USER="${DB_USER:-fmk_user}"
DB_PASSWORD="${DB_PASSWORD:-}"
CONTAINER="${FMK_DB_CONTAINER:-mariadb-server}"     # 도커 모드 컨테이너 이름
DOCKER="${FMK_DOCKER:-docker}"                       # cron 용: 절대경로 지정 가능(/usr/bin/docker)
BACKUP_DIR="${FMK_BACKUP_DIR:-$HOME/fmk-backups}"
KEEP_DAYS="${FMK_BACKUP_KEEP_DAYS:-14}"              # 보관 기간(일). 0 이면 정리 안 함
# 직접 접속 모드(도커 미사용)용 호스트/포트 — 외부 게시 포트 기본 3336
DIRECT_HOST="${FMK_DB_HOST:-127.0.0.1}"
DIRECT_PORT="${FMK_DB_PORT:-3336}"

# mysqldump 옵션: 단일 트랜잭션(잠금 없이 일관 스냅샷) + utf8mb4. (단일 테이블 앱이라 routines/events 생략)
DUMP_OPTS="--single-transaction --quick --default-character-set=utf8mb4 --databases $DB_NAME"

log() { echo "[$(date '+%F %T')] $*"; }

if [ -z "$DB_PASSWORD" ]; then
  echo "❌ DB_PASSWORD 가 비어 있습니다. $ENV_FILE 에 설정하거나 환경변수로 주입하세요." >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"
TS="$(date +%Y%m%d_%H%M%S)"
OUT="$BACKUP_DIR/${DB_NAME}_${TS}.sql.gz"

# 덤프 도구 탐색: mariadb-dump(신) 우선, 없으면 mysqldump. prefix 가 비면 호스트에서 직접 검사.
# (prefix 를 "$@" 로 받아 빈 문자열이 가짜 명령으로 실행되는 버그를 피하려 모드별로 인라인 검사)
find_dump_in_container() {
  if "$DOCKER" exec -i "$CONTAINER" sh -c 'command -v mariadb-dump' >/dev/null 2>&1; then echo mariadb-dump
  elif "$DOCKER" exec -i "$CONTAINER" sh -c 'command -v mysqldump' >/dev/null 2>&1; then echo mysqldump
  else echo ""; fi
}
find_dump_on_host() {
  if command -v mariadb-dump >/dev/null 2>&1; then echo mariadb-dump
  elif command -v mysqldump >/dev/null 2>&1; then echo mysqldump
  else echo ""; fi
}

log "ForMyKids '$DB_NAME' 백업 시작 → $OUT"
set -o pipefail

dump_stream() {
  if "$DOCKER" ps --format '{{.Names}}' 2>/dev/null | grep -qx "$CONTAINER"; then
    # (1) 권장: mariadb-server 컨테이너 안에서 덤프(127.0.0.1:3306, MYSQL_PWD 로 비번 노출 방지)
    local tool; tool="$(find_dump_in_container)"
    [ -n "$tool" ] || { echo "❌ 컨테이너 '$CONTAINER' 에 mariadb-dump/mysqldump 가 없습니다." >&2; return 1; }
    log "방식: docker exec $CONTAINER ($tool)"
    "$DOCKER" exec -i -e MYSQL_PWD="$DB_PASSWORD" "$CONTAINER" \
      "$tool" -h 127.0.0.1 -P 3306 -u "$DB_USER" $DUMP_OPTS
  else
    # (2) 컨테이너가 없으면 호스트 클라이언트로 직접 접속(fmk_user)
    local tool; tool="$(find_dump_on_host)"
    [ -n "$tool" ] || { echo "❌ 호스트에 mariadb-dump/mysqldump 가 없습니다(클라이언트를 설치하세요)." >&2; return 1; }
    log "방식: 직접 접속 $DIRECT_HOST:$DIRECT_PORT ($tool)"
    MYSQL_PWD="$DB_PASSWORD" "$tool" -h "$DIRECT_HOST" -P "$DIRECT_PORT" -u "$DB_USER" $DUMP_OPTS
  fi
}

if dump_stream | gzip -c > "$OUT"; then
  log "✅ 백업 완료: $OUT ($(du -h "$OUT" | cut -f1))"
else
  echo "❌ 백업 실패 — 불완전 파일 삭제: $OUT" >&2
  rm -f "$OUT"
  exit 1
fi

# 오래된 백업 정리
if [ "${KEEP_DAYS}" -gt 0 ] 2>/dev/null; then
  find "$BACKUP_DIR" -maxdepth 1 -type f -name "${DB_NAME}_*.sql.gz" -mtime +"$KEEP_DAYS" -print -delete \
    | sed 's/^/  🗑  오래된 백업 삭제: /' || true
fi
log "완료. 보관 위치: $BACKUP_DIR (최근 ${KEEP_DAYS}일 유지)"

# 복원 예시:  gunzip -c <백업파일>.sql.gz | docker exec -i mariadb-server mariadb -u root -p
