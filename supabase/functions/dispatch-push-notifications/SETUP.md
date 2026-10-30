# راه‌اندازی Push موبایل بدون Firebase

کد ثبت دستگاه، صف ارسال و تابع ارسال در پروژه آماده است. برای فعال‌شدن تحویل واقعی روی گوشی:

1. در [Pushy Dashboard](https://dashboard.pushy.me/) یک برنامهٔ Android بسازید و شناسهٔ بستهٔ دقیق را `ir.rahetalabegi.app` وارد کنید.
2. از بخش API Authentication کلید Secret را بردارید.
3. در Supabase پروژهٔ `gnbwcupxtbsjdgnncort`، بخش Edge Functions و Secrets، کلید زیر را ثبت کنید؛ مقدار کلید را در چت یا Git قرار ندهید:

   `PUSHY_SECRET_API_KEY`

4. پس از تنظیم Secret، migration زمان‌بندی `20261030110400_schedule_mobile_push_dispatch.sql` را اعمال کنید تا صف هر دقیقه پردازش شود.
5. نسخهٔ Android را با وابستگی Pushy بسازید و روی گوشی واقعی نصب کنید. مجوز اعلان را بپذیرید و آزمایش اعلان را انجام دهید.

Pushy FCM fallback در کلاینت صریحاً خاموش شده است. یادآوری‌های برنامه‌ریزی‌شدهٔ مطالعه با اعلان محلی اندروید اجرا می‌شوند و به اینترنت یا سرویس پوش وابسته نیستند.
