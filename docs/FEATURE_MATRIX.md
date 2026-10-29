# ماتریس وضعیت قابلیت‌های هم‌قدم

وضعیت این جدول بر پایهٔ کد موجود در commit مبنا، آزمون‌های محلی این دور و خواندن schema/migrations زندهٔ Supabase است. «موجود» به معنی آزمون end-to-end یا انتشار کامل نیست.

| قابلیت | وضعیت | رابط / کد | Backend / داده و مجوز | آزمون و محدودیت |
|---|---|---|---|---|
| وب فارسی و RTL | موجود | `index.html`, `src/` | Vite؛ تنظیم Supabase با کلید publishable | build وب موفق؛ مرورگر موبایل دستی بررسی نشد |
| Android/Capacitor | آمادهٔ pipeline | `capacitor.config.json`, `.github/workflows/android-apk-fixed.yml` | Supabase همان پروژه | میزبان SDK ندارد؛ APK جدید فقط از CI |
| Auth و پروفایل | موجود | `src/hamghadam-auth.js`, `src/supabase-client.js` | `profiles`, Supabase Auth، RLS | آزمون‌های واحد/امنیت؛ redirect ایمیل و دستگاه واقعی آزمایش نشده |
| پشتیبانی | موجود با محدودیت | `src/support-chat.js`, `support-admin.html` | `support_conversations`, `support_messages`, RLS، نقش `app_metadata` | تست ایستا موجود؛ provider ایمیل و E2E پشتیبانی انجام نشده |
| چت عمومی | موجود | `src/public-chat.js`, moderation و attachments | `public_chat_*`, bucket خصوصی، RLS و Realtime | تست‌های امنیت/واحد؛ sessionهای واقعی و قطع شبکه آزمایش نشده |
| گروه و کانال خصوصی | موجود | `src/hamghadam-suite.js` | `chat_*`, RPCهای `SECURITY DEFINER`, RLS | policyهای زنده خوانده شدند؛ تست نقش‌محور E2E لازم است |
| پاسخ پیام و نظرسنجی | اصلاح شد | UI چت | policyهای INSERT چت خصوصی | migration `20261029180925...` روی پروژه اعمال و تعریف نهایی تأیید شد؛ E2E چندحسابی باقی است |
| سقف گروه مباحثه | موجود | کد مجموعه | trigger/RPC، حداکثر سه عضو عادی، مسئول جدا | migrationها و آزمون‌های ایستا تأیید؛ race در محیط زنده آزمایش نشده |
| پیوست و Storage | موجود با قید زیرساخت | کلاینت پیوست | bucket خصوصی، ۵۰ MiB چت، ۱۰۰ MiB کتاب شخصی | آزمون MIME/حجم و policy ایستا؛ مجوز دانلود واقعی نقش‌محور آزمایش نشده |
| AI | backend فعال، provider نامشخص | `src/ai-assistant.js` | Edge Function فعال، سهمیه و تاریخچهٔ مالک‌محور | تست‌های ایستا؛ وجود `OPENAI_API_KEY` و پاسخ واقعی قابل تأیید نیست |
| تم‌های مناسبتی | موجود در کد | `src/hamghadam-suite.js` | `occasion_themes`, RLS و audit | آزمون منطق/اعتبارسنجی تاریخ؛ منبع تاریخ‌ها و زمان‌بندی مدیریتی نیازمند مرور محصول است |
| آزمون و فلش‌کارت | پایهٔ موجود | صفحه‌های مطالعه | جدول‌ها و RPC نمره‌دهی سمت سرور | آزمون واحد؛ استفادهٔ نقش‌دار و بررسی علمی بانک سؤال ناقص است |
| برنامه‌ریز و یادداشت | پایه، ذخیرهٔ محلی/ابری جزئی | `src/smart-planner.js`, `src/planner-calendar.js` | جدول‌های study و دادهٔ محلی قدیمی | آزمون‌های هسته؛ sync کامل، مرز timezone و برنامهٔ ماهانه/سالانه تأیید نشده |
| نقش استاد/مدیر | جزئی | `src/hamghadam-admin-console.js`, `admin.html` | Edge Function و نقش‌های `app_metadata` | تست‌های ایستا؛ آزمون جامع دسترسی هر نقش لازم است |
| اعلان درون‌برنامه‌ای | زیرساخت موجود | ماژول مجموعه | `in_app_notifications`, RLS | دادهٔ زنده فعلاً بدون رکورد؛ push در این دور تأیید نشده |
| ایمیل‌های سیستمی | نیازمند تنظیم provider | Supabase Auth/support | provider و DNS خارج از کد | ارسال واقعی، SPF/DKIM/DMARC و ترجیحات ایمیل تأیید نشده |
| OCR | تأییدنشده | پیوست تصویر هست | موتور OCR واقعی در این دور اثبات نشد | نباید قابلیت OCR فعال اعلام شود |
| انتشار وب | منتشرشده روی main قبلی | GitHub Pages workflow | `static.yml` | سایت زنده پاسخ 200 می‌دهد؛ patch branch هنوز روی Pages منتشر نشده |
| انتشار APK | فایل قبلی موجود؛ APK جدید در انتظار CI | workflowهای Android | Release با tag `android-latest` | نسخهٔ موجود ۲۴ اکتبر است؛ build جدید پس از ادغام main لازم است |
