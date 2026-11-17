// ينشر تحديثًا جديدًا للتطبيق على GitHub Releases
// الاستخدام:
//   1) اكتب ملاحظات التحديث في الملف release-notes.md (تظهر للمستخدمين في نافذة التحديث)
//   2) npm run release -- <رقم الإصدار>        مثال:  npm run release -- 1.5
// الخطوات: يرفع versionName/versionCode ← يبني www وملف APK ← ينشئ Release على GitHub ويرفع الملف.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const APP = path.join(__dirname, '..');
const cfg = JSON.parse(fs.readFileSync(path.join(APP, 'release.config.json'), 'utf8'));
const [version] = process.argv.slice(2);
if (!version || !/^\d+(\.\d+){1,2}$/.test(version)) {
  console.error('اكتب رقم الإصدار، مثل:  npm run release -- 1.5   (والملاحظات في release-notes.md)');
  process.exit(1);
}
// الملاحظات تُقرأ من ملف (تمرير نص متعدد الأسطر عبر npm في ويندوز يقطعه عند أول سطر)
const notesFile = path.join(APP, 'release-notes.md');
if (!fs.existsSync(notesFile) || !fs.readFileSync(notesFile, 'utf8').trim()) {
  console.error('اكتب ملاحظات التحديث أولًا في الملف release-notes.md');
  process.exit(1);
}
const GH = process.platform === 'win32' && fs.existsSync('C:/Program Files/GitHub CLI/gh.exe') ? 'C:/Program Files/GitHub CLI/gh.exe' : 'gh';
const run = (cmd, args, opts = {}) => execFileSync(cmd, args, Object.assign({ stdio: 'inherit', cwd: APP, shell: process.platform === 'win32' && !/\.exe$/i.test(cmd) }, opts));

// 1) version in android/app/build.gradle
const gradle = path.join(APP, 'android', 'app', 'build.gradle');
let g = fs.readFileSync(gradle, 'utf8');
const oldCode = +(g.match(/versionCode\s+(\d+)/) || [])[1];
const oldName = (g.match(/versionName\s+"([^"]+)"/) || [])[1];
g = g.replace(/versionCode\s+\d+/, 'versionCode ' + (oldCode + 1)).replace(/versionName\s+"[^"]+"/, 'versionName "' + version + '"');
fs.writeFileSync(gradle, g);
console.log(`version ${oldName} (${oldCode}) → ${version} (${oldCode + 1})`);

// 2) build web + APK
run('npm', ['run', 'sync']);
const gradlew = process.platform === 'win32' ? 'gradlew.bat' : './gradlew';
run(path.join(APP, 'android', gradlew), ['assembleDebug', '--console=plain'], { cwd: path.join(APP, 'android'), shell: process.platform === 'win32' });
const apkSrc = path.join(APP, 'android', 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk');
fs.mkdirSync(path.join(APP, 'dist'), { recursive: true });
const apk = path.join(APP, 'dist', `OmniCode-${version}.apk`);
fs.copyFileSync(apkSrc, apk);
console.log('APK:', apk, (fs.statSync(apk).size / 1048576).toFixed(1) + ' MB');

// 3) GitHub release (the app checks /releases/latest for a newer tag)
run(GH, ['release', 'create', 'v' + version, apk, '--repo', cfg.repo, '--title', `OmniCode ${version}`, '--notes-file', notesFile, '--latest']);
console.log(`✅ نُشر الإصدار ${version} — سيظهر إشعار التحديث لكل المستخدمين.`);
console.log('تذكير: احفظ تعديل رقم الإصدار في git:  git commit -am "Release ' + version + '" && git push');
