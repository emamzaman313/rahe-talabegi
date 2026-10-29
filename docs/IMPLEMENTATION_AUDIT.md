# گزارش ممیزی اجرایی هم‌قدم

تاریخ: ۲۹ اکتبر ۲۰۲۶

## مبنا و دامنه

- مخزن: `nagshe-negar/rahe-talabegi`
- شاخهٔ مبنا: `main`
- commit مبنا: `ac2695be750cdbeab71c582227a4df426f1d4185`
- شاخهٔ کاری: `codex/baseline-integrity-and-audit`
- پروژهٔ Supabase متصل: `rahe-talabegi-app`، منطقهٔ `eu-west-1`، وضعیت `ACTIVE_HEALTHY`
- این گزارش فقط آزمون‌هایی را که واقعاً اجرا شدند و وضعیت زنده‌ای را که ابزار متصل خواند ثبت می‌کند. خواندن schema و advisoryها روی پروژهٔ واقعی انجام شد؛ آزمون end-to-end با حساب آزمایشی مجزا انجام نشده است.

## تغییرهای این دور

1. محتوای راه‌دانِ embedشده در `index.html` با `source/rahdan.html` همگام و newlineهای embed به LF استاندارد شد؛ آزمون اکنون مستقل از CRLF/LF سیستم‌عامل است.
2. policy درج پاسخ چت اصلاح شد تا پیام والد واقعاً با `reply_to` و همان گفتگو تطبیق کند.
3. policy رأی نظرسنجی اصلاح شد تا گزینه واقعاً متعلق به همان نظرسنجی باشد.
4. policy ایجاد مسدودسازی از subquery بازگشتی به همان جدول پاک شد؛ محدودیت جدول همچنان ایجاد مسدودسازی شخص را منع می‌کند.
5. migration افزایشی `20261029180925_fix_private_chat_policy_correlations.sql` روی پروژهٔ Supabase اعمال شد. فهرست migrationهای زنده همین نسخه را ثبت می‌کند و تعریف هر سه policy پس از اجرا دوباره خوانده و تأیید شد. هیچ ردیفی تغییر یا حذف نشد.

## آزمون‌ها و ساخت

- پیش از تغییر: `npm test` برابر ۸۵ موفق و ۱ ناموفق از ۸۶؛ شکست به علت embed قدیمی راه‌دان بود.
- پیش از نصب وابستگی‌ها: build وب اجرا نشد چون `vite` نصب نبود.
- پس از تغییر: `npm test` برابر ۸۹ موفق و صفر ناموفق.
- `npm run build`: موفق؛ Vite خروجی وب را در `dist/` ساخت.
- `npm audit --omit=dev`: صفر آسیب‌پذیری در وابستگی‌های runtime.
- `npm audit`: سه هشدار متوسط در زنجیرهٔ توسعه، شامل `@capacitor/cli@8.5.3` و dependencyهای `uuid`/`xcode`. مسیر رفع خودکار npm، CLI را به `8.6.0` ارتقا می‌دهد؛ چون این تغییر با نسخه‌های ثابت Capacitor و ابزار Android پیوند دارد، بدون ساخت native و بازبینی سازگاری در این patch اعمال نشد.
- Android SDK و `adb` روی میزبان موجود نیستند؛ ساخت و نصب APK محلی تأیید نشد.

## وضعیت سرویس زنده

- migrationهای پشتیبانی، پروفایل، چت عمومی، AI، مجموعهٔ هم‌قدم، پیوست ۵۰ MiB، رفع مجوز ایجاد گروه/کانال و محافظت گروه در تاریخچهٔ migration زنده دیده شدند.
- جدول‌های عمومی مشاهده‌شده RLS روشن داشتند. جدول `ai_rate_windows` عمدی فقط برای service role قابل دسترسی است و policy کاربری ندارد؛ Edge Function سهمیه را سروری مصرف می‌کند.
- Edge Functionهای `hamghadam-ai` و `hamghadam-admin` فعال‌اند و JWT را بررسی می‌کنند.
- `SECURITY DEFINER`های RPC به `authenticated` مجوز دارند؛ در migrations محلی برای عملیات حساس، هویت نشست، مالکیت، عضویت، نقش یا محدودیت سرور بررسی می‌شود. هشدار advisor به‌تنهایی اثبات نقص دسترسی نیست. بازبینی کامل هر مسیر با حساب‌های نقش‌دار و آزمون IDOR هنوز لازم است.
- Advisor عملکرد دربارهٔ شاخص‌های FK، اجرای توابع auth در policy و چند policy مجاز هم‌پوشان هشدار داده است. این‌ها نیاز به بازبینی بار واقعی و query plan دارند؛ شاخص unused را بدون دادهٔ بار و تحلیل حذف نکن.
- bucketهای گفتگو خصوصی‌اند؛ سقف bucketهای چت ۵۰ MiB و کتاب شخصی ۱۰۰ MiB است. این ممیزی، مجوز دانلود با حساب عضو/غیرعضو را در محیط زنده آزمایش نکرد.
- وجود کلید مدل OpenAI در secret store قابل خواندن نیست؛ اتصال واقعی provider و ارسال زندهٔ prompt تأیید نشده است.

## انتشار

- سایت GitHub Pages در `https://nagshe-negar.github.io/rahe-talabegi/` پاسخ HTTP 200 می‌دهد.
- workflow `40929613789` روی commit `1ac4071773def3353b39af57e8fd7f87121f6e67` با موفقیت کامل شد: ۸۹ تست، build وب، assembleDebug، `apksigner verify` و بررسی package `ir.rahetalabegi.app` و target SDK 36.
- assetهای release `android-latest` در ۲۹ اکتبر ۲۰۲۶ به‌روزرسانی شدند. APK با حجم 6,729,654 بایت و SHA-256 برابر `c176eee020aaa4251981602ada26528b248c70efbf189ad3bf52ee857db319c9` منتشر شد.
- این APK با کلید debug امضا شده است؛ برای انتشار Google Play به signing key و تنظیم امن آن نیاز است. نصب روی دستگاه واقعی در این دور انجام نشد.
- workflow `static.yml` برای commit `1ac4071` با موفقیت سایت را deploy کرد. workflow `finish-hamghadam.yml` همان commit را تست/build کرد و سپس APK را ساخت، بررسی و روی release `android-latest` منتشر کرد.
- Vercel برای این پروژه متصل نیست؛ میزبان وب فعلی GitHub Pages است.

## موانع تکمیل کامل اَبَرپرامپت

این patch یک اصلاح مشخص امنیتی و سلامت build است، نه تکمیل همهٔ قابلیت‌های فهرست بلند اَبَرپرامپت. هنوز باید به‌طور جداگانه E2E نقش‌ها و RLS، ایمیل و Auth redirects، provider واقعی AI، پشتیبانی end-to-end، لینک عمیق Android، تجربهٔ دستگاه واقعی، محتوای علمی، اعلان push، OCR و برنامه‌ریز کامل آزموده یا تنظیم شوند. APK جدید فقط پس از build موفق GitHub Actions روی commit منتشرشده قابل تحویل است.

منبع‌های کمکی موجود در Downloads بررسی شدند: `webapp-master.zip` کلاینت Tinode Web است و به backend مستقل Tinode نیاز دارد؛ `open-webui-main.zip` یک پلتفرم مستقل با backend و deployment جداست. هیچ‌کدام به‌عنوان کد قابل‌کپی/اجرا به برنامه وارد نشدند. فایل `Hamghadam_All_In_One/quality-update-kit/scripts/apply-integration.mjs` در clone و branchهای موجود پیدا نشد؛ اجرا نشده است. `docs/CHAT-AI-INTEGRATION.md` و `tests/chat-ai-integration.test.mjs` در خود مخزن موجود و بررسی شدند.
