// 把仓库根目录的站点文件复制到 desktop/app/，供 electron-builder 打进 asar。
import { cp, mkdir, rm, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const desktopDir = path.resolve(here, '..');
const repoDir = path.resolve(desktopDir, '..');
const appDir = path.join(desktopDir, 'app');
const ITEMS = ['index.html', 'src', 'assets'];

async function walk(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...await walk(p));
    else out.push(p);
  }
  return out;
}

const missing = [];
for (const it of ITEMS) {
  try { await stat(path.join(repoDir, it)); } catch { missing.push(it); }
}
if (missing.length) {
  console.error('[stage] 站点文件缺失：' + missing.join(', ') + '（应在 ' + repoDir + '）');
  process.exit(1);
}

await rm(appDir, { recursive: true, force: true });
await mkdir(appDir, { recursive: true });
for (const it of ITEMS) {
  await cp(path.join(repoDir, it), path.join(appDir, it), { recursive: true });
}

const files = await walk(appDir);
let bytes = 0;
for (const f of files) bytes += (await stat(f)).size;
console.log('[stage] ' + files.length + ' 个文件 / ' + (bytes / 1024 / 1024).toFixed(2) + ' MB → ' + appDir);
for (const f of files) console.log('   ' + path.relative(appDir, f));
