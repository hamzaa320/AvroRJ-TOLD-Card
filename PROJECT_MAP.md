# PROJECT_MAP — AvroRJ TOLD Card (RJ100-Loadsheet)

> آخر تحديث: 2026-11-03 · الحالة: **المنتج مكتمل** — قسم [ORPHANS & PENDING] فارغ.

## [SYSTEM_FLOW] — رحلة المستخدم

```
اختيار الطائرة (5A-FLE / 5A-FLM / 5A-FLF)
        │
        ▼
[ واجهة 1 — Performance Data ]
   Date (تلقائي) → Airport Code (ICAO) → Elevation + قائمة RWY من AirportData
   → CATERING CODE (P/A/B) + CREW CODE (2/0…3/3) → DOM (جدول الطائرة)
   → EPL (نافذة حاسبة payload: Adults×84 + Child×46 + Infant×15 + Cargo + FlyAway 250)
   → EZFM = DOM + EPL → T/O FUEL → ETOM = EZFM + T/O FUEL
   → WIND (DIR/SPD) → H/T Component (cos)
   → QNH → PRESS ALT = (1013 − QNH) × 30 + Elevation
   → OAT → جداول RJ100 → N1 REF / T REDU / N1 REDU
   → صندوقا Bleed Correction و ETOM/TMAX (محجوزان — TMAX افتراضياً +50°)
        │  (الواجهة 1: زر «Clear» · الواجهة 2: زر «⎙ Save PDF» في الشريط السفلي)
        ▼
[ واجهة 2 — T/O & LDG Data ]
   Flight # = TLR + أرقام
   ATOM = round(ETOM/1000) طُن
        → V1 (= VR − 4) / VR / V2 (حسب Weight+Flap) · VFTO/VER (حسب Weight)
   FLAP/ATIS/QNH/RWY (من واجهة 1)
   N1 REF / N1 REDU (من واجهة 1) · N1 CLIMB / N1 MCT (حسب BLEEDS/ANT-ICE)
   Landing: ELM (27…46، تُعرض مع **T**) → VREF و VFTO · N1 GA = N1 REF (PA = Elevation لمطار الهبوط)
        └─► زر ⎙ Save PDF: يولّد PDF (قالبان page+template told_final) بالقيم الحالية
             بحجم 75×185 مم باسم TLR<flight>_<YYYY-MM-DD>.pdf
             ثم يُنزّل محلياً، ويُرفع تلقائياً إلى **مجلد Drive الموحّد** عبر Web App، أو يُوضع في طابور عند عدم الاتصال.
```

القائمة (☰): EPL · **Save PDF** (الواجهة 2 فقط) · **Clear** (الواجهة 1 فقط) · Copy.   (Cloud storage **مخفية** — تُفتح بضغط شعار التطبيق 2.5 ثانية للمُخوّلين فقط)
تبديل الثيم: مفتاح ☀/☾ في الهيدر (بدون نص) · قائمة "Airport list" و"About" أُزيلت من القائمة.
الحقول الرقمية تفتح لوحة أرقام كبيرة (بدون حروف) · الـ keypad يظهر فوق نافذة EPL (z-index إقلاع 130).

## [ARCHITECTURE] — بنية الملفات

| الملف | المسؤولية |
|---|---|
| `index.html` | الواجهة + CSS + تسجيل الـ Service Worker + مُسجِّل الأخطاء العام + أيقونات القائمة/الهيدر |
| `rjload-data.js` | البيانات: `AC_DOM` · `AIRPORTS` (88 رمز ICAO) · `RJ.*` |
| `rjload-core.js` | حساب خالص بلا DOM |
| `rjload-app.js` | ربط الواجهة: تبويبات، لوحة الأرقام، EPL، سلسلة الحساب، ☰ menu، Cloud settings |
| `rjload-pdf.js` | مولّد PDF (يركّب قيم الحقول فوق القالب `told_final` بإحداثيات مقاسة) |
| `rjload-drive.js` | رفع PDF إلى **Google Drive عبر Web App (Apps Script)** — مجلد مركزي، بلا OAuth |
| `GOOGLE_DRIVE_SETUP.md` | خطوات نشر الـ hook (مرة واحدة) |
| (الموقع) `https://hamzaa320.github.io/AvroRJ-TOLD-Card/` | **GitHub Pages مباشر** — نفس فكرة مستودع `RJ100` (فرع `main` من الجذر)، يعمل على iOS |
| `GoogleDrive_Hook.gs` | كود Apps Script الجاهز (doGet/doPost + token + X-اسْتبدال بنفس الاسم) |
| `rjload-queue.js` | **طابور رفع دون اتصال** (IndexedDB): يحفظ الـ PDF ويرفعه تلقائياً عند عودة الاتصال |
| `told_final_b64.js` | القالب `told_final.pdf` مُضمَّن base64 (للتصدير دون إنترنت) |
| `pdf-lib.min.js` | مكتبة PDF للتوليد (UMD، تعمل offline) |
| `sw.js` | Service Worker (cache-first، `CACHE = rjload-v5`) |
| `logo.png` | شعار AIR LIBYA (بنفس الملف في الهيدر وعنواني الجدولين) |

## [DATA_MAP] — مصادر البيانات ومطابقتها

| الجدول | المصدر | الحالة |
|---|---|---|
| DOM لكل طائرة | صور "Variable Dry Operating Mass/Index" | ✅ مطابق |
| AIRPORTS (88 ICAO) | `AirportData.pdf` · المخطط يتغلب على السجل عند الاختلاف | ✅ مطابق |
| `RJ.N1_REF` / `RJ.CLIMB` / `RJ.MCT` | `RJ100-main` | ✅ مطابق حرفياً (مُتحقق برمجياً) |
| `RJ.SPEEDS` | `RJ100-main` | ✅ مطابق |

## [DECISIONS] — القرارات المعتمدة
- **N1 GA = N1 REF** (قرار المستخدم) بمعدلة OAT وضغط الارتفاع = Elevation لمطار الهبوط.
- **TOLD2: OAT/Dew/QNH فارغة** · ATIS تُنسخ من TOLD1 فقط · ELM افتراضي 33 · FLAP LDG افتراضي 33 · FLAP TOLD1 افتراضي 18.
- **N1 CLIMB/MCT** تُختار آليًا من BLEEDS/ANT-ICE (لا قوائم تكوين إضافية).
- **ATOM**: round half-up لكل 1000 كجم.
- **PRESS ALT = (1013 − QNH) × 30 + Elevation**.
- **WIND H/T**: `cos((DIR − RWY×10)°) × SPD`.
- **PDF Export**: قالبان (TOLD1 + TOLD2) من `told_final.pdf` بحجم 75×185mm مع حفظ نسبة المحتوى بعرض الصفحة؛ الاسم `TLR<رقم>_<YYYY-MM-DD>.pdf`؛ المحتوى يملأ العرض؛ صناديق Bleed/RTOM/QNH Corrected محجوزة (فارغة)؛ يُسحب **ETOM** إلى قسم TMAX + **TMAX = +50°** + **V1 من RTOM Table** + **Corrected V1/VR/V2**؛ علامات ✓ للـ Bleeds/ANT-ICE.
- **لا يمكن للتطبيق الكتابة على ملف** — التنزيل عبر المتصفح (iPad/iOS: Files app).
- **Google Drive (Apps Script hook)**: تُدخل في ☰ → Cloud storage **رابط Web App (/exec)** و**رمز سري**؛ التطبيق يرسل `{token, filename, flight, base64}` بـ `mode:'no-cors'`، والسكريبت يُنشئ `RJ Load Sheets/<flight>/TLR….pdf` ويستبدل أي ملف بنفس الاسم (لا تكرار). لا OAuth ولا حسابات على الأجهزة.
- **طابور الرفع (Offline queue)**: إذا كان الجهاز غير متصل (أو فشل الرفع) يُخزَّن الملف في **IndexedDB** ويُرفع تلقائياً عند أحداث `online` + محاولة دورية كل دقيقة + عند كل تشغيل. العناصر الناجحة تُحذف، والفاشلة تبقى لإعادة المحاولة.
- **DH/DA**: القيمة الافتراضية `V`، ويقبل أرقاماً؛ الأحرف تُحوَّل تلقائياً للأحرف الكبيرة (و`V` فقط مسموح كحرف).
- **Cloud**: حروف إنجليزية كبيرة فقط عبر CSS + فلتر إدخال/تغيير/خروج + HTML (للحقول النصية).
- **Supabase محذوف** — تم الاستغناء عنه نهائياً (استُبدل بمسار Google Drive الموحّد).
- **Action bar + القائمة**: الواجهة 1 تُظهر **Clear** فقط، والواجهة 2 تُظهر **Save PDF** فقط (يتبدّلان حسب التبويب في الشريط والقائمة معاً).
- **Cloud storage (المُخوّلون فقط)**: حُذفت من القائمة تماماً؛ تُفتح عبر **ضغطة مطوّلة على شعار AIR LIBYA (2.5 ث)** — لا توجد أي مؤشرات مرئية في الواجهة العادية.
- **ELM يُعرض مع T** (مثل ATOM) في الواجهة **وفي PDF** — دلالة على الوزن بالاطنان.
- **ملف البيانات `rjload-data.js`**: عدّل المستخدم قيم Elevation/الممرات وأضاف المطار **HLMT** — تقبّل كما هو (لم يُمسّ أي قيمة أخرى).

## [VERIFICATION] — نتائج التحقق
- ✅ **النشر المباشر على GitHub Pages (hamzaa320):** `https://hamzaa320.github.io/AvroRJ-TOLD-Card/` — الصفحة تُحمَّل 200، كل الأصول (index/logo/كل السكربتات) 200، **لا Console Errors**، Service Worker **registered + activated** → يعمل على iOS (إضافة للشاشة الرئيسية)، اسم التطبيق `RJ100 Load Sheet`، meta `apple-mobile-web-app-*` مضافة.
- ✅ مطابقة كل جداول RJ100 بالكامل مع المصدر (تم إصلاح أخطاء نَسخ سابقة).
- ✅ التدفق الكامل في المتصفح بلا Console Errors (TOLD1/TOLD2، EPL عبر لوحة الأرقام، صحة الحسابات: EPL 9110، ATOM 41T، V1/VR/V2/VFTO=128/132/139/183).
- ✅ تصدير PDF: يولَّد `TLR454_2026-11-03.pdf` (75×185mm) ويحتوي قيم الحقول في مواضعها بخط واضح؛ أُعيد التحقق بصرياً للدقّة.
- ✅ لوحة الأرقام تظهر **فوق** نافذة EPL (z-index 130 > 110).
- ✅ القائمة ☰ تُظهر فقط: EPL · Clear · Copy — حُذفت Airport list وAbout.
- ✅ الثيم مفتاح بصري فقط (☀/☾) بلا نص.
- ✅ تبويبات: "Performance Data" و"T/O & LDG Data" (بلا ترقيم).
- ✅ FLAP TOLD1 افتراضي 18 · FLAP LDG افتراضي 33 (Clear يُعيد 18 لـ TOLD1 و33 لـ LDG).
- ✅ مفتاح الهوية: نفس `logo.png` (wings) في الهيدر وعنواني الجدولين.
- ✅ أخطاء الحساب تُسجَّل بـ `[RJLoad ERROR]`؛ `window.onerror` + `unhandledrejection` مُفعّلة.
- ✅ script URLs مُضاف لها `?`?v=12` لتفادي heuristic caching + SW `rjload-v12`.
- ✅ **تعديل 2026-11-04 (جولة 5):**
  - **Cloud storage حُذفت من القائمة** وتُفتح فقط عبر **ضغطة مطوّلة على الشعار (2.5 ث)** — وظيفته موجودة للمالك، غير مرئية للمستخدمين.
  - **HLMT** يعمل: يُظهر Elevation 1235 ft وقائمة ممرات 14/32 تلقائياً.
  - **ELM يعرض T** بجانب القائمة (وPDF يعرض `33 T`).
  - التحميل بلا أخطاء Console؛ تصدير PDF يعمل (`TLR321_2026-11-05.pdf`).
- ✅ **تعديل 2026-11-03 (جولة 4 — الصفحة المركزية على Google Drive):**
  - **Supabase محذوف نهائياً** (rjload-cloud.js + supabase_setup.sql + إعدادات URL/anon key/bucket).
  - **Google Apps Script hook** (`GoogleDrive_Hook.gs` + `GOOGLE_DRIVE_SETUP.md` + وحدة `rjload-drive.js`): ترفع كل الأجهزة إلى **مجلد واحد** `RJ Load Sheets/<flight>/TLR….pdf`، استبدال بنفس الاسم (لا تكرار). لا OAuth ولا حسابات على الأجهزة.
  - مفتاح الرفع بزر **Test** يمكنّه التحقق: GET → `RJLH-OK`.
  - **طابور الرفع دون اتصال** مُبقّى كما سبق لكنه يستدعي hook بدل Supabase — مُتحقق (online/offline/reload).
  - تبقى التوثيق `GOOGLE_DRIVE_SETUP.md` لخطوات النشر لمرة واحدة.
- ✅ **تعديل 2026-11-03 (جولة 3):**
  - **Save PDF في الواجهة 2 فقط** و**Clear في الواجهة 1 فقط** — في الشريط السفلي **وفي القائمة ☰** معاً (مُتحقق: تبديل التبويب يبدّل الزرّين والقائمة).
  - **Cloud**: حروف كبيرة إنجليزية فقط (فلتر input/change/blur + CSS) — مُتحقق.
  - **DH/DA**: القيمة الافتراضية `V`، يقبل أرقاماً، والأحرف تُكبر تلقائياً — مُتحقق (`v`→`V`، `abc12`→`12`، `200`→`200`)، وClear يُعيدها `V`.
  - **طابور الرفع دون اتصال** (`rjload-queue.js` + IndexedDB): مُتحقق — عنصر يُحفظ عند offline، ثم `online` يرفعه تلقائياً ويحذفه؛ يبقى محفوظاً بعد إعادة تحميل الصفحة؛ الفشل يُبقي العنصر لإعادة المحاولة.
  - تحميل نظيف بلا أخطاء Console؛ توليد `TLR321_2026-11-03.pdf` بنجاح (No Regression).

## [ORPHANS & PENDING]
- ⏳ **النشر لمرة واحدة لكل الحساب** (خارج الكود): فتح `GOOGLE_DRIVE_SETUP.md` → نسخ `GoogleDrive_Hook.gs` إلى Apps Script → نشر Web App (Execute as **Me**, Access **Anyone**) → إدخال الرابط `/exec` + TOKEN في كل iPad (☰ → Cloud storage → Save). مجلد `RJ Load Sheets` يُنشأ تلقائياً.
- ملاحظات تقنية مؤكدة: لا OAuth ولا Client ID في الكود إطلاقاً؛ كل PDF ~677KB يُرسل base64 داخل JSON — ضمن حدود Apps Script (~50MB/يوم للوصول المجهول).
- لا توجد متغيرات سرّية مضمّنة في الكود — TOKEN و/exec يُدخلان يدوياً من الواجهة ويُحفظان داخل `localStorage`.

### عناصر أُزيلت في هذه الجولة
`rjload-cloud.js` · `supabase_setup.sql` · إعدادات Supabase من الـ Modal (URL/anon key/Bucket) · زر Sign out/In (لا حاجة له).

### ملاحظات/حدود معروفة
- **N1 GA** يأخذ قيمة N1 REF (لا توجد جداول GA في بيانات المصدر) — قرار المستخدم.
- صناديق **Bleed/RTOM/QNH Correction** تبقى فارغة لحين استلام الجداول.
- التنزيل على iPad/iOS يذهب إلى **Files app** (OpenCode تحكمه).

## [CHANGELOG]
1. بناء التطبيق الكامل (واجهتا told1/told2 + PWA + لوحة أرقام + نافذة EPL).
2. TOLD2: OAT/Dew/QNH مستقلة، Elevation، RWY/ATIS/ELM…، N1 GA = N1 REF (PA = Elevation).
3. مطابقة البيانات مع `RJ100-main` آلياً وإصلاح أخطاء النسخ.
4. Logger عام + try/catch حول الحسابات + `onerror` مفعل.
5. حذف الـ CSS والكود الميت؛ إضافة علامات النسخ `v` للسكربتات؛ ترقية SW إلى v4.
6. **التعديلات الجراحية (2026-11-03):**
   أ. تبويبات بلا ترقيم: "Performance Data" · "T/O & LDG Data".
   ب. شعار AIR LIBYA في الهيدر + نفس الأيقونة في عنواني الجدولين.
   ج. لوحة الأرقام تظهر فوق نافذة EPL (z-index 130) + onclick fallback للـ iPad.
   د. FLAP افتراضي 18 في TOLD1 · 33 في LDG فقط.
   هـ. خط "TLR" في حقل Flight # أكبر (1.15em).
   و. مفتاح ثيم بصري (☀/☾) في الهيدر بلا نص؛ أُخفي Airport list وAbout من القائمة.
   ز. زر "⎙ Save PDF" بدل Clear في الشريط السفلي: يولّد PDF مطابق للقالب (75×185mm) بالكامل مع حفظ البيانات على الورقة.
7. كتابة/تحديث `README.md` و`PROJECT_MAP.md`.
8. **التعديلات الجراحية (2026-11-03 — جولة 2):**
   أ. **Clear** في الواجهة 1 و**Save PDF** في الواجهة 2 فقط (تبديل ديناميكي حسب التبويب)، وكذلك في القائمة.
   ب. خانة **Cloud**: حروف إنجليزية كبيرة فقط (CSS + فلتر إدخال).
   ج. **رفع Supabase**: وحدة `rjload-cloud.js` + نافذة إعدادات (☰ → Cloud storage) + رفع تلقائي بعد التنزيل.
   د. تحديث `sw.js` إلى `rjload-v5` وإضافة `rjload-cloud.js` للأصول، وترقية `?v=5`.
9. **التعديلات الجراحية (2026-11-03 — جولة 3):**
   أ. **Save PDF في الواجهة 2 فقط** و**Clear في الواجهة 1 فقط** — في الشريط وفي القائمة ☰ معاً.
   ب. **Cloud**: حروف كبيرة إنجليزية فقط (فلتر input/change/blur).
   ج. **DH/DA**: القيمة الافتراضية `V`، يقبل أرقاماً، يحوّل الأحرف للأحرف الكبيرة.
   د. **طابور الرفع دون اتصال**: `rjload-queue.js` (IndexedDB) — رفع تلقائي عند `online` + محاولة دورية + دخول عند التشغيل؛ عناصر فاشلة تبقى لإعادة المحاولة.
   هـ. `rjload-cloud.js`: خيار `silent` لتفادي تكرار التنبيهات أثناء تفريغ الطابور.
   و. تحديث `sw.js` إلى `rjload-v8`، إضافة `rjload-queue.js` للأصول، وترقية `?v=8`.
10. **التعديلات الجراحية (2026-11-03 — جولة 4):**
    أ. **استبدال Supabase بالكامل** بخط أنابيب **Google Drive عبر Apps Script** (`rjload-drive.js` + `GoogleDrive_Hook.gs` + `GOOGLE_DRIVE_SETUP.md`): مجلد واحد `RJ Load Sheets/<flight>/TLR….pdf`، استبدال بنفس الاسم (لا تكرار)، بلا OAuth ولا حسابات على الأجهزة.
    ب. حذف `rjload-cloud.js` و`supabase_setup.sql` وإعدادهما من الواجهات والاختبارات.
    ج. إعدادات `☰ → Cloud storage`: رابط `/exec` + رمز سري (TOKEN) فقط؛ زر **Test** يتحقق عبر GET (`RJLH-OK`).
    د. التحقق في المتصفح: POST `{token,filename,base64}` بنمط `no-cors` + GET cors؛ والطابور offline→online مُتحقق end-to-end.
    هـ. تحديث `sw.js` إلى `rjload-v10`، حذف `rjload-cloud.js` من الأصول، وترقية `?v=10`.
11. **التعديلات الجراحية (2026-11-04 — جولة 5):**
    أ. **إخفاء Cloud storage نهائياً من ☰** (حُذف الزر)؛ تُفتح فقط عبر **ضغطة مطوّلة على الشعار (2.5 ث)** — لمالك التطبيق فقط.
    ب. **ELM يعرض T** بجانب القائمة (الوزن بالاطنان)؛ PDF يعرض `<n> T` بالفعل.
    ج. **ملف البيانات للمستخدم:** إضافته للمطار **HLMT** (1235 ft، ممرات 14/32) وتعديلاته على الارتفاعات/الممرات تُقبل كما هي — لم يُمسّ أي شيء آخر.
    د. التحقق: التحميل بلا أخطاء؛ `HLMT` → Elevation 1235 ft وقائمة ممرات 14/32 تلقائياً؛ فتح Cloud عبر الإمساك بالشعار فقط (والقائمة لا تحويه).
    هـ. تحديث `sw.js` إلى `rjload-v12`، وترقية `?`?v=12`.
