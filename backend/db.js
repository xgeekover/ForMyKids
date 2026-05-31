// MariaDB 커넥션 풀 + 스키마 부트스트랩 (mysql2/promise)
// ─────────────────────────────────────────────────────────────────────────────
// 이 백엔드는 '서버에 이미 떠 있는 외부 MariaDB'(예: <원격서버>:3336)에 접속해
// 전용 데이터베이스('formykids')를 만들고 그 안에 동기화 기록을 적재한다.
// (별도의 MariaDB 컨테이너를 띄우지 않는다 → docker-compose 에 db 서비스 없음)
import mysql from 'mysql2/promise';

const DB_NAME = process.env.DB_NAME || 'formykids';

// 접속 기본값(docker-compose 환경변수로 주입). 외부 MariaDB 재사용.
const baseConfig = {
  host: process.env.DB_HOST || 'mariadb-server', // 컨테이너 간 직접 통신(같은 도커 네트워크). 대안: 원격서버 IP
  port: Number(process.env.DB_PORT || 3306),     // 컨테이너 내부 포트(호스트 게시 포트 3336 아님)
  user: process.env.DB_USER || 'fmk_user',
  password: process.env.DB_PASSWORD || '',
  charset: 'utf8mb4',
};

// 실제 쿼리에 쓰는 풀은 우리 전용 DB(DB_NAME)로 접속한다.
// (DB 는 initSchema 1단계에서 먼저 만들어지므로, 풀의 첫 쿼리 시점엔 이미 존재한다.)
const pool = mysql.createPool({
  ...baseConfig,
  database: DB_NAME,
  waitForConnections: true,
  connectionLimit: Number(process.env.DB_POOL || 10),
  queueLimit: 0,
});

/**
 * 스키마 부트스트랩:
 *  1) 외부 MariaDB 에 전용 DB(DB_NAME)가 없으면 생성(database 미지정 커넥션으로 1회).
 *  2) 사용자(기기) 1행 = 스토어 payload 통째 테이블 생성.
 *     fmk_users(id VARCHAR, payload_json JSON, updated_at TIMESTAMP)
 */
export async function initSchema() {
  // 1) 전용 DB 생성(없으면). 서버에 이미 떠 있는 MariaDB 를 그대로 재사용.
  const boot = await mysql.createConnection(baseConfig); // database 미지정
  try {
    await boot.query(
      `CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
    );
  } finally {
    await boot.end();
  }

  // 2) 테이블 생성(풀은 위에서 database=DB_NAME 으로 접속).
  await pool.query(`
    CREATE TABLE IF NOT EXISTS fmk_users (
      id           VARCHAR(64) NOT NULL PRIMARY KEY,
      payload_json JSON        NOT NULL,
      updated_at   TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
}

export default pool;
