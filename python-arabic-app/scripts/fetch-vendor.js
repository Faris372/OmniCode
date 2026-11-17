// ينزّل كل ما يحتاجه التطبيق ليعمل بدون إنترنت إلى مجلد vendor-cache/
//   - محرك Pyodide 0.26.4 + حزم numpy و pandas وكل ما تعتمد عليه
//   - محرر CodeMirror 5.65.16
//   - خطّا IBM Plex Sans Arabic و JetBrains Mono
// تشغيل: node scripts/fetch-vendor.js   (مرة واحدة؛ الملفات الموجودة لا تُنزّل مجددًا)
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', 'vendor-cache');
const PYO = 'https://cdn.jsdelivr.net/pyodide/v0.26.4/full/';
const CM = 'https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/';
const FONTS_CSS = 'https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap';
const UA = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36';
const PACKAGES = ['numpy', 'pandas'];

async function get(url, dest) {
  if (fs.existsSync(dest) && fs.statSync(dest).size > 0) return fs.readFileSync(dest);
  const r = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!r.ok) throw new Error(r.status + ' ' + url);
  const buf = Buffer.from(await r.arrayBuffer());
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, buf);
  console.log('  ↓', path.relative(ROOT, dest), (buf.length / 1048576).toFixed(2) + ' MB');
  return buf;
}

(async () => {
  // 1) Pyodide core
  const pdir = path.join(ROOT, 'pyodide');
  for (const f of ['pyodide.js', 'pyodide.asm.js', 'pyodide.asm.wasm', 'python_stdlib.zip', 'pyodide-lock.json']) {
    await get(PYO + f, path.join(pdir, f));
  }
  // 2) numpy + pandas + dependencies (resolved from the lock file)
  const lock = JSON.parse(fs.readFileSync(path.join(pdir, 'pyodide-lock.json'), 'utf8'));
  const want = new Set();
  const visit = n => { const k = n.toLowerCase(); if (want.has(k)) return; const p = lock.packages[k]; if (!p) throw new Error('not in lock: ' + n); want.add(k); (p.depends || []).forEach(visit); };
  PACKAGES.forEach(visit);
  console.log('packages:', [...want].join(', '));
  for (const k of want) await get(PYO + lock.packages[k].file_name, path.join(pdir, lock.packages[k].file_name));

  // 3) CodeMirror
  for (const f of ['codemirror.min.css', 'codemirror.min.js', 'mode/python/python.min.js', 'mode/clike/clike.min.js', 'addon/edit/matchbrackets.min.js', 'addon/edit/closebrackets.min.js']) {
    await get(CM + f, path.join(ROOT, 'codemirror', f));
  }

  // 4) Fonts: download the CSS, then every woff2 it references, and rewrite URLs to local files
  const fdir = path.join(ROOT, 'fonts');
  fs.mkdirSync(fdir, { recursive: true });
  const r = await fetch(FONTS_CSS, { headers: { 'User-Agent': UA } });
  if (!r.ok) throw new Error('fonts css ' + r.status);
  let css = await r.text();
  const urls = [...new Set([...css.matchAll(/url\((https:[^)]+)\)/g)].map(m => m[1]))];
  let i = 0;
  for (const u of urls) {
    const name = 'f' + (i++) + '.woff2';
    await get(u, path.join(fdir, name));
    css = css.split(u).join(name);
  }
  fs.writeFileSync(path.join(fdir, 'fonts.css'), css);
  console.log('  fonts:', urls.length, 'files');

  const total = (function walk(d) { return fs.readdirSync(d, { withFileTypes: true }).reduce((s, e) => s + (e.isDirectory() ? walk(path.join(d, e.name)) : fs.statSync(path.join(d, e.name)).size), 0); })(ROOT);
  console.log('done. vendor-cache size:', (total / 1048576).toFixed(1), 'MB');
})().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
