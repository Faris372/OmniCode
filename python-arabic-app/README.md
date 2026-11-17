# بايثون بالعربي — تطبيق أندرويد (Capacitor)

هذا المجلد يغلّف موقع `../python-arabic/index.html` داخل تطبيق أندرويد حقيقي باستخدام **Capacitor 8**.

| الشيء | القيمة |
|---|---|
| اسم التطبيق | بايثون بالعربي |
| معرّف التطبيق (appId) | `app.pythonbilarabi.learn` |
| أقل إصدار أندرويد | Android 7.0 (API 24) |
| الإصدار المستهدف | API 36 |

## المتطلبات (مرة واحدة)

1. **Node.js** — مثبت مسبقًا.
2. **Android Studio** — من https://developer.android.com/studio
   يثبّت معه Java (JDK) و Android SDK تلقائيًا. افتحه مرة واحدة ودعه يكمل تنزيل الـ SDK.

## بناء التطبيق

### الطريقة 1: من Android Studio (الأسهل)

```bash
npm run sync
npm run open
```

انتظر حتى ينتهي Gradle من المزامنة، ثم:
- لتجربته على جوالك: وصّل الجوال (مع تفعيل «تصحيح USB») واضغط ▶ Run.
- لإخراج ملف APK: **Build ‹ Build App Bundle(s) / APK(s) ‹ Build APK(s)**.
  الملف يظهر في `android/app/build/outputs/apk/debug/app-debug.apk`.

### الطريقة 2: من الطرفية

```bash
npm run apk
```

يتطلب أن يكون `JAVA_HOME` مضبوطًا (مثلًا على `C:\Program Files\Android\Android Studio\jbr`).

## بعد أي تعديل على الموقع

عدّل الملف الأصلي `../python-arabic/index.html` فقط، ثم:

```bash
npm run sync
```

هذا يبني `www/` من الصفحة الأصلية (ويحوّل روابط الإنترنت إلى ملفات محلية) ثم ينسخها إلى مشروع أندرويد.

## العمل بدون إنترنت

كل ما يحتاجه التطبيق موجود داخله: محرك بايثون (Pyodide 0.26.4)، و NumPy و Pandas وما تعتمد عليه
(python-dateutil و pytz و six)، ومحرر CodeMirror، والخطوط. حجمها حوالي 49 ميجابايت قبل الضغط (APK ≈ 23 ميجابايت).

هذه الملفات تُنزّل مرة واحدة إلى `vendor-cache/` بالأمر:

```bash
npm run fetch-vendor
```

(مجلد `vendor-cache/` غير مرفوع مع المشروع؛ إذا نسخت المشروع لجهاز آخر شغّل الأمر أعلاه أولًا.)

## الأيقونة وشاشة البداية

```bash
node scripts/make-icons.js
npm run assets
```

الأول يرسم الأيقونة في `assets/`، والثاني يولّد كل المقاسات لأندرويد.

## النشر على Google Play

تحتاج نسخة **Release** موقّعة (ملف AAB):
Android Studio ‹ **Build ‹ Generate Signed App Bundle / APK** ‹ أنشئ مفتاح توقيع (keystore) واحفظه في مكان آمن — ستحتاجه لكل تحديث.

## ملاحظة عن Java 25

Android Studio الحالي يأتي مع Java 25، لذلك رفعنا Gradle في `android/gradle/wrapper/gradle-wrapper.properties` إلى 9.1.0. إذا أعدت إنشاء مجلد android من جديد فكرّر هذا التعديل.

## ملاحظات

- التطبيق لا يحتاج إنترنت إطلاقًا (تم اختباره في وضع الطيران).
- إذا حدث خطأ أثناء بدء التشغيل يظهر مربع أحمر أسفل الشاشة فيه نص الخطأ — صوّره لتشخيص المشكلة.
- `input()` يظهر كنافذة أندرويد عادية.
- زر الرجوع في الجوال: يغلق القائمة الجانبية، أو يرجع للدرس السابق، أو يخرج من التطبيق من الصفحة الرئيسية.
