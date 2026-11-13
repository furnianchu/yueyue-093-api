// 本地直传 Vercel Blob —— 不经过 Function，绕开 4.5 MB 请求体上限
// 用法：node --env-file=.env.local scripts/upload-pv.mjs
import { put } from '@vercel/blob';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const DIR = path.resolve('public/pv');
const PREFIX = 'pv';

if (!process.env.BLOB_READ_WRITE_TOKEN) {
  console.warn('⚠️ 未设置 BLOB_READ_WRITE_TOKEN，SDK 会尝试 OIDC（需 BLOB_STORE_ID）。');
  console.warn('   若报认证错误：Vercel Dashboard → Storage → 你的 store →');
  console.warn('   生成 Read-Write Token，写进 .env.local 后重跑。');
}

const files = (await readdir(DIR)).filter(f => /\.mp4$/i.test(f)).sort();
if (!files.length) {
  console.error(`public/pv/ 里没有 mp4，先放文件再跑。`);
  process.exit(1);
}

let base = '';
for (const f of files) {
  const buf = await readFile(path.join(DIR, f));
  const blob = await put(`${PREFIX}/${f}`, buf, {
    access: 'public',           // store 必须是 public，建完不可改
    contentType: 'video/mp4',   // 别让浏览器收到 octet-stream
    addRandomSuffix: false,     // 固定文件名，前端才能按 heirs.ts 拼 URL
    allowOverwrite: true,       // 重新压片后覆盖，别让 URL 变
  });
  if (!base) base = new URL(blob.url).origin + `/${PREFIX}`;
  console.log(`${(buf.length / 1048576).toFixed(1)} MB  ${f}`);
  console.log(`  -> ${blob.url}`);
}

console.log(`\n共 ${files.length} 个。前端 NEXT_PUBLIC_PV_BASE 设为：\n  ${base}`);
console.log('然后重新 npm run deploy（NEXT_PUBLIC_* 是构建期注入）。');
console.log('若 SDK 版本不认 access/allowOverwrite 选项，删掉这两行即可（store 本身已是 public）。');
