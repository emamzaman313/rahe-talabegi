# راهنمای نصب از GitHub موبایل — هم‌قدم ۱.۲.۱

## مسیر مستقیم آپلود

`https://github.com/nagshe-negar/rahe-talabegi/upload/main`

1. فایل خروجی را در ریشهٔ مخزن با نام دقیق `hamghadam-phase1.zip` اضافه کن.
2. در توضیح commit بنویس: `Install Hamghadam Phase 1.2.1 moderation upgrade` و `Commit changes` را بزن.
3. به تب `Actions` برو و اجرای `Install Hamghadam Phase 1` را باز کن.
4. فقط در صورت موفقیت آزمون‌ها و build وب، تغییرات نصب‌شده تلقی می‌شوند. workflow خودش ZIP را از commit حذف می‌کند و فایل‌های نصب‌شده را commit می‌کند.

## این workflow چه کار می‌کند؟

- از فایل‌های اصلی فعلی برنامه محافظت می‌کند؛ فایل‌های اصلی چت و دستیار با نسخهٔ قدیمی بسته جایگزین نمی‌شوند.
- فایل‌های جدید گزارش/نظارت، migrationها و آزمون را اضافه می‌کند.
- پیش از تغییر فایل‌های entrypoint از آن‌ها backup می‌گیرد.
- آزمون‌های Node و build وب را اجرا می‌کند و تنها در صورت موفقیت تلاش به commit دارد.

## چه کار نمی‌کند؟

- به‌جای تو روی Supabase SQL اجرا نمی‌کند.
- Secret یا Service Role key ایجاد/تغییر نمی‌دهد.
- اثبات نمی‌کند درخواست واقعی مدل AI یا حساب‌های واقعی چت موفق‌اند.
- APK نهایی را در همین workflow نمی‌سازد؛ ساخت APK را از workflow اندروید تأییدشده جداگانه اجرا کن.

## بعد از سبز شدن workflow

فایل‌های زیر را با backup و در محیط آزمایشی بررسی کن، سپس در پروژهٔ Supabase متصل به برنامه به‌ترتیب اجرا کن:

1. `supabase/migrations/20261029140000_public_chat_moderation_and_reports.sql`
2. `supabase/migrations/20261029160000_public_chat_moderation_actions.sql`
3. `supabase/migrations/20261029170000_discussion_group_capacity_guard.sql`
4. `supabase/migrations/20261029180000_public_chat_moderation_target_guard.sql`

پس از آن با حداقل دو حساب آزمایش کن: کاربر عادی و ناظر. اگر ساختار جدول یا نام نقش‌های فعلی متفاوت است، پیش از اجرای migration با آن تطبیق بده؛ هیچ دیتابیسی را reset نکن.


**پیش‌بررسی ظرفیت گروه:** اگر گروهی از قبل بیش از سه عضو عادی داشته باشد، migration سقف گروه عمداً با پیام خطا متوقف می‌شود و هیچ عضوی را خودکار حذف نمی‌کند. آن عضویت را دستی بررسی کن و پس از backup دوباره اجرا کن.
