import { VercelPool } from '@vercel/postgres';
import { NextRequest, NextResponse } from 'next/server';

// Neon 原生集成注入 DATABASE_URL（@vercel/postgres 的 createPool() 默认只认
// POSTGRES_URL，且强制要求连接串含 "-pooler."，direct 串会抛 invalid_connection_string）。
// 直接构造 VercelPool 可绕开这两个 create* 的校验：它的 .sql 走 neon() HTTP，
// pooled / direct 串都能用。按优先级挑一个，本地都没有就留 null，让 catch 回显。
const CS = process.env.DATABASE_URL
  || process.env.POSTGRES_URL
  || process.env.POSTGRES_URL_NON_POOLING
  || '';
const pool = CS ? new VercelPool({ connectionString: CS }) : null;

// 保持下面 4 处 sql`...` 模板写法不变，只把底层从懒加载 Proxy 换成显式 pool
function sql(strings: TemplateStringsArray, ...values: (string | number | boolean | undefined | null)[]) {
  if (!pool) throw new Error('no_database_connection_string');
  return pool.sql(strings, ...values);
}

const ALLOW = new Set([
  'https://yueyuezidaidaixue.de5.net',
  'http://localhost:3000',
]);

function cors(origin: string | null) {
  const ok = origin && ALLOW.has(origin) ? origin : '';
  return {
    'Access-Control-Allow-Origin': ok,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
}

async function ensureTable() {
  await sql`CREATE TABLE IF NOT EXISTS heir_picks (
    id SERIAL PRIMARY KEY,
    signal TEXT NOT NULL,
    name TEXT NOT NULL,
    at TIMESTAMPTZ DEFAULT now()
  )`;
}

export async function OPTIONS(req: NextRequest) {
  return new Response(null, { status: 204, headers: cors(req.headers.get('origin')) });
}

export async function POST(req: NextRequest) {
  const origin = req.headers.get('origin');
  try {
    const body = await req.json().catch(() => ({}));
    const signal = String(body.signal ?? '').slice(0, 64);
    const name = String(body.name ?? '').slice(0, 64);
    if (!signal) return NextResponse.json({ ok: false }, { status: 400, headers: cors(origin) });
    await ensureTable();
    await sql`INSERT INTO heir_picks (signal, name) VALUES (${signal}, ${name})`;
    const { rows } = await sql`SELECT count(*)::int AS n FROM heir_picks`;
    return NextResponse.json(
      { ok: true, cycles: 33_550_336, picks: rows[0].n },
      { headers: { ...cors(origin), 'Cache-Control': 'no-store' } }
    );
  } catch (e) {
    // 打点失败不能影响前端彩蛋；回显错误码便于定位（不含连接串值）
    return NextResponse.json(
      { ok: false, err: (e instanceof Error ? e.message : String(e)).slice(0, 200) },
      { status: 200, headers: cors(origin) }
    );
  }
}

export async function GET(req: NextRequest) {
  const origin = req.headers.get('origin');
  try {
    await ensureTable();
    const { rows } = await sql`SELECT signal, name, count(*)::int AS n
      FROM heir_picks GROUP BY signal, name ORDER BY n DESC LIMIT 20`;
    return NextResponse.json(
      { rows, cycles: 33_550_336 },
      { headers: { ...cors(origin), 'Cache-Control': 'no-store' } }
    );
  } catch (e) {
    return NextResponse.json(
      { rows: [], err: (e instanceof Error ? e.message : String(e)).slice(0, 200) },
      { headers: cors(origin) }
    );
  }
}
