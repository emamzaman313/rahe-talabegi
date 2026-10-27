-- هم‌قدم: زیرساخت مباحث، پیام‌رسان چندنوعی، مدیریت، تم‌های مناسبتی، میز مطالعه و آزمون
-- پس از پشتیبانگیری و بازبینی schema روی پروژه هدف اجرا شود. این فایل توسط CI خودکار روی دیتابیس اعمال نمی شود.
-- هیچ کلید service_role یا کلید خصوصی در این مهاجرت ندهید.

اگر طرحواره خصوصی وجود ندارد، آن را ایجاد کنید؛
لغو همه موارد در طرحواره خصوصی از طرحواره عمومی و ناشناس؛
اعطای مجوز استفاده از طرحواره خصوصی به احراز هویت‌شده؛

---------------------------
-- نقش‌های مورد اعتماد
---------------------------
ایجاد یا جایگزینی تابع private.hgd_is_admin()
مقدار بولی را برمی‌گرداند
تعریف‌کننده امنیت پایدار زبان SQL
تنظیم مسیر جستجو = ''
به عنوان $$
  انتخاب coalesce(auth.jwt()->'app_metadata'->>'role','') در ('admin','super_admin')
     یا coalesce(auth.jwt()->'app_metadata'->'roles','[]'::jsonb) ? 'admin'
     یا coalesce(auth.jwt()->'app_metadata'->'roles','[]'::jsonb) ? 'super_admin'; را با هم ترکیب کنید.
$$;

ایجاد یا جایگزینی تابع private.hgd_is_super_admin()
مقدار بولی را برمی‌گرداند
تعریف‌کننده امنیت پایدار زبان SQL
تنظیم مسیر جستجو = ''
به عنوان $$
  انتخاب coalesce(auth.jwt()->'app_metadata'->>'role','') = 'super_admin'
     یا coalesce(auth.jwt()->'app_metadata'->'roles','[]'::jsonb) ? 'super_admin'; را با هم ترکیب کنید.
$$;

ایجاد یا جایگزینی تابع private.hgd_is_moderator()
مقدار بولی را برمی‌گرداند
تعریف‌کننده امنیت پایدار زبان SQL
تنظیم مسیر جستجو = ''
به عنوان $$
  انتخاب private.hgd_is_admin()
     یا coalesce(auth.jwt()->'app_metadata'->>'role','') in ('support','chat_moderator','content_moderator')
     یا coalesce(auth.jwt()->'app_metadata'->'roles','[]'::jsonb) ? 'chat_moderator'
     یا coalesce(auth.jwt()->'app_metadata'->'roles','[]'::jsonb) ? 'content_moderator'
     یا coalesce(auth.jwt()->'app_metadata'->'roles','[]'::jsonb) ? 'support'; را ادغام کنید.
$$;

لغو همه موارد روی تابع private.hgd_is_admin() از public, anon;
لغو همه موارد روی تابع private.hgd_is_super_admin() از public, anon;
لغو همه موارد مربوط به تابع private.hgd_is_moderator() از public, anon;
به تابع private.hgd_is_admin() اجازه اجرا داده شود تا احراز هویت انجام شود.
به تابع private.hgd_is_super_admin() اجازه اجرا برای احراز هویت داده شود؛
به تابع private.hgd_is_moderator() اجازه اجرا داده شود تا احراز هویت انجام شود.

-- دسترسی به چت خصوصی محدودتر از پشتیبانی عمومی/نظارت بر محتوا است.
-- مدیران پشتیبانی و محتوا نباید در مکالمات مستقیم، کاملاً در معرض دید باشند.
ایجاد یا جایگزینی تابع private.hgd_is_chat_moderator()
زبان بولی sql را برمی‌گرداند. تعریف‌کننده امنیت پایدار، مجموعه search_path = '' as $$ را تنظیم می‌کند.
  انتخاب private.hgd_is_admin()
     یا coalesce(auth.jwt()->'app_metadata'->>'role','') = 'chat_moderator'
     یا coalesce(auth.jwt()->'app_metadata'->'roles','[]'::jsonb) ? 'chat_moderator'; را با هم ترکیب کنید.
$$;
لغو همه موارد مربوط به تابع private.hgd_is_chat_moderator() از public,anon;
به تابع private.hgd_is_chat_moderator() اجازه اجرا برای احراز هویت داده شود؛

اگر جدول public.admin_audit_logs وجود ندارد، آن را ایجاد کن (
  شناسه bigint همیشه به عنوان کلید اصلی هویت تولید می‌شود،
  شناسه‌ی بازیگر uuid به auth.users(id) در هنگام حذف ارجاع می‌دهد و null را تنظیم می‌کند.
  متن اکشن تهی نباشد، بررسی کنید (char_length(action) بین ۲ تا ۱۰۰ باشد)،
  متن target_type تهی نیست. بررسی پیش‌فرض «سیستم» (char_length(target_type) بین ۲ تا ۶۰)
  متن target_id،
  دلیل متن تهی نیست پیش‌فرض '' بررسی (char_length(reason) <= 1200),
  جزئیات jsonb تهی نیست پیش‌فرض '{}'::jsonb بررسی (pg_catalog.octet_length(details::text) <= 12000),
  created_at timestamptz تهی نیست، پیش‌فرض now()
)؛
اگر فهرستی وجود ندارد، آن را در public.admin_audit_logs_created_at_idx ایجاد کن (به صورت نزولی)؛
اگر ایندکس admin_audit_logs_actor_idx وجود ندارد، آن را روی public.admin_audit_logs(actor_id,created_at desc); ایجاد کن.
تغییر جدول public.admin_audit_logs فعال کردن امنیت سطح ردیف؛
لغو همه موارد public.admin_audit_logs از ناشناس، احراز هویت شده؛
به public.admin_audit_logs اجازه انتخاب برای احراز هویت را بدهید.
در صورت وجود، خط‌مشی hgd_admin_audit_read را در public.admin_audit_logs حذف کنید؛
ایجاد سیاست hgd_admin_audit_read در public.admin_audit_logs برای انتخاب احراز هویت با استفاده از (private.hgd_is_admin())؛

تابع private.hgd_write_audit( را ایجاد یا جایگزین کنید
  متن p_action، متن p_target_type، متن p_target_id، متن p_reason پیش‌فرض ''، جزئیات p_details jsonb پیش‌فرض '{}'::jsonb
) مقدار تهی را برمی‌گرداند
تعریف کننده امنیت زبان plpgsql
تنظیم مسیر جستجو = ''
به عنوان $$
شروع
  درج در public.admin_audit_logs(actor_id,action,target_type,target_id,reason,details)
  مقادیر (auth.uid(),left(p_action,100),left(p_target_type,60),left(p_target_id,300),left(coalesce(p_reason,''),1200),coalesce(p_details,'{}'::jsonb));
پایان؛
$$;
لغو همه موارد روی تابع private.hgd_write_audit(text,text,text,text,jsonb) از حالت عمومی، ناشناس، احراز هویت شده؛

---------------------------
-- قابليت‌ها و اعلان عمومي
---------------------------
اگر جدول وجود ندارد، آن را ایجاد کن public.app_settings (
  بررسی کلید اصلی متن setting_key (setting_key ~ '^[az][a-z0-9_.-]{1,100}$'),
  مقدار_تنظیمات_jsonb null نیست. پیش‌فرض '{}'::jsonb بررسی (pg_catalog.octet_length(setting_value::text) <= 20000),
  public_read مقدار بولی ندارد، مقدار پیش‌فرض نادرست است.
  updated_by uuid به auth.users(id) در هنگام حذف، مقدار null را تعیین می‌کند.
  updated_at timestamptz تهی نیست. پیش‌فرض now()
)؛
تغییر جدول public.app_settings امنیت سطح ردیف را فعال می‌کند.
لغو همه تنظیمات public.app_settings از ناشناس، احراز هویت شده؛
به public.app_settings اجازه انتخاب بدهید تا احراز هویت شود.
به public.app_settings تابع insert(setting_key,setting_value,public_read,updated_by) را اعطا کنید تا احراز هویت شود.
تابع update(setting_value,public_read,updated_by) روی public.app_settings به صورت احراز هویت شده اعطا می‌شود.
در صورت وجود، خط‌مشی hgd_settings_read را در public.app_settings حذف کنید؛
ایجاد خط‌مشی hgd_settings_read روی public.app_settings برای انتخاب جهت احراز هویت با استفاده از (public_read یا private.hgd_is_admin())؛
در صورت وجود، خط‌مشی hgd_settings_admin_insert را در public.app_settings حذف کنید؛
ایجاد سیاست hgd_settings_admin_insert در public.app_settings برای درج به منظور احراز هویت با بررسی (private.hgd_is_admin() و updated_by = (select auth.uid()));
در صورت وجود، سیاست hgd_settings_admin_update را در public.app_settings حذف کنید.
ایجاد سیاست hgd_settings_admin_update در public.app_settings برای به‌روزرسانی به احراز هویت‌شده با استفاده از (private.hgd_is_admin()) با بررسی (private.hgd_is_admin() و updated_by = (select auth.uid()))؛

مقادیر را در public.app_settings(setting_key,setting_value,public_read) وارد کنید
 ('ویژگی‌ها'، '{"مناظره‌ها":true،"چت_اجتماعی":true،"چت_خصوصی":true،"گروه‌ها":true،"کانال‌ها":true،"تم‌های_ویژه":true،"کتاب‌های_شخصی":true،"آزمون‌ها":true،"رتبه‌بندی‌ها":true،"پشتیبانی":true،"دستیار_ai":true}'::jsonb، true)،
 ('سیاست_اجتماعی'، '{"max_debate_group_members":3,"chat_attachment_limit_bytes":52428800,"personal_book_limit_bytes":104857600,"default_slow_mode_seconds":0}'::jsonb,true)
در conflict(setting_key) هیچ کاری انجام ندهید؛

اگر جدول وجود ندارد، آن را ایجاد کن public.app_announcements (
  شناسه uuid کلید اصلی پیش‌فرض gen_random_uuid(),
  متن عنوان بررسی می‌کند که آیا مقدار char_length(btrim(title)) بین ۲ تا ۱۶۰ است یا خیر.
  متن بدنه بررسی می‌کند که آیا مقدار char_length(btrim(body)) بین ۱ تا ۶۰۰۰ است یا خیر.
  متن مخاطب تهی نیست، پیش‌فرض «همه» را بررسی کنید (مخاطب در («همه»، «گروه»، «کانال»، «کاربران»))،
  audience_ids uuid[] مقدار پیش‌فرض '{}' تهی نیست،
  starts_at timestamptz تهی نیست، پیش‌فرض now() است.
  ends_at زمان مهر،
  is_published مقدار بولی دارد، نه تهی، پیش‌فرض نادرست است.
  uuid ایجاد شده توسط uuid ارجاعات تهی ندارد auth.users(id) هنگام حذف محدود می‌شود،
  created_at timestamptz تهی نیست، پیش‌فرض now()
  بررسی کنید (ends_at تهی باشد یا ends_at > starts_at باشد)،
  بررسی (cardinality(audience_ids) <= 1000)
)؛
اگر app_announcements_live_idx روی public.app_announcements(is_published,starts_at desc) وجود ندارد، ایندکس ایجاد کن؛
تغییر جدول public.app_announcements فعال کردن امنیت سطح ردیف؛
لغو همه اعلان‌های عمومی در public.app_announcements از ناشناس، احراز هویت شده؛
به public.app_announcements اجازه دهید تا دستورات select,insert,update,delete را انتخاب، درج، به‌روزرسانی و حذف کند.
در صورت وجود، سیاست حذف hgd_announcements_read را در public.app_announcements;
ایجاد سیاست hgd_announcements_read در public.app_announcements برای انتخاب به منظور احراز هویت
با استفاده از (private.hgd_is_admin() یا (is_published و starts_at <= now() و (ends_at تهی است یا ends_at > now()) و (audience='all' یا (audience='users' و (select auth.uid()) = any(audience_ids)))))؛
در صورت وجود، سیاست hgd_announcements_admin_manage را در public.app_announcements حذف کنید.
ایجاد سیاست hgd_announcements_admin_manage روی public.app_announcements برای همه جهت احراز هویت با استفاده از (private.hgd_is_admin()) با بررسی (private.hgd_is_admin() و created_by=(select auth.uid()))؛

اگر جدول public.in_app_notifications وجود ندارد، آن را ایجاد کن (
  شناسه uuid کلید اصلی پیش‌فرض gen_random_uuid(),
  شناسه کاربری uuid تهی نیست. ارجاعات auth.users(id) در حذف آبشاری
  متن عنوان بررسی می‌کند که آیا تهی است یا خیر (char_length(title) بین ۱ تا ۱۶۰)،
  متن بدنه تهی نیست. پیش‌فرض '' بررسی می‌شود (char_length(body) <= 3000),
  نوع متن تهی نیست پیش‌فرض 'info' بررسی (نوع را وارد کنید ('info','success','warning','support','chat','system')),
  بررسی متن action_url (action_url تهی است یا (action_url مانند '/%' است و action_url مانند '//%' نیست))،
  read_at timestamptz،
  created_at timestamptz تهی نیست، پیش‌فرض now()
)؛
اگر in_app_notifications_user_created_idx در public.in_app_notifications(user_id,created_at desc) وجود ندارد، ایندکس را ایجاد کن.
تغییر جدول public.in_app_notifications امنیت سطح ردیف را فعال می‌کند.
لغو همه اعلان‌های public.in_app_notifications از ناشناس، احراز هویت شده؛
به public.in_app_notifications دستور select,update(read_at) را اعطا کنید تا احراز هویت شود.
در صورت وجود، خط‌مشی hgd_notifications_own_read را در public.in_app_notifications حذف کنید؛
ایجاد خط‌مشی hgd_notifications_own_read روی public.in_app_notifications برای انتخاب جهت احراز هویت با استفاده از (user_id=(select auth.uid()));
در صورت وجود، خط‌مشی hgd_notifications_own_update را در public.in_app_notifications حذف کنید؛
ایجاد سیاست hgd_notifications_own_update در public.in_app_notifications برای به‌روزرسانی به احراز هویت‌شده با استفاده از (user_id=(select auth.uid())) با بررسی (user_id=(select auth.uid()))؛
در صورت وجود، خط‌مشی hgd_notifications_admin_insert را در public.in_app_notifications حذف کنید؛
ایجاد سیاست hgd_notifications_admin_insert در public.in_app_notifications برای درج در احراز هویت با بررسی (private.hgd_is_admin())؛
به کاربر احراز هویت‌شده، تابع insert(user_id,title,body,kind,action_url) را در public.in_app_notifications اعطا کنید.

---------------------------
-- تم‌های روز/شب و مناسبت‌های مذهبی
---------------------------
اگر جدول وجود ندارد، آن را ایجاد کن public.user_preferences (
  کلید اصلی user_id uuid در فرآیند حذف آبشاری به auth.users(id) ارجاع می‌دهد.
  متن color_mode تهی نیست، پیش‌فرض "system" بررسی می‌شود (color_mode در ("system", "light", "dark")),
  reduce_motion مقدار بولی ندارد، مقدار پیش‌فرض نادرست است.
  sound_enabled بولی نیست، پیش‌فرض نادرست است،
  disable_occasion_themes مقدار بولی ندارد، مقدار پیش‌فرض نادرست است.
  font_scale عددی(3،2) مقدار پیش‌فرض ۱.۰۰ غیر تهی است (font_scale بین ۰.۸۵ و ۱.۳۵ باشد)،
  updated_at timestamptz تهی نیست. پیش‌فرض now()
)؛
تغییر تنظیمات عمومی جدول کاربر (public.user_preferences) امنیت سطح سطر را فعال می‌کند؛
لغو همه تنظیمات عمومی کاربر از ناشناس، احراز هویت شده؛
به تابع select,insert,update(color_mode,reduce_motion,sound_enabled,disable_occasion_themes,font_scale) در public.user_preferences، مجوز احراز هویت اعطا کن.
در صورت وجود hgd_preferences_own در public.user_preferences، خط‌مشی را حذف کنید.
ایجاد خط‌مشی hgd_preferences_own روی public.user_preferences برای انتخاب جهت احراز هویت با استفاده از (user_id=(select auth.uid()));
در صورت وجود، سیاست hgd_preferences_insert_own را در public.user_preferences حذف کنید.
ایجاد خط‌مشی hgd_preferences_insert_own روی public.user_preferences برای درج در حالت احراز هویت با بررسی (user_id=(select auth.uid()));
در صورت وجود، سیاست hgd_preferences_update_own را در public.user_preferences حذف کنید.
ایجاد سیاست hgd_preferences_update_own در public.user_preferences برای به‌روزرسانی به احراز هویت‌شده با استفاده از (user_id=(select auth.uid())) با بررسی (user_id=(select auth.uid()))؛

اگر جدول public.occasion_themes وجود ندارد، آن را ایجاد کنید (
  شناسه uuid کلید اصلی پیش‌فرض gen_random_uuid(),
  متن slug تهی نیست، بررسی منحصر به فرد بودن (slug ~ '^[a-z0-9-]{2,60}$'),
  متن عنوان بررسی می‌کند که آیا مقدار char_length(btrim(title)) بین ۲ تا ۱۲۰ است یا خیر.
  متن occasion_type بررسی می‌کند که آیا null است یا خیر (occasion_type در ('تولد'، 'شهادت'، 'مذهبی'، 'ملی'، 'عرف')) قرار دارد.)
  متن توضیحات تهی نیست پیش‌فرض '' بررسی (char_length(description) <= 1200),
  starts_at timestamptz تهی نیست،
  ends_at timestamptz تهی نیست،
  متن منطقه زمانی تهی نیست. پیش‌فرض «آسیا/تهران» بررسی می‌شود (char_length(timezone) بین ۳ تا ۸۰)،
  متن accent_color تهی نیست. پیش‌فرض '#168574' بررسی شده است (accent_color ~ '^#[0-9A-Fa-f]{6}$'),
  متن background_color تهی نیست. پیش‌فرض '#f4f6f0' بررسی می‌شود (background_color ~ '^#[0-9A-Fa-f]{6}$'),
  glow_enabled بولی نیست، پیش‌فرض درست است،
  بررسی متن sound_key (مقدار sound_key تهی است یا sound_key در ('soft-chime','quiet-bell','none')) قرار دارد)،
  مقدار بولی فعال است، نه تهی، پیش‌فرض نادرست است.
  اولویت عدد صحیح، غیر تهی، پیش‌فرض ۱۰، بررسی (اولویت بین ۰ تا ۱۰۰)،
  uuid ایجاد شده توسط auth.users(id) هنگام حذف، مقدار null را تعیین می‌کند.
  updated_by uuid به auth.users(id) در هنگام حذف، مقدار null را تعیین می‌کند.
  created_at timestamptz تهی نیست، پیش‌فرض now()
  updated_at timestamptz تهی نیست. پیش‌فرض now() است.
  بررسی (ends_at > starts_at)
)؛
اگر فایل occasion_themes_active_window_idx وجود ندارد، آن را روی public.occasion_themes(enabled,starts_at,ends_at,priority desc); ایجاد کن.
تغییر جدول public.occasion_themes امنیت سطح ردیف را فعال می‌کند؛
لغو همه موارد در public.occasion_themes از ناشناس، احراز هویت شده؛
به public.occasion_themes اجازه دهید تا دستورات select,insert,update,delete را به authenticated اعطا کند.
در صورت وجود، سیاست hgd_occasion_read_active را در public.occasion_themes حذف کنید؛
برای انتخاب احراز هویت شده، خط مشی hgd_occasion_read_active را در public.occasion_themes ایجاد کنید
با استفاده از (private.hgd_is_admin() یا (enabled و starts_at <= now() و ends_at > now()))؛
در صورت وجود، سیاست hgd_occasion_admin_manage را در public.occasion_themes حذف کنید؛
ایجاد سیاست hgd_occasion_admin_manage در public.occasion_themes برای همه جهت احراز هویت با استفاده از (private.hgd_is_admin()) با بررسی (private.hgd_is_admin())؛

---------------------------
-- رابط های کاربر اجرای واقعی در backend/RLS و trigger
---------------------------
اگر جدول public.user_moderation_actions وجود ندارد، آن را ایجاد کن (
  شناسه uuid کلید اصلی پیش‌فرض gen_random_uuid(),
  شناسه کاربری uuid تهی نیست. ارجاعات auth.users(id) در حذف آبشاری
  متن دامنه بررسی می‌کند که آیا تهی است یا خیر (دامنه در ('جهانی'، 'جامعه'، 'چت'، 'مناظره'، 'گروه'، 'کانال')) قرار دارد.)
  متن عمل تهی نباشد، بررسی کنید (عمل در ('هشدار'،'بی‌صدا'،'ممنوعیت'،'لگد')) باشد)،
  دلیل عدم تهی بودن متن، بررسی (char_length(btrim(reason)) بین ۲ تا ۱۲۰۰)
  starts_at timestamptz تهی نیست، پیش‌فرض now() است.
  ends_at زمان مهر،
  زمان لغو شده در timestamptz،
  ارجاعات uuid به auth.users(id) در هنگام حذف، null را تنظیم می‌کند.
  uuid ایجاد شده توسط uuid ارجاعات تهی ندارد auth.users(id) هنگام حذف محدود می‌شود،
  created_at timestamptz تهی نیست، پیش‌فرض now()
  بررسی کنید (ends_at تهی است یا ends_at > starts_at است)
)؛
اگر user_moderation_active_idx وجود ندارد، در public.user_moderation_actions(user_id,scope,starts_at,ends_at) که revoked_at برابر با null است، ایندکس ایجاد کن؛
تغییر جدول public.user_moderation_actions امنیت سطح سطر را فعال می‌کند.
لغو همه اقدامات public.user_moderation_actions از ناشناس، احراز هویت شده؛
به کاربر احراز هویت‌شده، اجازه انتخاب در public.user_moderation_actions را بدهید؛
در صورت وجود، سیاست hgd_moderation_admin_read را در public.user_moderation_actions حذف کنید.
ایجاد سیاست hgd_moderation_admin_read روی public.user_moderation_actions برای انتخاب احراز هویت با استفاده از (private.hgd_is_moderator())؛

تابع private.hgd_assert_can_post(p_scope text default 'community') را ایجاد یا جایگزین کنید.
زبان plpgsql را از نوع void برمی‌گرداند. تعریف‌کننده امنیتی پایدار، مجموعه search_path = '' as $$ را تنظیم می‌کند.
متن v_action را تعریف کنید؛ متن v_reason را.
شروع
  if auth.uid() null است then raise استثنا 'ابتدا وارد حساب شو' using errcode='42501'; پایان اگر؛
  انتخاب action و reason در v_action و v_reason از public.user_moderation_actions
   که در آن user_id=auth.uid() و revoked_at برابر با null و starts_at<=now() و (ends_at برابر با null یا ends_at>now() است)
     و محدوده در ('global',p_scope,'community') و عمل در ('mute','ban','kick')
   مرتب‌سازی بر اساس محدوده مورد نظر وقتی که 'global' است، سپس ۱ وقتی که p_scope است، سپس ۲ در غیر این صورت ۳ end,created_at desc limit 1;
  اگر v_action تهی نباشد، استثناء را افزایش دهید 'اجازه ارسال در این بخش موقتاً محدود شده است: %', v_reason using errcode='42501'; پایان اگر؛
پایان؛ $$؛
لغو همه موارد روی تابع private.hgd_assert_can_post(text) از حالت عمومی، ناشناس، احراز هویت شده؛

---------------------------
-- مباحث موضوع‌محور و گروه‌های سه‌نفره با بحث مسئول
---------------------------
اگر جدول public.debate_topics وجود ندارد، آن را ایجاد کن (
  شناسه uuid کلید اصلی پیش‌فرض gen_random_uuid(),
  متن عنوان تهی نباشد، بررسی کنید (char_length(btrim(title)) بین ۴ تا ۱۸۰)،
  متن سوال تهی نباشد، بررسی کنید (char_length(btrim(question)) بین ۱ تا ۴۰۰۰ باشد)،
  متن دسته‌بندی تهی نیست. پیش‌فرض «عمومی» بررسی می‌شود (char_length(category) بین ۱ تا ۸۰)،
  متن وضعیت تهی نیست، پیش‌فرض «باز» را بررسی کنید (وضعیت در («باز»، «پایان‌یافته»، «بایگانی‌شده»، «پنهان»)) باشد)،
  is_pinned مقدار بولی دارد، نه تهی، پیش‌فرض نادرست است.
  uuid ایجاد شده توسط uuid ارجاعات تهی ندارد auth.users(id) هنگام حذف محدود می‌شود،
  uuid با مقدار null به auth.users(id) ارجاع می‌دهد.
  متن moderation_note تهی نیست. پیش‌فرض '' بررسی (char_length(moderation_note) <= 1200),
  created_at timestamptz تهی نیست، پیش‌فرض now()
  updated_at timestamptz تهی نیست. پیش‌فرض now()
)؛
اگر فایل discussion_topics_state_created_idx روی public.debate_topics(state,is_pinned desc,created_at desc) وجود ندارد، ایندکس ایجاد کنید.
تغییر جدول public.debate_topics امنیت سطح سطر را فعال می‌کند؛
لغو همه موارد در public.debate_topics از ناشناس، احراز هویت شده؛
به public.debate_topics اجازه دهید تا توابع select,insert,update را به صورت authenticated در اختیار شما قرار دهد.
در صورت وجود، سیاست hgd_debate_topics_read را در public.debate_topics حذف کنید.
ایجاد سیاست hgd_debate_topics_read در public.debate_topics برای انتخاب با استفاده از احراز هویت (state <> 'hidden' or private.hgd_is_moderator());
در صورت وجود، سیاست hgd_debate_topics_insert را در public.debate_topics حذف کنید.
ایجاد سیاست hgd_debate_topics_insert در public.debate_topics برای درج در فایل احراز هویت شده با بررسی (created_by=(select auth.uid()) و state='open' و is_pinned=false و moded_by برابر با null)؛
در صورت وجود، سیاست hgd_debate_topics_update_own را در public.debate_topics حذف کنید.
برای به‌روزرسانی به حساب‌های احراز هویت‌شده، روی public.debate_topics، سیاست hgd_debate_topics_update_own را ایجاد کنید.
با استفاده از (created_by=(select auth.uid()) و created_at > now()-interval '30 minutes' و state='open')
با بررسی (created_by=(select auth.uid()) و وضعیت ('open','concluded') و is_pinned=false و moded_by برابر با null)؛
در صورت وجود، سیاست hgd_debate_topics_moderator_update را در public.debate_topics حذف کنید.
ایجاد سیاست hgd_debate_topics_moderator_update در public.debate_topics برای به‌روزرسانی به احراز هویت‌شده با استفاده از (private.hgd_is_moderator()) با بررسی (private.hgd_is_moderator())؛

اگر جدول public.debate_posts وجود ندارد، آن را ایجاد کن (
  شناسه uuid کلید اصلی پیش‌فرض gen_random_uuid(),
  uuid مربوط به topic_id ارجاعات تهی نیست public.debate_topics(id) در حذف آبشاری،
  شناسه‌ی نویسنده (uuid) خالی نیست. ارجاعات auth.users(id) هنگام حذف محدود می‌شوند.
  نوع استدلال متن تهی نیست پیش‌فرض «استدلال» بررسی می‌شود (نوع استدلال در («حمایت»، «مخالفت»، «سوال»، «استدلال»، «رد»، «خلاصه»، «منبع»))
  متن بدنه بررسی می‌کند که آیا مقدار char_length(btrim(body)) بین ۱ تا ۵۰۰۰ است یا خیر.
  ارجاعات reply_to uuid به public.debate_posts(id) هنگام حذف، null را تنظیم می‌کند.
  بررسی متن source_title (source_title برابر با null یا char_length(source_title) <= 240) است،
  بررسی متن source_url (source_url برابر با null است یا (source_url مانند 'https://%' و char_length(source_url) <= 1200))،
  اصلاح‌شده_در زمان مهر زمان،
  deleted_at timestamptz،
  مقدار بولی moderated_hidden برابر با null است و پیش‌فرض false است.
  created_at timestamptz تهی نیست، پیش‌فرض now()
  بررسی کنید (reply_to تهی است یا شناسه reply_to <> است)
)؛
اگر فایل discussion_posts_topic_created_idx وجود ندارد، آن را روی public.debate_posts(topic_id,created_at asc) ایجاد کن.
اگر فایل discussion_posts_author_idx وجود ندارد، آن را روی public.debate_posts(author_id,created_at desc) ایجاد کن.
تغییر جدول public.debate_posts امنیت سطح سطر را فعال می‌کند؛
لغو همه پست‌های public.debate_posts از ناشناس، احراز هویت شده؛
به public.debate_posts اجازه دهید تا دستورات select,insert,update را به authenticated اعطا کند.
در صورت وجود، سیاست حذف hgd_debate_posts_read در public.debate_posts;
ایجاد سیاست hgd_debate_posts_read در public.debate_posts برای انتخاب جهت احراز هویت
با استفاده از ((not modered_hidden و deleted_at برابر با تهی است و وجود دارد(یکی را از public.debate_topics t انتخاب کنید که در آن t.id=topic_id و t.state <> 'hidden')) یا private.hgd_is_moderator());
سیاست حذف hgd_debate_posts_insert در صورت وجود در public.debate_posts;
ایجاد سیاست hgd_debate_posts_insert در public.debate_posts برای درج با احراز هویت با بررسی (
 author_id=(select auth.uid()) و moded_hidden=false و deleted_at برابر با null هستند.
 و موجود است (یکی از public.debate_topics t را انتخاب کنید که در آن t.id=topic_id و t.state='open' است)
)؛
سیاست حذف hgd_debate_posts_update_own در صورت وجود در public.debate_posts;
برای به‌روزرسانی به احراز هویت‌شده، سیاست hgd_debate_posts_update_own را در public.debate_posts ایجاد کنید
با استفاده از (author_id=(select auth.uid()) و created_at>now()-interval '10 minutes' و deleted_at برابر با null است)
با بررسی (author_id=(select auth.uid()) و moded_hidden=false و deleted_at برابر با null باشد)؛
در صورت وجود، سیاست hgd_debate_posts_moderator_update را در public.debate_posts حذف کنید.
ایجاد سیاست hgd_debate_posts_moderator_update در public.debate_posts برای به‌روزرسانی به احراز هویت‌شده با استفاده از (private.hgd_is_moderator()) با بررسی (private.hgd_is_moderator())؛

ایجاد یا جایگزینی تابع private.hgd_check_debate_rate()
زبان تریگر plpgsql را برمی‌گرداند. تعریف‌کننده امنیتی، search_path = '' as $$ را تنظیم می‌کند.
شروع
  انجام private.hgd_assert_can_post('مناظره');
  اگر (تعداد (*) را از public.debate_posts p انتخاب کنید که در آن p.author_id=new.author_id و p.created_at>now()-interval '10 ثانیه') >= 5 آنگاه
    raise استثنا 'برای جلوگیری از هرزنامه، آهسته تر پیام بفرست.' با استفاده از errcode='P0001';
  پایان اگر؛
  بازگشت جدید؛
پایان؛ $$؛
لغو همه موارد روی تابع private.hgd_check_debate_rate() از public,anon,authenticated;
در صورت وجود، ماشه را رها کنید. hgd_debate_rate_limit در public.debate_posts;
قبل از درج در public.debate_posts برای هر سطر، ماشه hgd_debate_rate_limit را ایجاد کنید. اجرای تابع private.hgd_check_debate_rate();

اگر جدول public.discussion_groups وجود ندارد، آن را ایجاد کن (
  شناسه uuid کلید اصلی پیش‌فرض gen_random_uuid(),
  متن عنوان تهی نباشد، بررسی کنید (char_length(btrim(title)) بین ۳ تا ۱۰۰)،
  متن موضوع تهی نیست. پیش‌فرض '' بررسی (char_length(topic) <= 600),
  uuid ایجاد شده توسط uuid ارجاعات تهی ندارد auth.users(id) هنگام حذف محدود می‌شود،
  max_members smallint مقدار پیش‌فرض ۳ را بررسی می‌کند (max_members=3)،
  is_open مقدار بولی ندارد، مقدار پیش‌فرض درست است.
  created_at timestamptz تهی نیست، پیش‌فرض now()
)؛
اگر فهرست discussion_groups_open_idx وجود ندارد، آن را روی public.discussion_groups(is_open,created_at desc); ایجاد کن.
اگر جدول public.discussion_group_members وجود ندارد، آن را ایجاد کن (
  شناسه گروه uuid ارجاع تهی ندارد public.discussion_groups(id) در حذف آبشاری،
  شناسه کاربری uuid تهی نیست. ارجاعات auth.users(id) در حذف آبشاری
  متن member_role تهی نیست، پیش‌فرض "عضو" بررسی شده است (member_role در ("مالک"، "عضو"، "رهبر بحث"))،
  joined_at timestamptz تهی نیست، پیش‌فرض now()
  کلید اصلی (شناسه_گروه، شناسه_کاربر)
)؛
اگر one_discussion_leader_per_group در public.discussion_group_members(group_id) وجود ندارد، یک فهرست منحصر به فرد ایجاد کنید، که در آن member_role='discussion_leader';
اگر ایندکس discussion_group_members_user_idx وجود ندارد، آن را روی public.discussion_group_members(user_id,group_id) ایجاد کن.
تغییر جدول public.discussion_groups امنیت سطح سطر را فعال می‌کند؛
تغییر جدول public.discussion_group_members امنیت سطح ردیف را فعال می‌کند.
لغو همه موارد در public.discussion_groups از ناشناس، احراز هویت شده؛
همه اعضای گروه بحث عمومی را از ناشناس، احراز هویت شده، لغو کن.
به public.discussion_groups اجازه انتخاب بدهید تا احراز هویت شود.
به public.discussion_groups اجازه دهید تا update(title,topic,is_open) را برای احراز هویت اعطا کند.
به اعضای public.discussion_group_members اجازه انتخاب بدهید تا احراز هویت شوند.
در صورت وجود، سیاست hgd_discussion_groups_read را در public.discussion_groups حذف کنید.
ایجاد سیاست hgd_discussion_groups_read در public.discussion_groups برای انتخاب احراز هویت با استفاده از (is_open یا created_by=(select auth.uid()) یا private.hgd_is_moderator())؛
در صورت وجود، سیاست hgd_discussion_groups_insert را در public.discussion_groups حذف کنید.
ایجاد سیاست hgd_discussion_groups_insert در public.discussion_groups برای درج به احراز هویت شده با بررسی (created_by=(select auth.uid()) و max_members=3 و is_open=true)؛
در صورت وجود، سیاست hgd_discussion_groups_update را در public.discussion_groups حذف کنید.
ایجاد سیاست hgd_discussion_groups_update در public.discussion_groups برای به‌روزرسانی به احراز هویت‌شده با استفاده از (created_by=(select auth.uid()) یا private.hgd_is_admin()) با بررسی (created_by=(select auth.uid()) یا private.hgd_is_admin())؛
در صورت وجود، سیاست حذف hgd_discussion_members_read در public.discussion_group_members;
تابع private.hgd_is_discussion_member(p_group_id uuid) را ایجاد یا جایگزین کنید.
زبان بولی sql را برمی‌گرداند. تعریف‌کننده امنیت پایدار، مجموعه search_path = '' as $$ را تنظیم می‌کند.
 انتخاب وجود دارد(یکی از اعضای public.discussion_group_members m را انتخاب کنید که در آن m.group_id=p_group_id و m.user_id=auth.uid())؛
$$;
لغو همه موارد مربوط به تابع private.hgd_is_discussion_member(uuid) از public,anon;
به تابع private.hgd_is_discussion_member(uuid) اجازه اجرا روی تابع Authenticated را بدهید.
ایجاد سیاست hgd_discussion_members_read در public.discussion_group_members برای انتخاب کاربر با استفاده از احراز هویت (user_id=(select auth.uid()) یا private.hgd_is_moderator() یا private.hgd_is_discussion_member(group_id));

تابع ایجاد یا جایگزینی public.create_discussion_group(p_title text,p_topic text default '') شناسه کاربری را برمی‌گرداند.
تعریف کننده امنیتی زبان plpgsql، مجموعه search_path = '' به عنوان $$
اعلان v_group_id uuid؛
شروع
  انجام private.hgd_assert_can_post('گروه');
  if auth.uid() null است then raise استثنا 'ابتدا وارد حساب شو' using errcode='42501'; پایان اگر؛
  درج در public.discussion_groups(title,topic,created_by,max_members,is_open)
  values(left(btrim(p_title),100),left(coalesce(p_topic,''),600),auth.uid(),3,true) شناسه را به v_group_id برمی‌گرداند؛
  مقادیر (v_group_id,auth.uid(),'owner') را در public.discussion_group_members(group_id,user_id,member_role) وارد کنید.
  انجام private.hgd_write_audit('discussion_group_created','discussion_group',v_group_id::text,'',jsonb_build_object('title',left(p_title,100)));
  شناسه‌ی گروه v را برمی‌گرداند؛
پایان؛ $$؛

تابع ایجاد یا جایگزینی public.join_discussion_group(p_group_id uuid) مقدار بولی را برمی‌گرداند.
تعریف کننده امنیتی زبان plpgsql، مجموعه search_path = '' به عنوان $$
تعریف v_group public.discussion_groups%rowtype; v_count integer;
شروع
  انجام private.hgd_assert_can_post('گروه');
  برای به‌روزرسانی، * را از public.discussion_groups به v_group وارد کنید که در آن id=p_group_id است.
  if not found or not v_group.is_open then raise استثنا 'این گروه در دسترس نیست'; پایان اگر؛
  اگر وجود داشته باشد (یکی از اعضای public.discussion_group_members را انتخاب کن که در آن group_id=p_group_id و user_id=auth.uid()) آنگاه مقدار true را برمی‌گرداند؛ اگر وجود نداشته باشد، پایان می‌یابد.
  تابع (*)count را از public.discussion_group_members به ​​v_count انتخاب کنید، به طوری که group_id=p_group_id;
  if v_count>=3 then raise استثنا 'ظرفیت گروه سه نفر است و تکمیل شده'; پایان اگر؛
  مقادیر (p_group_id,auth.uid(),'member') را در public.discussion_group_members(group_id,user_id,member_role) وارد کنید.
  انجام private.hgd_write_audit('discussion_group_joined','discussion_group',p_group_id::text,'','{}'::jsonb);
  مقدار درست را برمی‌گرداند؛
پایان؛ $$؛

تابع public.assign_discussion_leader(p_group_id uuid,p_user_id uuid,p_assign boolean default true) را ایجاد یا جایگزین می‌کند.
تعریف کننده امنیتی زبان plpgsql، مجموعه search_path = '' به عنوان $$
شناسه کاربری v_owner را اعلان کنید؛
شروع
  if auth.uid() null است then raise استثنا 'ابتدا وارد حساب شو' using errcode='42501'; پایان اگر؛
  از public.discussion_groups که id آن p_group_id است، created_by را در v_owner انتخاب کنید.
  if not found then raise استثنا 'گروه پیدا نشد'; پایان اگر؛
  اگر v_owner <> auth.uid() و نه private.hgd_is_admin() سپس Exception را افزایش دهید 'اجازه تغییر مسئول مورد بحث را نداری' using errcode='42501'; پایان اگر؛
  اگر p_assign و وجود ندارد (1 را از public.discussion_group_members انتخاب کنید که در آن group_id=p_group_id و user_id=p_user_id) سپس استثناء را افزایش دهید 'مسئول باید عضو همین گروه باشد'; پایان اگر؛
  اگر p_assign باشد، آنگاه
    به‌روزرسانی public.discussion_group_members تنظیم شده است member_role='member' که در آن group_id=p_group_id و member_role='discussion_leader';
    به‌روزرسانی public.discussion_group_members تنظیم شده است member_role='discussion_leader' که در آن group_id=p_group_id و user_id=p_user_id;
  دیگری
    به‌روزرسانی public.discussion_group_members تنظیم شده است برای member_role='member' که در آن group_id=p_group_id و user_id=p_user_id و member_role='discussion_leader';
  پایان اگر؛
  انجام private.hgd_write_audit(در صورتی که p_assign سپس 'discussion_leader_assigned' باشد، در غیر این صورت 'discussion_leader_revoked' پایان، 'discussion_group'، p_group_id::text، ''، jsonb_build_object('user_id'، p_user_id))؛
  مقدار درست را برمی‌گرداند؛
پایان؛ $$؛

لغو همه موارد روی تابع public.create_discussion_group(text,text) از public,anon;
همه موارد مربوط به تابع public.join_discussion_group(uuid) را از public,anon لغو کنید.
همه موارد مربوط به تابع public.assign_discussion_leader(uuid,uuid,boolean) را از public,anon لغو کن؛
به تابع public.create_discussion_group(text,text) اجازه اجرا روی تابع Authenticated را بدهید؛
به تابع public.join_discussion_group(uuid) اجازه اجرا روی شناسه‌ی احراز هویت‌شده را بدهید؛
به تابع public.assign_discussion_leader(uuid,uuid,boolean) اجازه اجرا روی تابع Authenticated را بدهید.

---------------------------
-- چت خصوصی، گروه، کانال، دعوت، واکنش، سنجاق و نظرسنجی
---------------------------
اگر جدول public.chat_blocks وجود ندارد، آن را ایجاد کن (
  ‎blocker_id uuid ارجاعات تهی نیست auth.users(id) در حذف آبشاری،
  ‎شناسه_مسدود_شده uuid ارجاعات تهی نیست auth.users(id) در آبشار حذف،
  created_at timestamptz تهی نیست، پیش‌فرض now()
  کلید اصلی (شناسه مسدودکننده، شناسه مسدود شده)،
  بررسی(شناسه_مسدودکننده <> شناسه_مسدودشده)
)؛
تغییر جدول public.chat_blocks امنیت سطح ردیف را فعال می‌کند.
لغو همه موارد در public.chat_blocks از ناشناس، احراز هویت شده؛
به توابع select، insert، delete در public.chat_blocks اجازه احراز هویت داده شود.
در صورت وجود hgd_blocks_own در public.chat_blocks، سیاست حذف می‌شود.
ایجاد خط‌مشی hgd_blocks_own در public.chat_blocks برای انتخاب با استفاده از احراز هویت (blocker_id=(select auth.uid()));
در صورت وجود hgd_blocks_insert_own در public.chat_blocks، سیاست حذف می‌شود.
ایجاد سیاست hgd_blocks_insert_own در public.chat_blocks برای درج در احراز هویت با بررسی (blocker_id=(select auth.uid()) و عدم وجود (انتخاب ۱ از public.chat_blocks reciprocal که در آن reciprocal.blocker_id=blocked_id و reciprocal.blocked_id=blocker_id))؛
در صورت وجود، سیاست حذف hgd_blocks_delete_own در public.chat_blocks را لغو کنید.
ایجاد خط‌مشی hgd_blocks_delete_own در public.chat_blocks برای حذف با استفاده از احراز هویت (blocker_id=(select auth.uid()));

اگر جدول public.chat_conversations وجود ندارد، آن را ایجاد کن (
  شناسه uuid کلید اصلی پیش‌فرض gen_random_uuid(),
  نوع متن بدون بررسی تهی بودن (نوع در ('direct','group','channel')),
  متن قابل مشاهده تهی نیست، بررسی پیش‌فرض «خصوصی» (قابل مشاهده بودن در («خصوصی»، «عمومی»))،
  متن عنوان تهی نیست پیش‌فرض '' بررسی (char_length(title) <= 120),
  متن توضیحات تهی نیست پیش‌فرض '' بررسی (char_length(description) <= 1200),
  متن direct_key منحصر به فرد،
  is_active مقدار بولی ندارد (null) مقدار پیش‌فرض درست است،
  slow_mode_seconds عدد صحیح نیست، مقدار پیش‌فرض ۰ است (slow_mode_seconds بین ۰ تا ۳۶۰۰ است)،
  uuid ایجاد شده توسط uuid ارجاعات تهی ندارد auth.users(id) هنگام حذف محدود می‌شود،
  created_at timestamptz تهی نیست، پیش‌فرض now()
  last_message_at timestamptz تهی نیست. پیش‌فرض now(),
  بررسی کنید ((kind='direct' و direct_key برابر با null نباشد و visibility='private') یا kind<>'direct')
)؛
اگر chat_conversations_discovery_idx روی public.chat_conversations(kind,visibility,is_active,last_message_at desc) وجود ندارد، ایندکس ایجاد کن.
اگر جدول public.chat_members وجود ندارد، آن را ایجاد کن (
  شناسه مکالمه uuid ارجاع تهی ندارد public.chat_conversations(id) در حذف آبشاری،
  شناسه کاربری uuid تهی نیست. ارجاعات auth.users(id) در حذف آبشاری
  متن نقش عضو تهی نیست. پیش‌فرض "عضو" بررسی می‌شود (نقش عضو در ("مالک"، "مدیر"، "ناظر"، "عضو"، "مشترک"))،
  joined_at timestamptz تهی نیست، پیش‌فرض now()
  last_read_at timestamptz تهی نیست، پیش‌فرض now() است.
  مهر زمان muted_until،
  کلید اصلی (شناسه مکالمه، شناسه کاربر)
)؛
اگر chat_members_user_idx روی public.chat_members(user_id,conversation_id) وجود ندارد، ایندکس ایجاد کن.
اگر جدول public.chat_messages وجود ندارد، آن را ایجاد کن (
  شناسه uuid کلید اصلی پیش‌فرض gen_random_uuid(),
  شناسه مکالمه uuid ارجاع تهی ندارد public.chat_conversations(id) در حذف آبشاری،
  ‎sender_id uuid null نیست. ارجاعات auth.users(id) هنگام حذف محدود می‌شوند.‎
  متن بدنه بررسی می‌کند که آیا مقدار char_length(btrim(body)) بین ۱ تا ۵۰۰۰ است یا خیر.
  ‎reply_to uuid به public.chat_messages(id)‎ هنگام حذف ارجاع می‌دهد و مقدار null را تعیین می‌کند.‎
  ارجاعات forwarded_from uuid به public.chat_messages(id) در هنگام حذف، null را تنظیم می‌کند.
  سنجاق‌شده در timestamptz،
  uuid پین‌شده توسط auth.users(id) هنگام حذف، null را تنظیم می‌کند.
  اصلاح‌شده_در زمان مهر زمان،
  deleted_at timestamptz،
  created_at timestamptz تهی نیست، پیش‌فرض now()
  بررسی (reply_to برابر با تهی یا شناسه reply_to <> است)
)؛
اگر chat_messages_conversation_created_idx وجود ندارد، آن را روی public.chat_messages(conversation_id,created_at desc) ایجاد کن.
اگر chat_messages_sender_created_idx روی public.chat_messages(sender_id,created_at desc) وجود ندارد، ایندکس ایجاد کن.
اگر جدول public.chat_reactions وجود ندارد، آن را ایجاد کن (
  شناسه پیام uuid تهی نیست. public.chat_messages(id) در حذف آبشاری،
  شناسه کاربری uuid تهی نیست. ارجاعات auth.users(id) در حذف آبشاری
  متن ایموجی خالی نباشد (ایموجی شامل ('👍'،'❤️'،'😂'،'🤝'،'🙏'،'💡'،'🎉'،'💯')) باشد.)
  created_at timestamptz تهی نیست، پیش‌فرض now()
  کلید اصلی (شناسه پیام، شناسه کاربر، ایموجی)
)؛
اگر جدول public.chat_invites وجود ندارد، آن را ایجاد کن (
  شناسه uuid کلید اصلی پیش‌فرض gen_random_uuid(),
  شناسه مکالمه uuid ارجاع تهی ندارد public.chat_conversations(id) در حذف آبشاری،
  متن invite_code تهی نیست، پیش‌فرض منحصر به فرد است، جایگزین(gen_random_uuid()::text,'-','') بررسی(invite_code ~ '^[a-f0-9]{32}$'),
  uuid ایجاد شده توسط uuid ارجاعات تهی ندارد auth.users(id) هنگام حذف محدود می‌شود،
  expires_at timestamptz,
  max_uses عدد صحیح نیست، پیش‌فرض 20 است. بررسی کنید (max_uses بین 1 تا 5000 باشد)،
  ‎use_count عدد صحیح نیست، پیش‌فرض ۰ است، بررسی کنید (use_count >= ۰)،‎
  زمان لغو شده در timestamptz،
  created_at timestamptz تهی نیست، پیش‌فرض now()
  بررسی کنید (expires_at تهی است یا expires_at > created_at است)
)؛
اگر chat_invites_conversation_idx وجود ندارد، آن را روی public.chat_invites(conversation_id,created_at desc) ایجاد کنید.
اگر جدول public.chat_polls وجود ندارد، آن را ایجاد کن (
  شناسه uuid کلید اصلی پیش‌فرض gen_random_uuid(),
  شناسه پیام uuid تهی نیست. ارجاعات منحصر به فرد public.chat_messages(id) در حذف آبشاری،
  شناسه مکالمه uuid ارجاع تهی ندارد public.chat_conversations(id) در حذف آبشاری،
  متن سوال تهی نیست. بررسی(char_length(btrim(question)) بین ۲ تا ۲۴۰)،
  multiple_choice بولی نیست تهی پیش‌فرض نادرست،
  ends_at زمان مهر،
  uuid ایجاد شده توسط uuid ارجاعات تهی ندارد auth.users(id) هنگام حذف محدود می‌شود،
  created_at timestamptz تهی نیست، پیش‌فرض now()
)؛
اگر جدول public.chat_poll_options وجود ندارد، آن را ایجاد کن (
  شناسه uuid کلید اصلی پیش‌فرض gen_random_uuid(),
  ‎poll_id uuid ارجاع تهی ندارد public.chat_polls(id)‎ در حذف آبشاری،
  متن option_text تهی نیست. بررسی کنید (char_length(btrim(option_text)) بین ۱ تا ۱۶۰ باشد)،
  بررسی موقعیت smallint بدون تهی بودن (موقعیت بین ۰ تا ۹)
  منحصر به فرد(poll_id,position)
)؛
اگر جدول public.chat_poll_votes وجود ندارد، آن را ایجاد کن (
  ‎poll_id uuid ارجاع تهی ندارد public.chat_polls(id)‎ در حذف آبشاری،
  ‎option_id uuid ارجاع تهی ندارد public.chat_poll_options(id)‎ روی حذف آبشاری،
  شناسه کاربری uuid تهی نیست. ارجاعات auth.users(id) در حذف آبشاری
  created_at timestamptz تهی نیست، پیش‌فرض now()
  کلید اصلی (شناسه نظرسنجی، شناسه گزینه، شناسه کاربر)
)؛

تغییر جدول public.chat_conversations امنیت سطح ردیف را فعال می‌کند؛
تغییر جدول public.chat_members امنیت سطح ردیف را فعال می‌کند.
تغییر جدول public.chat_messages امنیت سطح ردیف را فعال می‌کند.
تغییر جدول public.chat_reactions امنیت سطح ردیف را فعال می‌کند؛
تغییر جدول public.chat_invites فعال کردن امنیت سطح ردیف؛
تغییر جدول public.chat_polls امنیت سطح ردیف را فعال می‌کند؛
تغییر جدول public.chat_poll_options امنیت سطح ردیف را فعال می‌کند.
تغییر جدول public.chat_poll_votes امنیت سطح ردیف را فعال می‌کند؛
-- توابع کمکی برای RLS چت پس از طرح عضویت ایجاد می‌شوند.
تابع private.hgd_can_read_chat(p_conversation_id uuid) را ایجاد یا جایگزین کنید.
زبان بولی sql را برمی‌گرداند. تعریف‌کننده امنیت پایدار، مجموعه search_path = '' as $$ را تنظیم می‌کند.
 انتخاب exists(یکی را از public.chat_conversations c انتخاب کن که در آن c.id=p_conversation_id و c.is_active و ((c.kind='channel' و c.visibility='public') یا exists(یکی را از public.chat_members m انتخاب کن که در آن m.conversation_id=c.id و m.user_id=auth.uid()))) یا private.hgd_is_chat_moderator();
$$;
تابع private.hgd_can_manage_chat(p_conversation_id uuid) را ایجاد یا جایگزین کنید.
زبان بولی sql را برمی‌گرداند. تعریف‌کننده امنیت پایدار، مجموعه search_path = '' as $$ را تنظیم می‌کند.
 انتخاب private.hgd_is_admin() یا exists(یکی از public.chat_members m را انتخاب کنید که در آن m.conversation_id=p_conversation_id و m.user_id=auth.uid() و m.member_role در ('owner','admin','moderator')) قرار دارند)؛
$$;
تابع private.hgd_can_send_chat(p_conversation_id uuid) را ایجاد یا جایگزین کنید.
زبان بولی plpgsql را برمی‌گرداند. تعریف‌کننده امنیتی پایدار، مجموعه search_path = '' as $$ را تنظیم می‌کند.
اعلان متن v_kind؛ متن v_visibility؛ عدد صحیح v_slow؛ مهر زمان v_muted؛
شروع
 اگر auth.uid() تهی باشد، آنگاه false را برمی‌گرداند؛ پایان اگر؛
 از public.chat_conversations، متغیرهای kind، visibility، slow_mode_seconds را به v_kind، v_visibility، v_slow که id آنها p_conversation_id و is_active است، وارد کنید.
 اگر پیدا نشد، مقدار false را برمی‌گرداند؛ اگر پیدا نشد، پایان می‌یابد.
 اگر وجود داشته باشد (یکی را از public.chat_blocks b انتخاب کن که در آن (b.blocker_id=auth.uid() و b.blocked_id در (m.user_id را از public.chat_members m انتخاب کن که در آن m.conversation_id=p_conversation_id)) یا (b.blocked_id=auth.uid() و b.blocker_id در (m.user_id را از public.chat_members m انتخاب کن که در آن m.conversation_id=p_conversation_id))) آنگاه مقدار false را برگردان؛ پایان اگر؛
 اگر v_kind='channel' باشد، آنگاه
   اگر private.hgd_can_manage_chat(p_conversation_id) نباشد، مقدار false را برمی‌گرداند؛ اگر ;
 اگر وجود نداشته باشد (یکی از public.chat_members m را انتخاب کنید که در آن m.conversation_id=p_conversation_id و m.user_id=auth.uid()) آنگاه
   مقدار false را برمی‌گرداند؛
 پایان اگر؛
 از public.chat_members، muted_until را به v_muted انتخاب کنید، جایی که conversation_id=p_conversation_id و user_id=auth.uid();
 اگر v_muted تهی نباشد و v_muted>now()‎ باشد، آنگاه false را برمی‌گرداند؛ پایان اگر؛
 اگر وجود داشته باشد (یکی از public.user_moderation_actions را انتخاب کن که در آن a.user_id=auth.uid() و a.revoked_at برابر با null و a.starts_at<=now() و (a.ends_at برابر با null یا a.ends_at>now() باشد) و a.action در ('mute','ban','kick') و a.scope در ('global','chat','community','channel','group')) باشد، آنگاه مقدار false را برمی‌گرداند؛ پایان اگر;
 اگر v_slow>0 باشد و وجود داشته باشد (یکی از public.chat_messages m را انتخاب کنید که در آن m.conversation_id=p_conversation_id و m.sender_id=auth.uid() و m.created_at>now()-make_interval(secs=>v_slow)) آنگاه مقدار false را برمی‌گرداند؛ پایان اگر؛
 مقدار درست را برمی‌گرداند؛
پایان؛ $$؛
لغو همه موارد روی تابع private.hgd_can_read_chat(uuid) از public,anon;
لغو همه موارد مربوط به تابع private.hgd_can_manage_chat(uuid) از public,anon;
همه موارد مربوط به تابع private.hgd_can_send_chat(uuid) را از public,anon لغو کن؛
به تابع private.hgd_can_read_chat(uuid) اجازه اجرا داده شود تا احراز هویت انجام شود.
به تابع private.hgd_can_manage_chat(uuid) اجازه اجرا روی شناسه‌ی احراز هویت‌شده را بدهید؛
به تابع private.hgd_can_send_chat(uuid) اجازه اجرا بده تا احراز هویت انجام بشه؛

تابع private.hgd_is_chat_member(p_conversation_id uuid) را ایجاد یا جایگزین کنید.
زبان بولی sql را برمی‌گرداند. تعریف‌کننده امنیت پایدار، مجموعه search_path = '' as $$ را تنظیم می‌کند.
 انتخاب وجود دارد (یکی از اعضای public.chat_members m را انتخاب کنید که در آن m.conversation_id=p_conversation_id و m.user_id=auth.uid())؛
$$;
تابع private.hgd_is_discussion_member(p_group_id uuid) را ایجاد یا جایگزین کنید.
زبان بولی sql را برمی‌گرداند. تعریف‌کننده امنیت پایدار، مجموعه search_path = '' as $$ را تنظیم می‌کند.
 انتخاب وجود دارد(یکی از اعضای public.discussion_group_members m را انتخاب کنید که در آن m.group_id=p_group_id و m.user_id=auth.uid())؛
$$;
لغو همه موارد مربوط به تابع private.hgd_is_chat_member(uuid) از public,anon;
لغو همه موارد مربوط به تابع private.hgd_is_discussion_member(uuid) از public,anon;
به تابع private.hgd_is_chat_member(uuid) اجازه اجرا روی شناسه‌ی احراز هویت‌شده را بدهید؛
به تابع private.hgd_is_discussion_member(uuid) اجازه اجرا روی تابع Authenticated را بدهید.

ایجاد یا جایگزینی تابع private.hgd_prepare_chat_message()
زبان تریگر plpgsql را برمی‌گرداند. تعریف‌کننده امنیتی، search_path = '' as $$ را تنظیم می‌کند.
شروع
 if auth.uid() null است then raise استثنا 'ابتدا وارد حساب شو' using errcode='42501'; پایان اگر؛
 اگر new.sender_id برابر با null نباشد و new.sender_id با auth.uid() متفاوت باشد، آنگاه با استفاده از errcode='42501'; خطای 'sender_id با کاربر فعلی مطابقت ندارد' ایجاد می‌شود. پایان اگر;
 شناسه فرستنده جدید: = auth.uid();
 if char_length(btrim(new.body))=0 then raise استثنا 'متن پیام خالی است'; پایان اگر؛
 اگر (تعداد (*) را از public.chat_messages m انتخاب کنید که در آن m.sender_id=auth.uid() و m.created_at>now()-interval '10 seconds') >= 8 آنگاه
   raise استثنا 'برای جلوگیری از هرزنامه، آهسته تر پیام بفرست.' با استفاده از errcode='P0001';
 پایان اگر؛
 بازگشت جدید؛
پایان؛ $$؛
همه موارد مربوط به تابع private.hgd_prepare_chat_message() را از public,anon,authenticated لغو کن.
اگر hgd_chat_message_prepare روی public.chat_messages وجود داشته باشد، تریگر را رها می‌کند.
قبل از درج در public.chat_messages برای هر سطر، یک تریگر hgd_chat_message_prepare ایجاد کنید. تابع private.hgd_prepare_chat_message() را اجرا کنید.
تابع private.hgd_stamp_chat_message_update() را ایجاد یا جایگزین کنید.
زبان تریگر plpgsql را برمی‌گرداند. search_path = '' as $$ را تنظیم می‌کند.
شروع
 اگر new.body از old.body متمایز باشد، آنگاه new.edited_at := pg_catalog.now(); پایان اگر;
 اگر old.deleted_at null است و new.deleted_at null نیست، new.body := 'این پیام حذف شد.'; new.edited_at := pg_catalog.now(); پایان اگر؛
 بازگشت جدید؛
پایان؛ $$؛
همه موارد مربوط به تابع private.hgd_stamp_chat_message_update() را از public,anon,authenticated لغو کن.
اگر hgd_chat_message_stamp_update روی public.chat_messages وجود داشته باشد، تریگر را رها می‌کند.
قبل از به‌روزرسانی body,deleted_at در public.chat_messages برای هر سطر، تریگر hgd_chat_message_stamp_update را ایجاد کنید. تابع private.hgd_stamp_chat_message_update() را اجرا کنید.
لغو همه موارد مربوط به public.chat_conversations، public.chat_members، public.chat_messages، public.chat_reactions، public.chat_invites، public.chat_polls، public.chat_poll_options، public.chat_poll_votes از ناشناس، احراز هویت شده؛
به public.chat_conversations، public.chat_members، public.chat_messages، public.chat_reactions، public.chat_invites، public.chat_polls، public.chat_poll_options، public.chat_poll_votes اجازه انتخاب بده تا احراز هویت انجام شود؛
-- ایجاد مکالمه فقط از طریق RPC های تعریف کننده امنیتی زیر در دسترس است.
به public.chat_messages اجازه دهید تا تابع insert(conversation_id,user_id,body,reply_to,forwarded_from) احراز هویت شود.
تابع update(body,edited_at,deleted_at) روی public.chat_messages را به احراز هویت‌شده اعطا کنید.
به تابع insert(message_id,user_id,emoji) در public.chat_reactions اجازه احراز هویت داده می‌شود.
به public.chat_reactions اجازه حذف (delete) را به authenticated (احراز هویت شده) بدهید.
به تابع insert(message_id,conversation_id,question,multiple_choice,ends_at,created_by) در public.chat_polls اجازه احراز هویت داده می‌شود.
به public.chat_poll_options تابع insert(poll_id,option_text,position) را اعطا کنید تا احراز هویت شود.
به فایل public.chat_poll_votes، تابع insert(poll_id,option_id,user_id) اجازه احراز هویت داده شود.
تابع update(last_read_at,muted_until) روی public.chat_members احراز هویت شده را فعال کنید.

در صورت وجود، سیاست hgd_chat_conversations_read را در public.chat_conversations حذف کنید.
ایجاد خط‌مشی hgd_chat_conversations_read روی public.chat_conversations برای انتخاب با استفاده از احراز هویت (
 (visibility='public' و kind='channel' و is_active) یا exists(یکی از public.chat_members m را انتخاب کنید که در آن m.conversation_id=id و m.user_id=(select auth.uid())) یا private.hgd_is_chat_moderator()
)؛
در صورت وجود، سیاست hgd_chat_conversations_create را در public.chat_conversations حذف کنید.
ایجاد سیاست hgd_chat_conversations_create در public.chat_conversations برای درج در احراز هویت شده با بررسی (created_by=(select auth.uid()) و نوع ('group','channel') و (visibility='private' یا (kind='channel' و visibility='public')) و مقدار null برای direct_key)؛
سیاست حذف hgd_chat_members_read در صورت وجود روی public.chat_members;
ایجاد سیاست hgd_chat_members_read در public.chat_members برای انتخاب کاربر با استفاده از احراز هویت (user_id=(select auth.uid()) یا private.hgd_is_chat_member(conversation_id) یا private.hgd_is_chat_moderator());
سیاست حذف hgd_chat_members_update_own در صورت وجود روی public.chat_members;
ایجاد سیاست hgd_chat_members_update_own در public.chat_members برای به‌روزرسانی به احراز هویت‌شده با استفاده از (user_id=(select auth.uid())) با بررسی (user_id=(select auth.uid()))؛
در صورت وجود، خط‌مشی hgd_chat_messages_read را در public.chat_messages حذف کن؛
ایجاد خط‌مشی hgd_chat_messages_read روی public.chat_messages برای انتخاب با استفاده از احراز هویت (
 exist(یکی را از public.chat_conversations c انتخاب کنید که در آن c.id=conversation_id و c.is_active و (private.hgd_is_chat_moderator() یا (c.visibility='public' و c.kind='channel') یا exist(یکی را از public.chat_members m انتخاب کنید که در آن m.conversation_id=c.id و m.user_id=(select auth.uid()))))
 و (deleted_at برابر با null یا sender_id=(select auth.uid()) یا private.hgd_is_chat_moderator()) است.)
)؛
در صورت وجود، خط‌مشی حذف hgd_chat_messages_insert در public.chat_messages;
ایجاد خط‌مشی hgd_chat_messages_insert روی public.chat_messages برای درج در احراز هویت با بررسی (
 ‎sender_id=(select auth.uid())‎ و deleted_at برابر با null و pinned_at برابر با null و pinned_by برابر با null است.
 و private.hgd_can_send_chat(conversation_id)
 و (reply_to تهی است یا وجود دارد (یکی از public.chat_messages parent را انتخاب کنید که در آن parent.id=reply_to و parent.conversation_id=conversation_id و parent.deleted_at تهی هستند))
)؛
در صورت وجود، سیاست hgd_chat_messages_update_own را در public.chat_messages حذف کن؛
ایجاد سیاست hgd_chat_messages_update_own در public.chat_messages برای به‌روزرسانی به احراز هویت‌شده با استفاده از (sender_id=(select auth.uid()) و created_at>now()-interval '10 minutes' و deleted_at برابر با null است) با بررسی (sender_id=(select auth.uid()) و pinned_at برابر با null و pinned_by برابر با null است)؛
در صورت وجود، سیاست hgd_chat_messages_moderator_update را در public.chat_messages حذف کنید.
ایجاد سیاست hgd_chat_messages_moderator_update در public.chat_messages برای به‌روزرسانی به احراز هویت‌شده با استفاده از (private.hgd_is_chat_moderator() یا private.hgd_can_manage_chat(conversation_id)) با بررسی (private.hgd_is_chat_moderator() یا private.hgd_can_manage_chat(conversation_id))؛
در صورت وجود، سیاست hgd_chat_reactions_read را در public.chat_reactions حذف کنید؛
ایجاد سیاست hgd_chat_reactions_read روی public.chat_reactions برای انتخاب احراز هویت با استفاده از (exists(select 1 from public.chat_messages m where m.id=message_id and private.hgd_can_read_chat(m.conversation_id)));
حذف سیاست hgd_chat_reactions_insert در صورت وجود روی public.chat_reactions;
ایجاد سیاست hgd_chat_reactions_insert در public.chat_reactions برای درج در احراز هویت با check(user_id=(select auth.uid()) and exists(select 1 from public.chat_messages m where m.id=message_id و m.deleted_at برابر با null و private.hgd_can_send_chat(m.conversation_id)));
حذف سیاست hgd_chat_reactions_delete در صورت وجود روی public.chat_reactions;
ایجاد سیاست hgd_chat_reactions_delete در public.chat_reactions برای حذف به صورت احراز هویت شده با استفاده از(user_id=(select auth.uid()));
در صورت وجود، سیاست حذف hgd_chat_invites_read در public.chat_invites;
ایجاد خط‌مشی hgd_chat_invites_read روی public.chat_invites برای انتخاب با استفاده از احراز هویت (created_by=(select auth.uid()) یا private.hgd_can_manage_chat(conversation_id));
در صورت وجود، سیاست hgd_chat_polls_read را در public.chat_polls حذف کنید؛
ایجاد سیاست hgd_chat_polls_read روی public.chat_polls برای انتخاب احراز هویت با استفاده از (private.hgd_can_read_chat(conversation_id));
در صورت وجود، سیاست hgd_chat_polls_insert را در public.chat_polls حذف کنید؛
ایجاد سیاست hgd_chat_polls_insert در public.chat_polls برای درج در احراز هویت شده با check(created_by=(select auth.uid()) و private.hgd_can_send_chat(conversation_id)) و exists(select 1 from public.chat_messages m where m.id=message_id و m.conversation_id=chat_polls.conversation_id و m.sender_id=(select auth.uid())));
در صورت وجود، سیاست hgd_chat_poll_options_read را در public.chat_poll_options حذف کنید.
ایجاد سیاست hgd_chat_poll_options_read روی public.chat_poll_options برای انتخاب با استفاده از احراز هویت (exists(select 1 from public.chat_polls p where p.id=poll_id and private.hgd_can_read_chat(p.conversation_id)));
در صورت وجود، سیاست hgd_chat_poll_options_insert را در public.chat_poll_options حذف کنید.
ایجاد سیاست hgd_chat_poll_options_insert در public.chat_poll_options برای درج به احراز هویت شده با check(exists(select 1 from public.chat_polls p where p.id=poll_id and p.created_by=(select auth.uid()) and private.hgd_can_send_chat(p.conversation_id)));
در صورت وجود، سیاست hgd_chat_poll_votes_read را در public.chat_poll_votes حذف کنید؛
ایجاد سیاست hgd_chat_poll_votes_read در public.chat_poll_votes برای انتخاب احراز هویت با استفاده از (user_id=(select auth.uid()) یا exists(select 1 from public.chat_polls p where p.id=poll_id and private.hgd_can_read_chat(p.conversation_id)));
در صورت وجود، سیاست حذف hgd_chat_poll_votes_insert در public.chat_poll_votes;
ایجاد سیاست hgd_chat_poll_votes_insert در public.chat_poll_votes برای درج در احراز هویت شده با check(user_id=(select auth.uid()) and exists(select 1 from public.chat_polls p where p.id=poll_id and (p.ends_at is null or p.ends_at>now()) and exists(select 1 from public.chat_poll_options o where o.id=option_id and o.poll_id=poll_id));

تابع ایجاد یا جایگزینی public.create_chat_conversation(p_kind text,p_title text,p_visibility text default 'private',p_description text default '') شناسه کاربری uuid را برمی‌گرداند.
تعریف کننده امنیتی زبان plpgsql، مجموعه search_path = '' به عنوان $$
اعلان v_id uuid؛
شروع
 if auth.uid() null است then raise استثنا 'ابتدا وارد حساب شو' using errcode='42501'; پایان اگر؛
 if p_kind not in ('group','channel') or p_visibility not in ('private','public') or (p_visibility='public' and p_kind<>'channel') then raise exception 'نوع گفتگو یا حریم خصوصی نامعتبر است'; پایان اگر؛
 اجرا کن private.hgd_assert_can_post(در صورتی که p_kind='channel' سپس 'channel' در غیر این صورت 'group' پایان یابد)؛
 درج در public.chat_conversations(kind,visibility,title,description,created_by)
 values(p_kind,p_visibility,left(btrim(p_title),120),left(coalesce(p_description,''),1200),auth.uid()) که id را به v_id برمی‌گرداند؛
 مقادیر (v_id,auth.uid(),'owner') را در public.chat_members(conversation_id,user_id,member_role) وارد کنید.
 انجام private.hgd_write_audit('chat_conversation_created',p_kind,v_id::text,'',jsonb_build_object('visibility',p_visibility));
 بازگرداندن v_id؛
پایان؛ $$؛

تابع ایجاد یا جایگزینی public.create_direct_chat(p_other_user_id uuid) شناسه کاربر uuid را برمی‌گرداند.
تعریف کننده امنیتی زبان plpgsql، مجموعه search_path = '' به عنوان $$
اعلان v_id uuid; متن v_key;
شروع
 اگر auth.uid() null باشد یا p_other_user_id null باشد یا p_other_user_id=auth.uid() سپس استثناء را افزایش دهید 'کاربر مقصد نامعتبر است'; پایان اگر؛
 if exists (انتخاب 1 از public.chat_blocks b که در آن (b.blocker_id=auth.uid() and b.blocked_id=p_other_user_id) یا (b.blocker_id=p_other_user_id and b.blocked_id=auth.uid())) سپس استثناء را با استفاده از قابلیت‌های خصوصی بیان کنید. errcode='42501'; پایان اگر؛
 v_key := کوچکترین(auth.uid()::text,p_other_user_id::text)||':'||بزرگترین(auth.uid()::text,p_other_user_id::text);
 در public.chat_conversations(kind,visibility,title,direct_key,created_by) values('direct','private','spokewgospecific',v_key,auth.uid()) on conflict(direct_key) do update set direct_key=excluded.direct_key return id into v_id; مقدار 'direct_key' را به‌روزرسانی کن. 'direct_key' = 'excluded'.direct_key' شناسه 'direct_key' را به v_id برمی‌گرداند.'
 در صورت بروز اختلاف، مقادیر (v_id,auth.uid(),'member'),(v_id,p_other_user_id,'member') را در public.chat_members(conversation_id,user_id,member_role) وارد کنید. هیچ کاری انجام ندهید.
 بازگرداندن v_id؛
پایان؛ $$؛

تابع ایجاد یا جایگزینی public.join_chat_conversation(p_conversation_id uuid) مقدار بولی را برمی‌گرداند.
تعریف کننده امنیتی زبان plpgsql، مجموعه search_path = '' به عنوان $$
اعلان v public.chat_conversations%rowtype;
شروع
 انتخاب * به v از public.chat_conversations که در آن id=p_conversation_id برای به‌روزرسانی است؛
 if not found or not v.is_active then raise استثنا 'گفتگو در دسترس نیست'; پایان اگر؛
 if v.kind='direct' then raise استثنا 'گفت‌وگوی خصوصی فقط با دعوت مستقیم ایجاد می‌شود' using errcode='42501'; پایان اگر؛
 if v.visibility<>'public' then raise استثنا 'برای عضویت به لینک دعوت معتبر نیاز است' using errcode='42501'; پایان اگر؛
 مقادیر (v.id,auth.uid(),case when v.kind='channel' then 'subscriber' else 'member' end) را در public.chat_members(conversation_id,user_id,member_role) وارد کنید (در صورت وجود تداخل، کاری انجام ندهید)؛
 مقدار درست را برمی‌گرداند؛
پایان؛ $$؛

تابع ایجاد یا جایگزینی public.create_chat_invite(p_conversation_id uuid,p_expires_at timestamptz default null,p_max_uses integer default 20) متن را برمی‌گرداند.
تعریف کننده امنیتی زبان plpgsql، مجموعه search_path = '' به عنوان $$
متن v_code را اعلان کنید؛
شروع
 if not private.hgd_can_manage_chat(p_conversation_id) then raise استثنا 'فقط مدیر گفتگو می‌توان لینک دعوت بسازد' using errcode='42501'; پایان اگر؛
 if p_max_uses<1 or p_max_uses>5000 or (p_expires_at is not null and (p_expires_at<=now() or p_expires_at>now()+interval '365 days')) then raise استثنا 'محدودیت لینک دعوت نامعتبر است'; پایان اگر؛
 درج در public.chat_invites(conversation_id,created_by,expires_at,max_uses) values(p_conversation_id,auth.uid(),p_expires_at,p_max_uses) که invite_code را به v_code برمی‌گرداند؛
 انجام private.hgd_write_audit('chat_invite_created','chat_conversation',p_conversation_id::text,'',jsonb_build_object('max_uses',p_max_uses,'expires_at',p_expires_at));
 کد v_code را برگردانید؛
پایان؛ $$؛

تابع public.join_chat_invite(p_invite_code text) را ایجاد یا جایگزین می‌کند و شناسه کاربری (uuid) را برمی‌گرداند.
تعریف کننده امنیتی زبان plpgsql، مجموعه search_path = '' به عنوان $$
اعلان v public.chat_invites%rowtype; c public.chat_conversations%rowtype;
شروع
 if auth.uid() null است then raise استثنا 'ابتدا وارد حساب شو' using errcode='42501'; پایان اگر؛
 برای به‌روزرسانی، * را از public.chat_invites به v انتخاب کنید که در آن invite_code=p_invite_code;
 if not found or v.revoked_at is noll or (v.expires_at is not null and v.expires_at<=now()) or v.use_count>=v.max_uses then raise exception 'لینک دعوت منقضی، لغو یا تکمیل شده است'; پایان اگر؛
 از public.chat_conversations * را در c انتخاب کنید که در آن id=v.conversation_id و is_active برای به‌روزرسانی است؛
 if not found or c.kind='direct' then raise استثنا 'گفتگو در دسترس نیست'; پایان اگر؛
 اگر وجود داشته باشد (یکی از public.chat_blocks را انتخاب کنید b به public.chat_members m در m.conversation_id=c.id و (m.user_id=b.blocker_id یا m.user_id=b.blocked_id) که در آن (b.blocker_id=auth.uid() و b.blocked_id=m.user_id) یا (b.blocked_id=auth.uid() و b.blocker_id=m.user_id)) سپس با استفاده از errcode='42501' استثنای 'عضویت به دلیل تنظیم حریم خصوصی ممکن نیست' را ایجاد کنید؛ پایان اگر؛
 مقادیر (c.id,auth.uid(),c.kind='channel' then 'subscriber' else 'member' end) را در public.chat_members(conversation_id,user_id,member_role) وارد کنید (در صورت وجود تداخل، هیچ کاری انجام ندهید)؛
 اگر وجود ندارد (1 را از public.chat_members انتخاب کنید که در آن talk_id=c.id و user_id=auth.uid()) سپس استثناء را افزایش دهید 'عضویت انجام نشد'; پایان اگر؛
 به‌روزرسانی public.chat_invites تنظیم use_count=use_count+1 که در آن id=v.id;
 شناسه c. را برگردانید؛
پایان؛ $$؛

تابع public.pin_chat_message(p_message_id uuid,p_pin boolean,p_reason text default '') را ایجاد یا جایگزین می‌کند. مقدار بولی را برمی‌گرداند.
تعریف کننده امنیتی زبان plpgsql، مجموعه search_path = '' به عنوان $$
اعلان v_conv uuid؛
شروع
 از public.chat_messages، id_conversation را به v_conv انتخاب کن، جایی که id=p_message_id;
 اگر یافت نشد یا private.hgd_can_manage_chat(v_conv) سپس Exception 'اجازهٔ سنجاق‌کردن این پیام را نداری' با استفاده از errcode='42501'; پایان اگر؛
 به‌روزرسانی public.chat_messages تنظیم می‌کند pinned_at=case وقتی p_pin و سپس now() در غیر این صورت null end، pinned_by=case وقتی p_pin و سپس auth.uid() در غیر این صورت null end که id=p_message_id;
 تابع private.hgd_write_audit را اجرا کن (اگر p_pin باشد، آنگاه 'chat_message_pinned' در غیر این صورت 'chat_message_unpinned' پایان، 'chat_message'، p_message_id::text، p_reason، '{}'::jsonb);
 مقدار درست را برمی‌گرداند؛
پایان؛ $$؛

تابع ایجاد یا جایگزینی public.create_chat_poll(p_conversation_id uuid,p_question text,p_options text[],p_multiple_choice boolean default false,p_ends_at timestamptz default null) شناسه کاربری uuid را برمی‌گرداند.
تعریف کننده امنیتی زبان plpgsql، مجموعه search_path = '' به عنوان $$
اعلان v_message_id uuid; v_poll_id uuid; v_option text; v_pos integer := 0; v_count integer;
شروع
 if auth.uid() null است then raise استثنا 'ابتدا وارد حساب شو' using errcode='42501'; پایان اگر؛
 انجام private.hgd_assert_can_post('چت');
 if not private.hgd_can_send_chat(p_conversation_id) سپس Exception 'اجازه ایجاد نظرسنجی در این گفتگو را نداری' با استفاده از errcode='42501'; پایان اگر؛
 اگر char_length(btrim(coalesce(p_question,''))) بین 2 و 240 نباشد سپس استثناء را افزایش دهید 'پرسش نظرسنجی نامعتبر است'; پایان اگر؛
 if p_options is null or cardinality(p_options) < 2 or cardinality(p_options) > 10 then raise استثنا 'نظرسنجی باید بین ۲ تا ۱۰ گزینه داشته باشید'; پایان اگر؛
 if p_ends_at is not null and p_ends_at <= now() then raise استثنا 'زمان پایان در آینده باشد'; پایان اگر؛
 تابع (*)count را از (select distinct left(btrim(x),160) as option_text from unnest(p_options) x که در آن char_length(btrim(x)) بین ۱ و ۱۶۰ است) به v_count انتخاب کن.
 if v_count < 2 or v_count <> cardinality(p_options) then raise exception 'گزینه‌ها نباید خالی یا تکراری باشند'; پایان اگر؛
 درج در public.chat_messages(conversation_id,body) values(p_conversation_id,'نظرسنجی: '||left(btrim(p_question),240)) که شناسه را به v_message_id برمی‌گرداند؛
 درج در public.chat_polls(message_id,conversation_id,question,multiple_choice,ends_at,created_by) values(v_message_id,p_conversation_id,left(btrim(p_question),240),coalesce(p_multiple_choice,false),p_ends_at,auth.uid()) که شناسه را در v_poll_id برمی‌گرداند؛
 حلقه foreach v_option در آرایه p_options
   v_pos := v_pos + 1;
   مقادیر (v_poll_id,left(btrim(v_option),160),v_pos) را در public.chat_poll_options(poll_id,option_text,position) وارد کنید.
 حلقه پایان؛
 انجام private.hgd_write_audit('chat_poll_created','chat_poll',v_poll_id::text,'',jsonb_build_object('conversation_id',p_conversation_id,'options_count',cardinality(p_options)));
 بازگرداندن v_poll_id;
پایان؛ $$؛

تابع ایجاد یا جایگزینی public.vote_chat_poll(p_poll_id uuid,p_option_id uuid) مقدار بولی را برمی‌گرداند.
تعریف کننده امنیتی زبان plpgsql، مجموعه search_path = '' به عنوان $$
نوع ردیف v_poll را public.chat_polls% تعریف کنید.
شروع
 if auth.uid() null است then raise استثنا 'ابتدا وارد حساب شو' using errcode='42501'; پایان اگر؛
 برای به‌روزرسانی، * را در v_poll از public.chat_polls انتخاب کنید که در آن id=p_poll_id است.
 if not found or (v_poll.ends_at is not null and v_poll.ends_at<=now()) then raise استثنا 'نظرسنجی پیدا نشد یا پایان یافته است'; پایان اگر؛
 اگر private.hgd_can_read_chat(v_poll.conversation_id) نیست یا private.hgd_can_send_chat(v_poll.conversation_id) نیست، سپس استثناء را با استفاده از errcode='42501'، "اجازه رأی‌دادن در این نظرسنجی را نداری" مطرح کنید. پایان اگر؛
 اگر وجود ندارد (1 را از public.chat_poll_options که در آن id=p_option_id و poll_id=p_poll_id انتخاب کنید) سپس استثناء را افزایش دهید 'گزینهٔ این نظرسنجی معتبر نیست'; پایان اگر؛
 اگر v_poll.multiple_choice نیست و وجود دارد (1 را از public.chat_poll_votes انتخاب کنید که در آن poll_id=p_poll_id و user_id=auth.uid()) سپس استثناء را مطرح کنید 'قبلاً در این نظرسنجی رأی داده‌ای'; پایان اگر؛
 مقادیر (p_poll_id,p_option_id,auth.uid()) را در public.chat_poll_votes(poll_id,option_id,user_id) وارد کنید و در صورت تداخل، هیچ کاری انجام ندهید.
 مقدار درست را برمی‌گرداند؛
پایان؛ $$؛

لغو همه موارد روی تابع public.create_chat_conversation(text,text,text,text) از public,anon;
همه موارد موجود در تابع public.create_direct_chat(uuid) را از public,anon لغو کنید.
لغو همه موارد روی تابع public.join_chat_conversation(uuid) از public,anon;
همه را در تابع public.create_chat_invite(uuid,timestamptz,integer) از public,anon لغو کنید.
لغو همه موارد در تابع public.join_chat_invite(text) از public,anon;
همه موارد مربوط به تابع public.pin_chat_message(uuid,boolean,text) را از public,anon لغو کن.
همه موارد موجود در تابع public.create_chat_poll(uuid,text,text[],boolean,timestamptz) را از public,anon لغو کن؛
لغو همه موارد روی تابع public.vote_chat_poll(uuid,uuid) از public,anon;
به تابع public.create_chat_conversation(text,text,text,text) اجازه اجرا برای احراز هویت داده می‌شود.
به تابع public.create_direct_chat(uuid) اجازه اجرا روی شناسه احراز هویت شده را بدهید.
به تابع public.join_chat_conversation(uuid) اجازه اجرا داده شود تا احراز هویت انجام شود.
به تابع public.create_chat_invite(uuid,timestamptz,integer) اجازه اجرا برای احراز هویت داده می‌شود؛
به تابع public.join_chat_invite(text) اجازه اجرا بدهید تا احراز هویت انجام شود؛
به تابع public.pin_chat_message(uuid,boolean,text) اجازه اجرا بده تا احراز هویت انجام شود.
به تابع public.create_chat_poll(uuid,text,text[],boolean,timestamptz) اجازه اجرا برای احراز هویت داده می‌شود.
به تابع public.vote_chat_poll(uuid,uuid) اجازه اجرا روی تابع را بدهید تا احراز هویت انجام شود.

---------------------------
-- گزارش اشتباه واحد برای چت، مباحث، کانال و حساب ها
---------------------------
اگر جدول public.community_reports وجود ندارد، آن را ایجاد کن (
  شناسه uuid کلید اصلی پیش‌فرض gen_random_uuid(),
  ‎reporter_id uuid ‎ارجاعات تهی نیست auth.users(id)‎ در هنگام حذف محدود می‌کند،
  متن target_type تهی نیست. بررسی کنید(target_type در ('chat_message','debate_post','debate_topic','discussion_group','chat_conversation','user','book','announcement')),
  متن target_id تهی نیست. بررسی کنید (char_length(target_id) بین ۱ تا ۱۶۰ باشد)،
  دلیل عدم تأیید متن (دلیل در ('توهین'، 'آزار و اذیت'، 'خارج از موضوع'، 'هرزنامه'، 'کلاهبرداری'، 'جعل هویت'، 'حریم خصوصی'، 'نامناسب'، 'نفرت'، 'فایل_مخرب'، 'سوءاستفاده_از_گروه'، 'کپی‌رایت'، 'سایر'))
  متن توضیحات تهی نیست پیش‌فرض '' بررسی(char_length(description)<=2000),
  متن وضعیت تهی نیست. پیش‌فرض 'جدید' است. بررسی کنید (وضعیت در ('جدید'، 'در حال بررسی'، 'need_info'، 'رد شده'، 'حل شده'، 'تجدید نظر شده')),
  متن داخلی یادداشت تهی نیست پیش‌فرض '' بررسی(طول_کاراکتر(داخلی_یادداشت)<=4000),
  متن وضوح تصویر تهی نیست پیش‌فرض '' بررسی(char_length(وضوح)<=2000),
  uuid اختصاص داده شده به auth.users(id) در هنگام حذف، مقدار null را تنظیم می‌کند.
  resolve_by uuid هنگام حذف، به auth.users(id) ارجاع می‌دهد و مقدار null را تعیین می‌کند.
  resolved_at timestamptz،
  created_at timestamptz تهی نیست، پیش‌فرض now()
  updated_at timestamptz تهی نیست. پیش‌فرض now() است.
  منحصر به فرد(شناسه گزارشگر، نوع هدف، شناسه هدف، دلیل)
)؛
اگر community_reports_status_created_idx وجود ندارد، آن را روی public.community_reports(status,created_at desc); ایجاد کن.
اگر community_reports_target_idx وجود ندارد، آن را روی public.community_reports(target_type,target_id) ایجاد کن.
تغییر جدول public.community_reports امنیت سطح ردیف را فعال می‌کند؛
همه گزارش‌های عمومی public.community_reports را از ناشناس، احراز هویت شده، لغو کن.
به public.community_reports اجازه select,insert,update را بدهید تا احراز هویت شود.
در صورت وجود، سیاست hgd_reports_insert_own را در public.community_reports حذف کنید؛
ایجاد سیاست hgd_reports_insert_own در public.community_reports برای درج در احراز هویت شده با check(reporter_id=(select auth.uid()) و status='new' و internal_note='' و resolution='' و assign_to برابر با null و resolved_by برابر با null و resolved_at برابر با null است)؛
در صورت وجود، سیاست hgd_reports_read_own_or_moderator را در public.community_reports حذف کنید.
ایجاد سیاست hgd_reports_read_own_or_moderator در public.community_reports برای انتخاب احراز هویت با استفاده از (reporter_id=(select auth.uid()) یا private.hgd_is_moderator());
در صورت وجود، سیاست hgd_reports_moderator_update را در public.community_reports حذف کنید.
ایجاد سیاست hgd_reports_moderator_update در public.community_reports برای به‌روزرسانی به احراز هویت‌شده با استفاده از(private.hgd_is_moderator()) با بررسی(private.hgd_is_moderator())؛

---------------------------
-- میز مطالعه: یک کتاب شخصی تا سقف 100 MiB، یادداشت و پیشرفت همگام
---------------------------
اگر جدول public.personal_books وجود ندارد، آن را ایجاد کن (
  کلید اصلی user_id uuid در فرآیند حذف آبشاری به auth.users(id) ارجاع می‌دهد.
  متن عنوان تهی نیست. بررسی(char_length(btrim(title)) بین ۱ تا ۲۰۰)
  متن توضیحات تهی نیست پیش‌فرض '' بررسی(char_length(description)<=2000),
  متن bucket_id تهی نیست، پیش‌فرض 'hamghadam-personal-books' است، بررسی (bucket_id='hamghadam-personal-books')،
  متن مسیر شیء تهی نیست، بررسی منحصر به فرد (char_length(مسیر شیء)<=700)،
  متن file_name تهی نیست. بررسی کنید (char_length(btrim(file_name)) بین ۱ و ۲۵۵ باشد)،
  متن mime_type تهی نیست، بررسی کنید (char_length(mime_type)<=160)،
  size_bytes متغیر bigint را بررسی می‌کند که تهی نباشد (size_bytes بین ۱ و ۱۰۴۸۵۷۶۰۰ باشد)،
  بررسی عدد صحیح تعداد صفحات (تعداد صفحات تهی است یا تعداد صفحات بین ۱ تا ۲۰۰۰۰۰ است)،
  progress_page عدد صحیح نیست تهی پیش‌فرض ۰ بررسی (progress_page>=0),
  updated_at timestamptz تهی نیست. پیش‌فرض now() است.
  created_at timestamptz تهی نیست، پیش‌فرض now()
)؛
تغییر جدول public.personal_books امنیت سطح ردیف را فعال می‌کند؛
همه موارد موجود در public.personal_books را از ناشناس، احراز هویت شده، لغو کن.
به public.personal_books دسترسی select,insert,update,delete را بدهید تا احراز هویت شود.
در صورت وجود hgd_personal_books_own در public.personal_books، سیاست حذف می‌شود.
ایجاد خط‌مشی hgd_personal_books_own روی public.personal_books برای انتخاب جهت احراز هویت با استفاده از (user_id=(select auth.uid()));
سیاست حذف hgd_personal_books_insert_own در صورت وجود روی public.personal_books;
ایجاد سیاست hgd_personal_books_insert_own روی public.personal_books برای درج به صورت احراز هویت شده با check(user_id=(select auth.uid()) و bucket_id='hamghadam-personal-books' و object_path مانند (select auth.uid())::text||'/%');
در صورت وجود، سیاست hgd_personal_books_update_own را در public.personal_books حذف کنید؛
ایجاد سیاست hgd_personal_books_update_own در public.personal_books برای به‌روزرسانی به احراز هویت‌شده با استفاده از(user_id=(select auth.uid())) با بررسی(user_id=(select auth.uid()) و مسیر شیء مانند (select auth.uid())::text||'/%' و size_bytes<=104857600);
سیاست حذف hgd_personal_books_delete_own در صورت وجود روی public.personal_books;
ایجاد سیاست hgd_personal_books_delete_own در public.personal_books برای حذف با استفاده از احراز هویت (user_id=(select auth.uid()));

اگر جدول وجود ندارد، آن را ایجاد کن public.study_notes (
  شناسه uuid کلید اصلی پیش‌فرض gen_random_uuid(),
  شناسه کاربری uuid تهی نیست. ارجاعات auth.users(id) در حذف آبشاری
  متن عنوان تهی نیست. بررسی(char_length(btrim(title)) بین ۱ تا ۲۰۰)
  متن بدنه تهی نیست پیش‌فرض '' بررسی(char_length(body)<=30000),
  متن مرجع تهی نیست پیش‌فرض '' بررسی(char_length(reference)<=500),
  is_private مقدار بولی ندارد، مقدار پیش‌فرض درست است.
  updated_at timestamptz تهی نیست. پیش‌فرض now() است.
  created_at timestamptz تهی نیست، پیش‌فرض now()
)؛
اگر فایل study_notes_user_updated_idx وجود ندارد، آن را روی public.study_notes(user_id,updated_at desc) ایجاد کن.
تغییر جدول public.study_notes امنیت سطح سطر را فعال می‌کند؛
همه موارد موجود در public.study_notes را از ناشناس، احراز هویت شده، لغو کنید.
به public.study_notes اجازه دهید تا دستورات select، insert، update، delete را به authenticated اعطا کند.
در صورت وجود، سیاست حذف hgd_study_notes_own در public.study_notes;
ایجاد سیاست hgd_study_notes_own در public.study_notes برای همه جهت احراز هویت با استفاده از(user_id=(select auth.uid())) با بررسی(user_id=(select auth.uid()));

اگر جدول وجود ندارد، آن را ایجاد کن public.study_progress (
  شناسه کاربری uuid تهی نیست. ارجاعات auth.users(id) در حذف آبشاری
  متن کلید درس تهی نیست. بررسی کنید (طول کاراکتر (کلید درس) بین ۱ تا ۲۴۰ باشد)،
  عدد صحیح شماره صفحه، غیر تهی، پیش‌فرض ۰، بررسی (شماره صفحه>=۰)،
  درصد پیشرفت عددی(5،2) غیر تهی، پیش‌فرض 0، بررسی(درصد پیشرفت بین 0 تا 100)،
  last_studied_at timestamptz تهی نیست، پیش‌فرض now() است.
  completed_at timestamptz،
  updated_at timestamptz تهی نیست. پیش‌فرض now() است.
  کلید اصلی (شناسه_کاربر، کلید_درس)
)؛
تغییر جدول public.study_progress فعال کردن امنیت سطح سطر؛
لغو همه موارد در public.study_progress از ناشناس، احراز هویت شده؛
به public.study_progress اجازه دهید تا دستورات select، insert، update، delete را به صورت authenticated اجرا کند.
در صورت وجود، سیاست hgd_study_progress_own را در public.study_progress حذف کنید؛
ایجاد سیاست hgd_study_progress_own در public.study_progress برای همه جهت احراز هویت با استفاده از (user_id=(select auth.uid())) با بررسی (user_id=(select auth.uid()))؛

اگر جدول public.flashcards وجود ندارد، آن را ایجاد کن (
  شناسه uuid کلید اصلی پیش‌فرض gen_random_uuid(),
  شناسه کاربری uuid تهی نیست. ارجاعات auth.users(id) در حذف آبشاری
  متن جلویی تهی نیست. بررسی(char_length(btrim(front)) بین ۱ تا ۲۰۰۰)
  متن برگشتی تهی نیست check(char_length(btrim(back)) بین ۱ تا ۴۰۰۰),
  متن عرشه تهی نیست. پیش‌فرض 'عمومی' است. بررسی کنید (char_length(deck) بین ۱ تا ۱۲۰ باشد)،
  متن source_reference تهی نیست پیش‌فرض '' بررسی(char_length(source_reference)<=500),
  ease_factor عددی(4,2) غیر تهی، پیش‌فرض ۲.۵۰، بررسی (ease_factor بین ۱.۳۰ و ۴.۰۰)،
  interval_days عدد صحیح نیست null پیش‌فرض 0 بررسی (interval_days بین 0 و 3650)،
  due_at timestamptz تهی نیست، پیش‌فرض now()
  تکرارها عدد صحیح نیستند، پیش‌فرض ۰ است، بررسی (تکرارها>=۰)،
  created_at timestamptz تهی نیست، پیش‌فرض now()
  updated_at timestamptz تهی نیست. پیش‌فرض now()
)؛
اگر flashcards_review_idx در public.flashcards(user_id,due_at) وجود ندارد، ایندکس ایجاد کن.
تغییر جدول public.flashcards امنیت سطح ردیف را فعال می‌کند؛
همه موارد موجود در public.flashcards را از ناشناس، احراز هویت شده، لغو کنید.
به public.flashcards اجازه انتخاب، درج، به‌روزرسانی، حذف را بدهید تا احراز هویت شود.
در صورت وجود hgd_flashcards_own در public.flashcards، سیاست حذف شود.
ایجاد سیاست hgd_flashcards_own در public.flashcards برای همه جهت احراز هویت با استفاده از(user_id=(select auth.uid())) با بررسی(user_id=(select auth.uid()));

اگر جدول public.flashcard_reviews وجود ندارد، آن را ایجاد کن (
  شناسه uuid کلید اصلی پیش‌فرض gen_random_uuid(),
  ‎flashcard_id uuid ارجاع تهی ندارد public.flashcards(id)‎ در حذف آبشاری،
  شناسه کاربری uuid تهی نیست. ارجاعات auth.users(id) در حذف آبشاری
  بررسی کیفیت smallint نه null (کیفیت بین ۰ تا ۵)،
  previous_interval_days عدد صحیح نیست، پیش‌فرض ۰ است. بررسی کنید (previous_interval_days>=0),
  متغیر next_interval_days عدد صحیح و غیر تهی است. بررسی کنید (next_interval_days>=0),
  reviewed_at timestamptz تهی نیست، پیش‌فرض now()
)؛
اگر flashcard_reviews_user_date_idx وجود ندارد، آن را روی public.flashcard_reviews(user_id,reviewed_at desc) ایجاد کن.
تغییر جدول public.flashcard_reviews امنیت سطح ردیف را فعال می‌کند؛
لغو همه موارد در public.flashcard_reviews از ناشناس، احراز هویت شده؛
به تابع select,insert در public.flashcard_reviews اجازه دهید تا احراز هویت شود.
سیاست حذف hgd_flashcard_reviews_own در public.flashcard_reviews در صورت وجود؛
ایجاد خط‌مشی hgd_flashcard_reviews_own در public.flashcard_reviews برای انتخاب احراز هویت با استفاده از (user_id=(select auth.uid()));
سیاست حذف hgd_flashcard_reviews_insert_own در صورت وجود در public.flashcard_reviews;
ایجاد سیاست hgd_flashcard_reviews_insert_own در public.flashcard_reviews برای درج به احراز هویت شده با check(user_id=(select auth.uid()) and exists(select 1 from public.flashcards f where f.id=flashcard_id and f.user_id=(select auth.uid())));

---------------------------
-- آزمون، ثبت پاسخ سمت سرور و امتیاز مجازی غیرقابل جعل از کلاینت
---------------------------
اگر جدول public.hamghadam_quizzes وجود ندارد، آن را ایجاد کن (
  شناسه uuid کلید اصلی پیش‌فرض gen_random_uuid(),
  متن slug تهی نیست. بررسی منحصر به فرد (slug ~ '^[a-z0-9-]{2,80}$'),
  متن عنوان تهی نیست. بررسی(char_length(btrim(title)) بین ۲ تا ۲۰۰)
  متن توضیحات تهی نیست پیش‌فرض '' بررسی(char_length(description)<=3000),
  متن دسته‌بندی تهی نیست. پیش‌فرض 'عمومی' است. بررسی کنید (char_length(category) بین ۱ تا ۱۰۰ باشد)،
  متن دشواری تهی نیست. پیش‌فرض 'متوسط' است. بررسی کنید (دشواری در ('آسان'، 'متوسط'، 'سخت')) باشد.
  متن وضعیت تهی نیست. پیش‌فرض «پیش‌نویس» است. بررسی کنید (وضعیت در («پیش‌نویس»، «منتشر شده»، «بایگانی شده»)) باشد.
  starts_at timestamptz،
  ends_at زمان مهر،
  uuid ایجاد شده توسط uuid ارجاعات تهی ندارد auth.users(id) هنگام حذف محدود می‌شود،
  created_at timestamptz تهی نیست، پیش‌فرض now()
  updated_at timestamptz تهی نیست. پیش‌فرض now() است.
  بررسی (ends_at تهی است یا starts_at تهی است یا ends_at>starts_at است)
)؛
اگر hamghadam_quizzes_published_idx وجود ندارد، ایندکس را روی public.hamghadam_quizzes(status,starts_at,ends_at); ایجاد کن.
اگر جدول public.hamghadam_quiz_questions وجود ندارد، آن را ایجاد کن (
  شناسه uuid کلید اصلی پیش‌فرض gen_random_uuid(),
  ‎quis_id uuid ارجاعات تهی نیست public.hamghadam_quizzes(id)‎ هنگام حذف آبشاری،
  متن اعلان تهی نیست. بررسی(char_length(btrim(prompt)) بین ۱ تا ۳۰۰۰)،
  گزینه‌های jsonb تهی نیستند. بررسی کنید (jsonb_typeof(options)='array' و jsonb_array_length(options) بین ۲ و ۶ و pg_catalog.octet_length(options::text)<=12000),
  تابع correct_index نوع داده smallint را بررسی می‌کند که مقدار null نداشته باشد (شاخص صحیح بین ۰ و ۵ باشد).
  متن توضیح تهی نیست پیش‌فرض '' بررسی(char_length(توضیح)<=3000),
  نقاط عدد صحیح غیر تهی، پیش‌فرض ۱۰، بررسی (امتیاز بین ۰ تا ۱۰۰۰)،
  موقعیت عدد صحیح، غیر تهی، پیش‌فرض ۰، بررسی (موقعیت بین ۰ تا ۱۰۰۰۰)،
  created_at timestamptz تهی نیست، پیش‌فرض now()
  منحصر به فرد(quiz_id,position)
)؛
ایجاد ایندکس در صورت عدم وجود quiz_questions_quiz_pos_idx روی public.hamghadam_quiz_questions(quiz_id,position);
اگر جدول وجود ندارد، آن را ایجاد کن public.hamghadam_quiz_attempts (
  شناسه uuid کلید اصلی پیش‌فرض gen_random_uuid(),
  ‎quis_id uuid ارجاعات تهی نیست public.hamghadam_quizzes(id)‎ هنگام حذف آبشاری،
  شناسه کاربری uuid تهی نیست. ارجاعات auth.users(id) در حذف آبشاری
  متن وضعیت تهی نیست. پیش‌فرض 'in_progress' است. بررسی (وضعیت در ('in_progress','submitted','abandoned')),
  نمره عدد صحیح نیست، پیش‌فرض ۰ است، بررسی (نمره>=۰)،
  total_points عدد صحیح نیست، مقدار پیش‌فرض ۰ است. بررسی کنید (total_points>=0),
  started_at timestamptz تهی نیست، پیش‌فرض now(),
  Posted_at timestamptz،
  منحصر به فرد (شناسه، شناسه کاربر)
)؛
اگر quiz_attempts_user_started_idx وجود ندارد، ایندکس را روی public.hamghadam_quiz_attempts(user_id,started_atdesc); ایجاد کن.
اگر جدول وجود ندارد، آن را ایجاد کن public.hamghadam_quiz_answers (
  شناسه uuid کلید اصلی پیش‌فرض gen_random_uuid(),
  ‎'tate_id uuid ارجاع تهی نیست public.hamghadam_quiz_attempts(id) on delete cascade,'‎
  شناسه سوال uuid ارجاعات تهی نیست public.hamghadam_quiz_questions(id) on delete cascade,
  شناسه کاربری uuid تهی نیست. ارجاعات auth.users(id) در حذف آبشاری
  answer_index smallint بررسی می‌کند که آیا مقدار متغیر answer_index بین ۰ تا ۵ است یا خیر.
  مقدار بولی is_correct برابر با null نیست.
  points_awarded عدد صحیح نیست null پیش‌فرض 0 بررسی (points_awarded بین 0 تا 1000)،
  replies_at timestamptz null نیست، پیش‌فرض now(),
  منحصر به فرد(شناسه_تلاش، شناسه_سوال)
)؛
ایجاد جدول در صورت عدم وجود public.hamghadam_point_ledger (
  شناسه bigint همیشه به عنوان کلید اصلی هویت تولید می‌شود،
  شناسه کاربری uuid تهی نیست. ارجاعات auth.users(id) در حذف آبشاری
  دلتا عدد صحیح نیست، بررسی تهی بودن (دلتا بین -100000 و 100000)
  دلیل تهی نبودن متن، بررسی (char_length(reason) بین ۱ تا ۲۴۰)
  متن event_key تهی نیست. بررسی کنید (char_length(event_key) بین ۱ تا ۲۴۰ باشد)،
  متن reference_id،
  created_at timestamptz تهی نیست، پیش‌فرض now()
  منحصر به فرد(شناسه_کاربر، کلید_رویداد)
)؛
اگر point_ledger_user_created_idx روی public.hamghadam_point_ledger(user_id,created_at desc) وجود ندارد، ایندکس ایجاد کن.
تغییر جدول public.hamghadam_quizzes فعال کردن امنیت سطح سطر؛
تغییر جدول public.hamghadam_quiz_questions فعال کردن امنیت سطح سطر؛
تغییر جدول public.hamghadam_quiz_attempts فعال کردن امنیت سطح ردیف؛
تغییر جدول public.hamghadam_quiz_answers فعال کردن امنیت سطح سطر؛
تغییر جدول public.hamghadam_point_ledger فعال کردن امنیت سطح ردیف؛
لغو همه موارد موجود در public.hamghadam_quizzes، public.hamghadam_quiz_questions، public.hamghadam_quiz_attempts، public.hamghadam_quiz_answers، public.hamghadam_point_ledger از ناشناس، احراز هویت شده؛
به public.hamghadam_quizzes اجازه انتخاب، درج، به‌روزرسانی، حذف را برای احراز هویت‌شده بدهید؛
به public.hamghadam_quiz_questions اجازه انتخاب، درج، به‌روزرسانی، حذف را برای احراز هویت‌شده اعطا کن؛
اعطای مجوز انتخاب روی public.hamghadam_quiz_attempts,public.hamghadam_quiz_answers,public.hamghadam_point_ledger برای احراز هویت؛
در صورت وجود، خط‌مشی حذف hgd_quiz_public_list در public.hamghadam_quizzes؛
ایجاد خط‌مشی hgd_quiz_public_list روی public.hamghadam_quizzes برای انتخاب احراز هویت‌شده با استفاده از (status='published' یا private.hgd_is_admin());
در صورت وجود، سیاست hgd_quiz_admin_manage را در public.hamghadam_quizzes حذف کنید.
ایجاد سیاست hgd_quiz_admin_manage روی public.hamghadam_quizzes برای همه جهت احراز هویت با استفاده از(private.hgd_is_admin()) با بررسی(private.hgd_is_admin() و created_by=(select auth.uid()));
-- سوالات و فهرست پاسخ صحیح از کلاینت معمولی SELECT پنهان هستند؛ get_public_quiz اشیاء سوال امن را برمی‌گرداند.
سیاست حذف در صورت وجود hgd_quiz_questions_admin_only در public.hamghadam_quiz_questions;
ایجاد سیاست hgd_quiz_questions_admin_only روی public.hamghadam_quiz_questions برای همه جهت احراز هویت با استفاده از(private.hgd_is_admin()) با بررسی(private.hgd_is_admin());
سیاست حذف در صورت وجود hgd_quiz_attempts_own_read در public.hamghadam_quiz_attempts;
ایجاد سیاست hgd_quiz_attempts_own_read روی public.hamghadam_quiz_attempts برای انتخاب احراز هویت با استفاده از (user_id=(select auth.uid()) یا private.hgd_is_admin());
سیاست حذف پاسخ‌های hgd_quiz_answers_own_read در صورت وجود، در public.hamghadam_quiz_answers;
ایجاد سیاست hgd_quiz_answers_own_read روی public.hamghadam_quiz_answers برای انتخاب کاربر احراز هویت شده با استفاده از (user_id=(select auth.uid()) یا private.hgd_is_admin());
سیاست حذف در صورت وجود hgd_point_ledger_own_read در public.hamghadam_point_ledger;
ایجاد سیاست hgd_point_ledger_own_read در public.hamghadam_point_ledger برای انتخاب احراز هویت با استفاده از(user_id=(select auth.uid()) یا private.hgd_is_admin());

تابع public.get_public_quiz(p_quiz_id uuid) را ایجاد یا جایگزین کنید. این تابع jsonb را برمی‌گرداند.
تعریف‌کننده‌ی امنیت پایدار زبان plpgsql، مجموعه‌ی search_path = '' as $$
اعلان v_quiz به صورت public.hamghadam_quizzes%rowtype; v_questions به صورت jsonb;
شروع
 select * into v_quiz from public.hamghadam_quizzes q where q.id=p_quiz_id and (private.hgd_is_admin() or (q.status='published' and (q.starts_at is null or q.starts_at<=now()) and (q.ends_at is null or q.ends_at>now())));
 if not found then raise استثنا 'آزمون پیدا نشد یا در دسترس نیست'; پایان اگر؛
 `select coalesce(jsonb_agg(jsonb_build_object('id',id,'prompt',prompt,'options',options,'points',points,'position',position) order by position),'[]'::jsonb) into v_questions from public.hamghadam_quiz_questions where quiz_id=p_quiz_id;` ` ...
 return jsonb_build_object('id',v_quiz.id,'title',v_quiz.title,'description',v_quiz.description,'category',v_quiz.category,'difficulty',v_quiz.difficulty,'questions',v_questions);
پایان؛ $$؛

تابع public.submit_hamghadam_quiz_answer(p_quiz_id uuid,p_question_id uuid,p_answer_index smallint) را ایجاد یا جایگزین می‌کند. jsonb را برمی‌گرداند.
تعریف کننده امنیتی زبان plpgsql، مجموعه search_path = '' به عنوان $$
اعلان v_user uuid:=auth.uid(); v_correct integer; v_points integer; v_explanation text; v_options jsonb; v_attempt public.hamghadam_quiz_attempts%rowtype; v_is_correct boolean; v_answer_id uuid; v_score integer; v_score integer;
شروع
 اگر v_user null است پس از آن استثنا را افزایش دهید 'ابتدا وارد حساب شو' using errcode='42501'; پایان اگر؛
 اگر p_answer_index<0 یا p_answer_index>5 سپس استثناء را مطرح کنید 'گزینهٔ پاسخ نامعتبر است'; پایان اگر؛
 انجام private.hgd_assert_can_post('community');
 اگر وجود ندارد (یکی از public.hamghadam_quizzes q را انتخاب کن که در آن q.id=p_quiz_id و q.status='published' و (q.starts_at برابر با null یا q.starts_at<=now()) و (q.ends_at برابر با null یا q.ends_at>now())) باشد، آنگاه استثنای 'آزمون در دسترس نیست' را ایجاد کن؛ پایان اگر؛
 انتخاب تابع‌های correct_index,points,explanation,options به صورت v_correct,v_points,v_explanation,v_options از public.hamghadam_quiz_questions که در آن id=p_question_id و quiz_id=p_quiz_id;
 if not found then raise استثنا 'سؤال به این آزمون تعلق ندارد'; پایان اگر؛
 اگر p_answer_index >= jsonb_array_length(v_options) سپس استثناء را افزایش دهید 'گزینهٔ پاسخ در این سؤال وجود ندارد'; پایان اگر؛
 انتخاب * به v_attempt از public.hamghadam_quiz_attempts که در آن quiz_id=p_quiz_id و user_id=v_user و status='in_progress' مرتب شده بر اساس started_at desc محدودیت ۱ برای به‌روزرسانی؛
 اگر پیدا نشد، در public.hamghadam_quiz_attempts(quiz_id,user_id) values(p_quiz_id,v_user) مقدار * را در v_attempt برمی‌گرداند؛ پایان اگر؛
 v_is_correct := p_answer_index=v_correct;
 درج در public.hamghadam_quiz_answers(attempt_id,question_id,user_id,answer_index,is_correct,points_awards)
 مقادیر(v_attempt.id,p_question_id,v_user,p_answer_index,v_is_correct,case when v_is_correct then v_points else 0 end) شناسه را به v_answer_id برمی‌گردانند؛
 اگر v_is_correct و v_points>0 باشد، آنگاه
   درج در public.hamghadam_point_ledger(user_id,delta,reason,event_key,reference_id)
   values(v_user,v_points,'پاسخ درست آزمون','quiz:'||v_attempt.id::text||':'||p_question_id::text,v_answer_id::text)
   در مورد conflict(user_id,event_key) هیچ کاری انجام نده؛
 پایان اگر؛
 به‌روزرسانی public.hamghadam_quiz_attempts تنظیم score=score+case وقتی v_is_correct سپس v_points در غیر این صورت 0 end,total_points=total_points+v_points where id=v_attempt.id نمره را در v_score برمی‌گرداند؛
 return jsonb_build_object('correct',v_is_correct,'points_awarded',case when v_is_correct then v_points else 0 end,'score',v_score,'explanation',v_explanation,'attempt_id',v_attempt.id);
استثنا وقتی unique_vilation رخ می‌دهد، آنگاه
 raise استثنا 'پاسخ این سوال قبلاً در این نوبت ثبت شده است' using errcode='23505';
پایان؛ $$؛
همه موارد مربوط به تابع public.get_public_quiz(uuid) را از public,anon لغو کن؛
لغو همه موارد روی تابع public.submit_hamghadam_quiz_answer(uuid,uuid,smallint) از public,anon;
به تابع public.get_public_quiz(uuid) اجازه اجرا روی شناسه‌ی احراز هویت‌شده را بدهید؛
به تابع public.submit_hamghadam_quiz_answer(uuid,uuid,smallint) اجازه اجرا داده شود تا احراز هویت انجام شود.

---------------------------
-- پیوست پیام در چت خصوصی/گروه/کانال تا سقف 50 MiB
---------------------------
اگر جدول public.chat_attachments وجود ندارد، آن را ایجاد کن (
  شناسه uuid کلید اصلی پیش‌فرض gen_random_uuid(),
  شناسه پیام uuid تهی نیست. ارجاعات منحصر به فرد public.chat_messages(id) در حذف آبشاری،
  شناسه مکالمه uuid ارجاع تهی ندارد public.chat_conversations(id) در حذف آبشاری،
  uploaded_by uuid ارجاعات تهی نیستند auth.users(id) در حذف آبشاری،
  متن bucket_id تهی نیست. پیش‌فرض 'hamghadam-conversation-files' است. بررسی کنید(bucket_id='hamghadam-conversation-files'),
  متن مسیر شیء تهی نیست، بررسی منحصر به فرد (char_length(مسیر شیء)<=700)،
  متن file_name تهی نیست. بررسی کنید (char_length(btrim(file_name)) بین ۱ و ۲۵۵ باشد)،
  متن mime_type تهی نیست. بررسی کنید (char_length(mime_type) بین ۱ تا ۱۶۰ باشد)،
  size_bytes متغیر bigint را بررسی می‌کند که تهی نباشد (size_bytes بین ۱ و ۵۲۴۲۸۸۰۰ باشد)،
  created_at timestamptz تهی نیست، پیش‌فرض now()
)؛
اگر chat_attachments_conversation_created_idx وجود ندارد، آن را روی public.chat_attachments(conversation_id,created_at desc) ایجاد کن.
تغییر جدول public.chat_attachments امنیت سطح ردیف را فعال می‌کند؛
لغو همه فایل‌های public.chat_attachments از ناشناس، احراز هویت شده؛
به فایل public.chat_attachments اجازه‌ی انتخاب، درج و حذف (select,insert,delete) را بدهید تا احراز هویت (authenticated) شود.
در صورت وجود، سیاست حذف hgd_chat_attachments_read در public.chat_attachments;
ایجاد خط‌مشی hgd_chat_attachments_read روی public.chat_attachments برای انتخاب با استفاده از احراز هویت (private.hgd_can_read_chat(conversation_id));
سیاست حذف hgd_chat_attachments_insert در صورت وجود در public.chat_attachments;
ایجاد خط‌مشی hgd_chat_attachments_insert روی public.chat_attachments برای درج در فایل تأیید شده با بررسی (
 uploaded_by=(select auth.uid()) و object_path مانند conversation_id::text||'/'||(select auth.uid())::text||'/%'
 و private.hgd_can_send_chat(conversation_id)
 و موجود است (یکی از public.chat_messages m را انتخاب کنید که در آن m.id=message_id و m.conversation_id=chat_attachments.conversation_id و m.sender_id=(select auth.uid()))
)؛
سیاست حذف پیوست‌های hgd_chat_attachments_delete_own در صورت وجود، در public.chat_attachments;
ایجاد سیاست hgd_chat_attachments_delete_own در public.chat_attachments برای حذف به فایل های احراز هویت شده با استفاده از (uploaded_by=(select auth.uid()) یا private.hgd_can_manage_chat(conversation_id));

درج در storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
مقادیر('hamghadam-conversation-files','hamghadam-conversation-files',false,52428800,array['فایل‌های مکالمه‌ی hamghadam','فایل‌های مکالمه‌ی hamghadam',false,52428800,array']
 'برنامه/pdf'،'تصویر/png'،'تصویر/jpeg'،'تصویر/webp'،'تصویر/gif'،'متن/ساده'،'متن/csv'،'برنامه/csv'،
 'برنامه/msword'،'برنامه/vnd.openxmlformats-officedocument.wordprocessingml.document'،
 'application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
 'application/vnd.ms-powerpoint','application/vnd.openxmlformats-officedocument.presentationml.presentation',
 'برنامه/zip'،'برنامه/x-zip-فشرده'،'برنامه/x-7z-فشرده'،'صدا/mpeg'،'صدا/mp4'،'ویدئو/mp4'
]) در مورد conflict(id) مقادیر name=excluded.name,public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types را به‌روزرسانی کنید.
در صورت وجود، سیاست حذف hgd_chat_files_read روی storage.objects؛
ایجاد سیاست hgd_chat_files_read روی storage.objects برای انتخاب احراز هویت با استفاده از(bucket_id='hamghadam-conversation-files' و private.hgd_can_read_chat(((storage.foldername(name))[1])::uuid));
در صورت وجود، سیاست حذف hgd_chat_files_insert در storage.objects؛
ایجاد سیاست hgd_chat_files_insert روی storage.objects برای درج به احراز هویت شده با check(bucket_id='hamghadam-conversation-files' and (storage.foldername(name))[2]=(select auth.uid())::text and private.hgd_can_send_chat(((storage.foldername(name))[1])::uuid));
در صورت وجود، سیاست حذف hgd_chat_files_update روی storage.objects؛
ایجاد سیاست hgd_chat_files_update روی storage.objects برای به‌روزرسانی به احراز هویت‌شده با استفاده از (bucket_id='hamghadam-conversation-files' و (storage.foldername(name))[2]=(select auth.uid())::text) با check(bucket_id='hamghadam-conversation-files' و (storage.foldername(name))[2]=(select auth.uid())::text);
سیاست حذف hgd_chat_files_delete در صورت وجود روی storage.objects؛
ایجاد سیاست hgd_chat_files_delete روی storage.objects برای حذف به صورت احراز هویت شده با استفاده از (bucket_id='hamghadam-conversation-files' و ((storage.foldername(name))[2]=(select auth.uid())::text یا private.hgd_can_manage_chat(((storage.foldername(name))[1])::uuid)));

---------------------------
-- Storage خصوصی: کتاب شخصی 100 MiB; فقط مالک شیء خود را می‌خواند/ویراش می‌کند
---------------------------
درج در storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
مقادیر('hamghadam-personal-books','hamghadam-personal-books',false,104857600,array[', ...
 'برنامه/pdf'،'متن/ساده'،'برنامه/epub+zip'،'برنامه/vnd.openxmlformats-officedocument.wordprocessingml.document'،'برنامه/msword'
])
در مورد conflict(id) به روز رسانی مجموعه name=excluded.name,public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

در صورت وجود، خط‌مشی حذف hgd_personal_books_storage_read_owner روی storage.objects؛
برای انتخاب احراز هویت شده، خط‌مشی hgd_personal_books_storage_read_owner را روی storage.objects ایجاد کنید
با استفاده از (bucket_id='hamghadam-personal-books' و (storage.foldername(name))[1]=(select auth.uid())::text);
در صورت وجود، خط‌مشی حذف hgd_personal_books_storage_insert_owner روی storage.objects؛
ایجاد خط‌مشی hgd_personal_books_storage_insert_owner روی storage.objects برای درج در فایل احراز هویت‌شده
با check(bucket_id='hamghadam-personal-books' و (storage.foldername(name))[1]=(select auth.uid())::text);
در صورت وجود hgd_personal_books_storage_update_owner در storage.objects، خط‌مشی را حذف کنید.
برای به‌روزرسانی به احراز هویت‌شده، روی storage.objects، سیاست hgd_personal_books_storage_update_owner را ایجاد کنید.
با استفاده از (bucket_id='hamghadam-personal-books' و (storage.foldername(name))[1]=(select auth.uid())::text)
با check(bucket_id='hamghadam-personal-books' و (storage.foldername(name))[1]=(select auth.uid())::text);
سیاست حذف hgd_personal_books_storage_delete_owner در storage.objects در صورت وجود؛
ایجاد خط‌مشی hgd_personal_books_storage_delete_owner روی storage.objects برای حذف به صورت احراز هویت شده
با استفاده از (bucket_id='hamghadam-personal-books' و (storage.foldername(name))[1]=(select auth.uid())::text);

---------------------------
-- لینک‌های ارجاع توسط سرور ردیابی می‌شوند، نه توسط موجودی‌های ارائه شده توسط مشتری
---------------------------
اگر جدول وجود ندارد، آن را ایجاد کن public.referral_codes (
  کلید اصلی owner_id uuid در هنگام حذف آبشاری به auth.users(id) ارجاع می‌دهد،
  متن کد تهی نیست، منحصر به فرد، پیش‌فرض، substr(replace(gen_random_uuid()::text,'-',''),1,16) check(code ~ '^[a-f0-9]{16}$'),
  created_at timestamptz تهی نیست، پیش‌فرض now()
  is_active مقدار بولی ندارد (null) مقدار پیش‌فرض درست است.
)؛
اگر جدول وجود ندارد، آن را ایجاد کن public.referral_events (
  شناسه uuid کلید اصلی پیش‌فرض gen_random_uuid(),
  متن کد، ارجاعات تهی ندارد public.referral_codes(code) در مورد حذف، محدود کردن
  شناسه کاربر دعوت‌شده uuid تهی نیست. ارجاعات منحصر به فرد auth.users(id) در حذف آبشاری،
  متن وضعیت تهی نیست. پیش‌فرض "ثبت‌شده" است. بررسی کنید (در ("ثبت‌شده"، "واجد شرایط"، "معکوس")) وضعیت را مشخص کنید).
  created_at timestamptz تهی نیست، پیش‌فرض now()
  qualified_at timestamptz
)؛
تغییر جدول public.referral_codes امنیت سطح ردیف را فعال می‌کند؛
تغییر جدول public.referral_events امنیت سطح ردیف را فعال می‌کند؛
همه موارد مربوط به public.referral_codes,public.referral_events را از ناشناس، احراز هویت شده، لغو کن.
به public.referral_codes اجازه دهید select,insert را به authenticated اعطا کند.
اعطای انتخاب در public.referral_events به احراز هویت‌شده؛
در صورت وجود، سیاست hgd_referral_own_read را در public.referral_codes حذف کنید.
ایجاد خط‌مشی hgd_referral_own_read روی public.referral_codes برای انتخاب احراز هویت با استفاده از (owner_id=(select auth.uid()));
در صورت وجود، سیاست hgd_referral_own_insert را در public.referral_codes حذف کنید.
ایجاد خط‌مشی hgd_referral_own_insert روی public.referral_codes برای درج در احراز هویت شده با check(owner_id=(select auth.uid()));
در صورت وجود، سیاست hgd_referral_events_read را در public.referral_events حذف کنید؛
ایجاد سیاست hgd_referral_events_read در public.referral_events برای انتخاب احراز هویت با استفاده از (invited_user_id=(select auth.uid()) یا exists(select 1 from public.referral_codes c where c.owner_id=(select auth.uid()) and c.code=referral_events.code) یا private.hgd_is_admin());

---------------------------
-- مدیر پشتیبانی می‌تواند در صندوق ورودی پشتیبانی موجود، پیام‌ها را مشاهده/پاسخ دهد؛ سایر نقش‌ها بدون تغییر باقی می‌مانند.
---------------------------
در صورت وجود، سیاست hgd_admin_support_conversations_read را در public.support_conversations حذف کنید.
ایجاد سیاست hgd_admin_support_conversations_read روی public.support_conversations برای انتخاب احراز هویت با استفاده از (private.hgd_is_admin())؛
در صورت وجود، سیاست hgd_admin_support_conversations_update را در public.support_conversations حذف کنید.
ایجاد سیاست hgd_admin_support_conversations_update در public.support_conversations برای به‌روزرسانی به احراز هویت‌شده با استفاده از(private.hgd_is_admin()) با بررسی(private.hgd_is_admin())؛
در صورت وجود، خط‌مشی hgd_admin_support_messages_read را در public.support_messages حذف کنید؛
ایجاد سیاست hgd_admin_support_messages_read روی public.support_messages برای انتخاب احراز هویت با استفاده از (private.hgd_is_admin());
در صورت وجود، خط‌مشی hgd_admin_support_messages_insert را روی public.support_messages حذف کن؛
ایجاد سیاست hgd_admin_support_messages_insert روی public.support_messages برای درج در احراز هویت شده با check(private.hgd_is_admin()) و sender_id=(select auth.uid()) و sender_role='support' و exists(select 1 from public.support_conversations c where c.id=conversation_id));

به public.support_conversations,public.support_messages اجازه انتخاب برای احراز هویت داده می‌شود.
به public.support_messages تابع insert(conversation_id,sender_id,sender_role,body) اجازه احراز هویت داده می‌شود.

-- رویدادهای حسابرسی عمومی برای اقدامات ناظر توسط تابع لبه مدیریت و RPCها ثبت می‌شوند.
-- هیچ جدولی در این انتقال به کاربران احراز هویت شده این امکان را نمی‌دهد که خود را به سطح مدیر ارتقا دهند.


-- اعمال تغییر در جداول مدیریت اصلی را بدون ثبت محتوای پیام یا توکن‌ها، حسابرسی کنید.
ایجاد یا جایگزینی تابع private.hgd_audit_admin_mutation()
زبان تریگر plpgsql را برمی‌گرداند. تعریف‌کننده امنیتی، search_path = '' as $$ را تنظیم می‌کند.
اعلان v_row در jsonb؛ متن v_id؛ متن v_action؛ جزئیات v_details در jsonb؛
شروع
 v_row := موردی که tg_op='DELETE' سپس to_jsonb(old) در غیر این صورت to_jsonb(new) پایان می‌یابد؛
 v_id := coalesce(v_row->>'id',v_row->>'setting_key',v_row->>'slug',v_row->>'user_id','unknown');
 v_action := lower(tg_table_name)||'_'||lower(tg_op);
 v_details := jsonb_strip_nulls(jsonb_build_object(
   'وضعیت'، v_row->>'وضعیت'، 'وضعیت'، v_row->>'وضعیت'، 'فعال'، v_row->>'فعال'،
   'فعال_است'،v_row->>'فعال_است'،'منتشر_شده'،v_row->>'منتشر_شده'،'سنجاق_شده'،v_row->>'سنجاق_شده'،
   'مخاطب'،v_row->>'مخاطب'،'مهربان'،v_row->>'مهربان'،'ثانیه_حالت_آهسته'،v_row->>'ثانیه_حالت_آهسته'
 ));
 اگر private.hgd_is_admin() باشد، آنگاه
   درج در public.admin_audit_logs(actor_id,action,target_type,target_id,reason,details)
   values(auth.uid(),left(v_action,100),left(tg_table_name,60),left(v_id,300),'ثبت خودکار تغییر مدیریتی',v_details);
 پایان اگر؛
 اگر tg_op='DELETE' باشد، مقدار قدیمی را برمی‌گرداند؛ اگر حذف شود، پایان می‌یابد.
 بازگشت جدید؛
پایان؛ $$؛
لغو همه موارد روی تابع private.hgd_audit_admin_mutation() از public,anon,authenticated;

 اگر hgd_audit_app_settings روی public.app_settings وجود داشته باشد، ماشه را رها می‌کند.
 بعد از درج یا به‌روزرسانی یا حذف در public.app_settings برای هر سطر، ماشه hgd_audit_app_settings را ایجاد کنید. تابع private.hgd_audit_admin_mutation() را اجرا کنید.
 در صورت وجود hgd_audit_occasion_themes روی public.occasion_themes، ماشه را رها کنید.
 بعد از درج یا به‌روزرسانی یا حذف در public.occasion_themes برای هر سطر، ماشه hgd_audit_occasion_themes را ایجاد کنید. اجرای تابع private.hgd_audit_admin_mutation();
 در صورت وجود hgd_audit_app_announcements روی public.app_announcements، ماشه را رها کنید.
 بعد از درج یا به‌روزرسانی یا حذف در public.app_announcements برای هر سطر، ماشه hgd_audit_app_announcements را ایجاد کنید. اجرای تابع private.hgd_audit_admin_mutation();
 در صورت وجود، ماشه را رها کنید hgd_audit_community_reports در public.community_reports;
 ایجاد تریگر hgd_audit_community_reports پس از درج یا به‌روزرسانی یا حذف در public.community_reports برای هر سطر، اجرای تابع private.hgd_audit_admin_mutation();
 در صورت وجود hgd_audit_debate_topics روی public.debate_topics، ماشه را رها کنید.
 بعد از درج یا به‌روزرسانی یا حذف در public.debate_topics برای هر سطر، ماشه hgd_audit_debate_topics را ایجاد کنید. تابع private.hgd_audit_admin_mutation() را اجرا کنید.
 در صورت وجود hgd_audit_discussion_groups در public.discussion_groups، ماشه را رها کنید.
 بعد از درج یا به‌روزرسانی یا حذف در public.discussion_groups برای هر سطر، ماشه hgd_audit_discussion_groups را ایجاد کنید. اجرای تابع private.hgd_audit_admin_mutation();
 در صورت وجود hgd_audit_chat_conversations روی public.chat_conversations، ماشه را رها کنید.
 ایجاد تریگر hgd_audit_chat_conversations پس از درج یا به‌روزرسانی یا حذف در public.chat_conversations برای هر ردیف، اجرای تابع private.hgd_audit_admin_mutation();
 در صورت وجود، محرک hgd_audit_quizzes را روی public.hamghadam_quizzes رها کنید.
 ایجاد تریگر hgd_audit_quizzes پس از درج یا به‌روزرسانی یا حذف در public.hamghadam_quizzes برای هر سطر، اجرای تابع private.hgd_audit_admin_mutation();
