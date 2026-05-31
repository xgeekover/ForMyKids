// ForMyKids 클라우드 동기화 API — Express 초경량 골격
// 엔드포인트:
//   GET  /api/health        헬스체크
//   GET  /api/sync?id=...   기기 id 의 최신 스토어 payload 내려받기
//   POST /api/sync          { id, payload } 통째 업로드(upsert)
import express from 'express';
import pool, { initSchema } from './db.js';

const app = express();
app.use(express.json({ limit: '2mb' })); // 스토어 payload 는 작지만 여유 있게

// CORS — 운영(같은 오리진, Nginx 프록시)에서는 불필요하나 개발/직접접속 대비 허용
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// 스키마(DB/테이블) 준비 여부 — 준비 전 동기화 요청은 503(재시도 가능)로 응답.
let schemaReady = false;

app.get('/api/health', (_req, res) => res.json({ ok: true, service: 'fmk-sync', dbReady: schemaReady }));

// 내려받기: 해당 id 의 payload + 논리적 변경시각(payload.updatedAt)
app.get('/api/sync', async (req, res) => {
  if (!schemaReady) return res.status(503).json({ error: 'db not ready' }); // 준비 전 → 재시도(클라는 오프라인 취급)
  const id = String(req.query.id || '').slice(0, 64);
  if (!id) return res.status(400).json({ error: 'id required' });
  try {
    const [rows] = await pool.query(
      'SELECT payload_json, updated_at FROM fmk_users WHERE id = ? LIMIT 1',
      [id]
    );
    if (!rows.length) return res.json({ id, payload: null, updatedAt: 0 });
    const raw = rows[0].payload_json;
    const payload = typeof raw === 'string' ? JSON.parse(raw) : raw;
    const updatedAt = Number(payload && payload.updatedAt) || 0;
    return res.json({ id, payload, updatedAt });
  } catch (e) {
    console.error('GET /api/sync', e);
    return res.status(500).json({ error: 'db error' });
  }
});

// 업로드: payload 통째 upsert(Last-Writer-Wins 는 클라이언트가 타임스탬프로 판단)
app.post('/api/sync', async (req, res) => {
  if (!schemaReady) return res.status(503).json({ error: 'db not ready' }); // 준비 전 → 재시도(클라는 오프라인 취급)
  const { id, payload } = req.body || {};
  if (!id || typeof id !== 'string' || !payload || typeof payload !== 'object') {
    return res.status(400).json({ error: 'id and payload required' });
  }
  const safeId = id.slice(0, 64);
  try {
    // MariaDB JSON 컬럼은 유효한 JSON 문자열을 그대로 받음(json_valid 체크). upsert.
    await pool.query(
      `INSERT INTO fmk_users (id, payload_json)
       VALUES (?, ?)
       ON DUPLICATE KEY UPDATE payload_json = VALUES(payload_json)`,
      [safeId, JSON.stringify(payload)]
    );
    return res.json({ ok: true, id: safeId, updatedAt: Number(payload.updatedAt) || 0 });
  } catch (e) {
    console.error('POST /api/sync', e);
    return res.status(500).json({ error: 'db error' });
  }
});

const PORT = Number(process.env.PORT || 3000);

// 스키마 생성은 백그라운드에서 재시도(DB 가 늦게 떠도 헬스/라우팅은 즉시 살아있음).
function initSchemaWithRetry(attempt = 1) {
  initSchema()
    .then(() => { schemaReady = true; console.log('스키마 준비 완료(fmk_users)'); })
    .catch((e) => {
      console.log(`DB 연결 대기 중... (${attempt}) ${e.code || e.message}`);
      if (attempt < 60) setTimeout(() => initSchemaWithRetry(attempt + 1), 2000);
      else console.error('DB 초기화 실패(최대 재시도 초과)');
    });
}

// 먼저 listen → 프록시/헬스체크 즉시 가능. 그 다음 스키마 준비.
app.listen(PORT, () => {
  console.log(`ForMyKids sync API listening on :${PORT}`);
  initSchemaWithRetry();
});
