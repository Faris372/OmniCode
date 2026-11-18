/* OmniCode — Service Worker: يجعل الموقع يعمل بدون إنترنت بعد أول فتح
   - صفحات وملفات الموقع الصغيرة: الشبكة أولًا (لتصل التحديثات) ثم النسخة المحفوظة عند انقطاع الإنترنت
   - المحرر والخطوط: من الذاكرة أولًا
   - ملفات بايثون (Pyodide/NumPy/Pandas) ومحركي جافا و سي++ الكبيرة: ذاكرة مستقلة لا تُحذف عند تحديث الموقع */
const SHELL = 'omni-shell-v4';          // غيّر الرقم عند تحديث المحرر أو الخطوط
const LIBS = 'pyar-pyodide-0.26.4';     // يتغير فقط إذا تغيّر إصدار Pyodide
const JAVA = 'omni-java-teavm-2025-06'; // يتغير فقط إذا تغيّرت ملفات محرك جافا الكبيرة
const CPP = 'omni-cpp-clang8-2026-11';  // يتغير فقط إذا تغيّرت ملفات محرك سي++ الكبيرة (clang و wasm-ld)
const PYO = 'https://cdn.jsdelivr.net/pyodide/v0.26.4/full/';
const CM = 'https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/';
const FONTS = 'https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap';

const SHELL_FILES = [
  './', 'manifest.webmanifest',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png', 'icons/favicon-32.png',
  CM + 'codemirror.min.css', CM + 'codemirror.min.js', CM + 'mode/python/python.min.js', CM + 'mode/clike/clike.min.js',
  CM + 'addon/edit/matchbrackets.min.js', CM + 'addon/edit/closebrackets.min.js',
  FONTS,
];
const LIB_FILES = ['pyodide.js', 'pyodide.asm.js', 'pyodide.asm.wasm', 'python_stdlib.zip', 'pyodide-lock.json'].map(f => PYO + f);
const CACHEABLE_HOSTS = ['cdn.jsdelivr.net', 'cdnjs.cloudflare.com', 'fonts.googleapis.com', 'fonts.gstatic.com'];

const isJavaBinary = url => /\/java\/[^?]+\.(wasm|bin)(\?|$)/.test(url);
const isCppBinary = url => /\/cpp\/[^?]+\.(wasm|tar)(\?|$)/.test(url);
const isBinary = url => isJavaBinary(url) || isCppBinary(url);
const cacheFor = url => url.startsWith(PYO) ? LIBS : (isJavaBinary(url) ? JAVA : (isCppBinary(url) ? CPP : SHELL));

async function save(url, { force = false } = {}) {
  const cache = await caches.open(cacheFor(url));
  if (!force && await cache.match(url)) return null;
  try {
    const res = await fetch(new Request(url, { mode: url.startsWith('http') ? 'cors' : 'same-origin', cache: 'reload' }));
    if (res.ok) { await cache.put(url, res.clone()); return res; }
  } catch (e) { /* يُحفظ لاحقًا عند أول استخدام */ }
  return null;
}

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    await Promise.all([
      ...SHELL_FILES.map(async url => {
        const res = await save(url, { force: true });
        if (res && url === FONTS) { // ملف الخطوط يشير إلى ملفات woff2 — نحفظها أيضًا
          const css = await res.text();
          const files = [...new Set([...css.matchAll(/url\((https:[^)]+)\)/g)].map(m => m[1]))];
          await Promise.all(files.map(f => save(f)));
        }
      }),
      ...LIB_FILES.map(url => save(url)),
    ]);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keep = [SHELL, LIBS, JAVA, CPP];
    const keys = await caches.keys();
    // ننقل الملفات المحفوظة من النسخة القديمة (pyar-shell-*) حتى لا تضيع عند التحديث وأنت بدون إنترنت
    for (const k of keys.filter(k => !keep.includes(k))) {
      if (/shell/.test(k)) {
        try {
          const old = await caches.open(k), cur = await caches.open(SHELL);
          for (const req of await old.keys()) { if (!(await cur.match(req))) { const r = await old.match(req); if (r) await cur.put(req, r); } }
        } catch (e) { }
      }
      await caches.delete(k);
    }
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;
  if (!sameOrigin && !CACHEABLE_HOSTS.includes(url.hostname)) return;

  // صفحات وملفات الموقع الصغيرة (ومنها java/worker.js و cpp/worker.js): الشبكة أولًا، ثم المحفوظ عند انقطاع الإنترنت
  if (sameOrigin && !isBinary(req.url)) {
    event.respondWith((async () => {
      const cache = await caches.open(SHELL);
      const key = req.mode === 'navigate' ? './' : req.url.split('?')[0];
      try {
        const res = await fetch(req);
        if (res.ok) cache.put(key, res.clone());
        return res;
      } catch (e) {
        return (await cache.match(key)) || (await caches.match(key, { ignoreVary: true })) || Response.error();
      }
    })());
    return;
  }

  // ملفات محركي جافا و سي++ الكبيرة والمكتبات الخارجية: الذاكرة المحفوظة أولًا
  event.respondWith((async () => {
    const key = isBinary(req.url) ? req.url.split('?')[0] : req.url;
    const hit = await caches.match(key, { ignoreVary: true });
    if (hit) return hit;
    const res = await fetch(req);
    if (res.ok || res.type === 'opaque') {
      const cache = await caches.open(cacheFor(key));
      cache.put(key, res.clone()).catch(() => { });
    }
    return res;
  })());
});
