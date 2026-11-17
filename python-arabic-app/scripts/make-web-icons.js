// يولّد أيقونات الموقع/تطبيق الويب (PWA) لـ iPhone و Android من assets/icon-only.png
// الناتج في ../python-arabic/icons/
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const src = path.join(__dirname, '..', 'assets', 'icon-only.png');
const out = path.join(__dirname, '..', '..', 'python-arabic', 'icons');
fs.mkdirSync(out, { recursive: true });

(async () => {
  const jobs = [
    ['apple-touch-icon.png', 180], // iPhone home screen (iOS rounds the corners itself)
    ['icon-192.png', 192],
    ['icon-512.png', 512],
    ['icon-maskable-512.png', 512], // the glyph sits inside the maskable safe zone
    ['favicon-32.png', 32],
  ];
  for (const [name, size] of jobs) {
    await sharp(src).resize(size, size).flatten({ background: '#5b5bd6' }).png().toFile(path.join(out, name));
  }
  console.log('web icons written to', out);
})();
