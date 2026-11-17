# OmniCode

**تعلّم البرمجة بالعربي — بايثون و جافا من الصفر.**
Learn programming in Arabic — Python and Java, from zero.

- 🌐 الموقع: https://omniarab.netlify.app
- 📱 تطبيق أندرويد: حمّل آخر نسخة من صفحة [Releases](../../releases/latest) (ملف `.apk`)

## ما فيه

- **بايثون**: 34 درسًا في الأساسيات + NumPy + Pandas
- **جافا**: 19 درسًا في الأساسيات
- **تمارين وتحديات**: أسئلة سريعة و«اصطد الخطأ» وتحديات كتابة كود — 6 مستويات لكل لغة
- كل الأكواد تعمل **داخل المتصفح أو التطبيق** — بدون تثبيت، وبدون إنترنت بعد أول تنزيل
  (بايثون عبر [Pyodide](https://pyodide.org)، وجافا عبر [TeaVM javac](https://github.com/konsoletyper/teavm-javac))

## المجلدات

| المجلد | المحتوى |
|---|---|
| `python-arabic/` | الموقع (صفحة واحدة `index.html` + محرك جافا + Service Worker) — يُرفع كما هو على Netlify |
| `python-arabic-app/` | تطبيق أندرويد (Capacitor) يغلّف نفس الموقع ويعمل بدون إنترنت |

## نشر تحديث للتطبيق

من داخل `python-arabic-app/` (يحتاج Node.js و Android Studio و GitHub CLI):

```bash
npm run fetch-vendor        # مرة واحدة فقط على أي جهاز جديد
# اكتب ما الجديد في الملف release-notes.md، ثم:
npm run release -- 1.5
```

الأمر يرفع رقم الإصدار، ويبني ملف APK، وينشره كـ Release على GitHub.
كل من عنده التطبيق يظهر له إشعار «يوجد تحديث جديد» عند فتحه وهو متصل بالإنترنت.

> ⚠️ التحديث يُثبَّت فوق النسخة القديمة فقط إذا بُني بنفس مفتاح التوقيع (حاليًا مفتاح debug الخاص بجهاز المطوّر).
