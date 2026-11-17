// يبني مجلد www/ للتطبيق من الموقع الأصلي ../python-arabic/index.html
// ويحوّل كل روابط الإنترنت (الخطوط، المحرر، محرك بايثون) إلى ملفات محلية داخل التطبيق
// المتطلب: تشغيل  node scripts/fetch-vendor.js  مرة واحدة قبله
const fs = require('fs');
const path = require('path');

const APP = path.join(__dirname, '..');
const SRC = path.join(APP, '..', 'python-arabic', 'index.html');
const WWW = path.join(APP, 'www');
const CACHE = path.join(APP, 'vendor-cache');

if (!fs.existsSync(path.join(CACHE, 'pyodide', 'pyodide.asm.wasm'))) {
  console.error('vendor-cache missing — run: node scripts/fetch-vendor.js');
  process.exit(1);
}

let html = fs.readFileSync(SRC, 'utf8');
function rep(from, to) {
  const n = html.split(from).length - 1;
  if (n < 1) throw new Error('not found in source: ' + from);
  html = html.split(from).join(to);
}

// وضع التطبيق: تصميم الجوال الخاص (شريط سفلي، واجهة أبسط)
if (!html.includes('<html lang="ar" dir="rtl" class="app">')) rep('<html lang="ar" dir="rtl">', '<html lang="ar" dir="rtl" class="app">');
// داخل التطبيق نقول «التطبيق» بدل «الموقع»
if (html.includes('هذا الموقع')) rep('هذا الموقع', 'هذا التطبيق');
// الخطوط
rep('<link rel="preconnect" href="https://fonts.googleapis.com">\n', '');
rep('<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n', '');
rep('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap', 'vendor/fonts/fonts.css');
// المحرر
rep('https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/', 'vendor/codemirror/');
// محرك بايثون
rep('<script src="https://cdn.jsdelivr.net/pyodide/v0.26.4/full/pyodide.js"></script>', '<script src="pyodide/pyodide.js"></script>');
rep("const PY_INDEX = 'https://cdn.jsdelivr.net/pyodide/v0.26.4/full/';", "const PY_INDEX = new URL('pyodide/', location.href).href;");

const left = html.match(/https:\/\/(cdn\.jsdelivr|cdnjs|fonts\.g)[^"'\s)]*/g);
if (left) throw new Error('remote URLs left: ' + left.join(', '));

fs.rmSync(WWW, { recursive: true, force: true });
fs.mkdirSync(WWW, { recursive: true });
fs.writeFileSync(path.join(WWW, 'index.html'), html);
fs.cpSync(path.join(CACHE, 'pyodide'), path.join(WWW, 'pyodide'), { recursive: true });
fs.cpSync(path.join(CACHE, 'codemirror'), path.join(WWW, 'vendor', 'codemirror'), { recursive: true });
fs.cpSync(path.join(CACHE, 'fonts'), path.join(WWW, 'vendor', 'fonts'), { recursive: true });
// الأيقونات وملف manifest (المشار إليهما في الصفحة). ملف sw.js لا يُنسخ: التطبيق لا يحتاجه
const SITE = path.dirname(SRC);
if (fs.existsSync(path.join(SITE, 'java'))) fs.cpSync(path.join(SITE, 'java'), path.join(WWW, 'java'), { recursive: true });
if (fs.existsSync(path.join(SITE, 'icons'))) fs.cpSync(path.join(SITE, 'icons'), path.join(WWW, 'icons'), { recursive: true });
if (fs.existsSync(path.join(SITE, 'manifest.webmanifest'))) fs.copyFileSync(path.join(SITE, 'manifest.webmanifest'), path.join(WWW, 'manifest.webmanifest'));
console.log('www/ built (offline, no remote URLs)');
