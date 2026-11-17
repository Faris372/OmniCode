// يرسم أيقونة التطبيق وشاشة البداية (SVG ← PNG) في مجلد assets/
// ثم: npm run assets  لتوليد كل المقاسات المطلوبة لأندرويد
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const out = path.join(__dirname, '..', 'assets');
fs.mkdirSync(out, { recursive: true });

const bg = (size) => `
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 1024 1024">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#7c7cf0"/><stop offset="1" stop-color="#4343b8"/>
    </linearGradient>
    <radialGradient id="h" cx="0.25" cy="0.2" r="0.8">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.22"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="1024" height="1024" fill="url(#g)"/>
  <rect width="1024" height="1024" fill="url(#h)"/>
</svg>`;

// الرمز: </>  — قوسان أبيضان وخط مائل أصفر (داخل المنطقة الآمنة للأيقونات المتكيّفة)
const glyph = `
  <g fill="none" stroke-linecap="round" stroke-linejoin="round">
    <path d="M384 356 L248 512 L384 668" stroke="#ffffff" stroke-width="76"/>
    <path d="M640 356 L776 512 L640 668" stroke="#ffffff" stroke-width="76"/>
    <path d="M566 330 L458 694" stroke="#FFD43B" stroke-width="68"/>
  </g>`;

const fg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">${glyph}</svg>`;

const full = `
<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#7c7cf0"/><stop offset="1" stop-color="#4343b8"/>
    </linearGradient>
  </defs>
  <rect width="1024" height="1024" fill="url(#g)"/>
  <g transform="translate(512 512) scale(1.18) translate(-512 -512)">${glyph}</g>
</svg>`;

const splash = (bgColor) => `
<svg xmlns="http://www.w3.org/2000/svg" width="2732" height="2732" viewBox="0 0 2732 2732">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#7c7cf0"/><stop offset="1" stop-color="#4343b8"/>
    </linearGradient>
  </defs>
  <rect width="2732" height="2732" fill="${bgColor}"/>
  <rect x="1066" y="1066" width="600" height="600" rx="150" fill="url(#g)"/>
  <g transform="translate(1066 1066) scale(0.5859375)">${glyph}</g>
</svg>`;

(async () => {
  await sharp(Buffer.from(full)).png().toFile(path.join(out, 'icon-only.png'));
  await sharp(Buffer.from(fg)).png().toFile(path.join(out, 'icon-foreground.png'));
  await sharp(Buffer.from(bg(1024))).png().toFile(path.join(out, 'icon-background.png'));
  await sharp(Buffer.from(splash('#f5f7f9'))).png().toFile(path.join(out, 'splash.png'));
  await sharp(Buffer.from(splash('#0d1117'))).png().toFile(path.join(out, 'splash-dark.png'));
  console.log('icons written to', out);
})();
