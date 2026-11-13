import { sql } from '@vercel/postgres';
import { NextRequest, NextResponse } from 'next/server';

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
    // 打点失败不能影响前端彩蛋
    return NextResponse.json({ ok: false }, { status: 200, headers: cors(origin) });
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
  } catch {
    return NextResponse.json({ rows: [] }, { headers: cors(origin) });
  }
}
