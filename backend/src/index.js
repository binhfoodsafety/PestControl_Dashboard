// PestGuard Pro — Cloudflare Worker API (D1)
//
//   GET  /api/health        → kiểm tra Worker + DB
//   GET  /api/data          → { records, capa, updatedAt }        (công khai)
//   GET  /api/auth          → 204 nếu mã quản trị đúng            (cần mã)
//   PUT  /api/records       → thay toàn bộ bản ghi bằng mảng gửi lên (cần mã)
//   PUT  /api/capa          → thay toàn bộ CAPA bằng mảng gửi lên    (cần mã)
//
// Mã quản trị gửi qua header: Authorization: Bearer <ADMIN_KEY>

const MAX_ROWS = 50000;
const CHUNK = 2000; // số dòng mỗi câu INSERT (gửi dạng 1 tham số JSON)

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

export default {
  async fetch(request, env) {
    const cors = corsHeaders(request, env);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

    try {
      const res = await route(request, env);
      for (const [k, v] of Object.entries(cors)) res.headers.set(k, v);
      return res;
    } catch (err) {
      const status = err instanceof HttpError ? err.status : 500;
      const message = err instanceof HttpError ? err.message : 'Internal error';
      if (status === 500) console.error(err);
      return json({ error: message }, status, cors);
    }
  },
};

async function route(request, env) {
  const { pathname } = new URL(request.url);
  const method = request.method;

  if (pathname === '/api/health' && method === 'GET') {
    await env.DB.prepare('SELECT 1').first();
    return json({ ok: true });
  }

  if (pathname === '/api/data' && method === 'GET') {
    const [rec, capa, meta] = await env.DB.batch([
      env.DB.prepare('SELECT * FROM records ORDER BY id'),
      env.DB.prepare('SELECT * FROM capa ORDER BY id'),
      env.DB.prepare("SELECT value FROM meta WHERE key = 'updatedAt'"),
    ]);
    return json({
      records: rec.results,
      capa: capa.results.map(({ description, ...c }) => ({ ...c, desc: description })),
      updatedAt: meta.results[0]?.value || null,
    });
  }

  if (pathname === '/api/auth' && method === 'GET') {
    requireAdmin(request, env);
    return new Response(null, { status: 204 });
  }

  if (pathname === '/api/records' && method === 'PUT') {
    requireAdmin(request, env);
    const rows = (await readArray(request)).map(cleanRecord);
    const updatedAt = await replaceTable(env, 'records', rows, `
      INSERT INTO records (id, month, year, monthNum, area, pestType, count, trapId, trapType, target, inspector, notes)
      SELECT json_extract(value,'$.id'), json_extract(value,'$.month'), json_extract(value,'$.year'),
             json_extract(value,'$.monthNum'), json_extract(value,'$.area'), json_extract(value,'$.pestType'),
             json_extract(value,'$.count'), json_extract(value,'$.trapId'), json_extract(value,'$.trapType'),
             json_extract(value,'$.target'), json_extract(value,'$.inspector'), json_extract(value,'$.notes')
      FROM json_each(?)`);
    return json({ ok: true, count: rows.length, updatedAt });
  }

  if (pathname === '/api/capa' && method === 'PUT') {
    requireAdmin(request, env);
    const rows = (await readArray(request)).map(cleanCapa);
    const updatedAt = await replaceTable(env, 'capa', rows, `
      INSERT INTO capa (id, description, root, owner, due, priority, status, created)
      SELECT json_extract(value,'$.id'), json_extract(value,'$.desc'), json_extract(value,'$.root'),
             json_extract(value,'$.owner'), json_extract(value,'$.due'), json_extract(value,'$.priority'),
             json_extract(value,'$.status'), json_extract(value,'$.created')
      FROM json_each(?)`);
    return json({ ok: true, count: rows.length, updatedAt });
  }

  throw new HttpError(404, 'Not found');
}

// Xóa rồi ghi lại toàn bộ bảng trong một batch (D1 chạy batch như một transaction).
async function replaceTable(env, table, rows, insertSql) {
  const ids = new Set();
  for (const r of rows) {
    if (ids.has(r.id)) throw new HttpError(400, `Duplicate id ${r.id}`);
    ids.add(r.id);
  }
  const updatedAt = new Date().toISOString();
  const stmts = [env.DB.prepare(`DELETE FROM ${table}`)];
  for (let i = 0; i < rows.length; i += CHUNK) {
    stmts.push(env.DB.prepare(insertSql).bind(JSON.stringify(rows.slice(i, i + CHUNK))));
  }
  stmts.push(env.DB.prepare("INSERT OR REPLACE INTO meta (key, value) VALUES ('updatedAt', ?)").bind(updatedAt));
  await env.DB.batch(stmts);
  return updatedAt;
}

function requireAdmin(request, env) {
  const key = env.ADMIN_KEY;
  if (!key) throw new HttpError(500, 'ADMIN_KEY is not configured');
  const header = request.headers.get('Authorization') || '';
  const given = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!safeEqual(given, key)) throw new HttpError(401, 'Invalid admin key');
}

function safeEqual(a, b) {
  const enc = new TextEncoder();
  const x = enc.encode(a), y = enc.encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

async function readArray(request) {
  let body;
  try { body = await request.json(); } catch { throw new HttpError(400, 'Body must be JSON'); }
  if (!Array.isArray(body)) throw new HttpError(400, 'Body must be a JSON array');
  if (body.length > MAX_ROWS) throw new HttpError(413, `Too many rows (max ${MAX_ROWS})`);
  return body;
}

const str = (v, max = 500) => (v == null ? '' : String(v)).slice(0, max);
const int = (v, def = 0) => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : def; };

function cleanRecord(r) {
  if (!r || typeof r !== 'object') throw new HttpError(400, 'Invalid record');
  const id = int(r.id, NaN);
  if (!Number.isFinite(id)) throw new HttpError(400, 'Record without id');
  const month = MONTHS.includes(r.month) ? r.month : str(r.month, 20);
  return {
    id, month,
    year: int(r.year, new Date().getFullYear()),
    monthNum: MONTHS.indexOf(month) + 1 || int(r.monthNum, 1),
    area: str(r.area), pestType: str(r.pestType),
    count: int(r.count), trapId: str(r.trapId, 100), trapType: str(r.trapType, 100),
    target: int(r.target), inspector: str(r.inspector, 200), notes: str(r.notes, 2000),
  };
}

function cleanCapa(c) {
  if (!c || typeof c !== 'object') throw new HttpError(400, 'Invalid CAPA');
  const id = int(c.id, NaN);
  if (!Number.isFinite(id)) throw new HttpError(400, 'CAPA without id');
  return {
    id, desc: str(c.desc, 2000), root: str(c.root, 200), owner: str(c.owner, 200),
    due: str(c.due, 30), priority: str(c.priority, 30), status: str(c.status, 30) || 'open',
    created: str(c.created, 30),
  };
}

function corsHeaders(request, env) {
  const origin = request.headers.get('Origin') || '';
  const allowed = (env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
  const h = {
    'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
  if (allowed.includes(origin)) h['Access-Control-Allow-Origin'] = origin;
  return h;
}

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers },
  });
}

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
