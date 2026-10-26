// هم‌قدم — دستیار هوشمند
// Supabase Edge Function name: hamghadam-ai
// Server secret required: OPENAI_API_KEY. Never expose it to web or Android clients.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json; charset=utf-8",
};

const json = (status: number, data: Record<string, unknown>) =>
  new Response(JSON.stringify(data), { status, headers: corsHeaders });

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_MESSAGE_CHARS = 6000;
const MAX_CONTEXT_MESSAGES = 12;
const MAX_REQUESTS_PER_MINUTE = 10;

const systemPrompt = `تو «دستیار هوشمند هم‌قدم» هستی؛ یک مربی مؤدب و دقیق برای مطالعه، برنامه‌ریزی و یادگیری.
- زبان پاسخ را با زبان کاربر هماهنگ کن و به‌طور پیش‌فرض فارسی روان، راست‌چین و آموزشی بنویس.
- برای صرف و نحو عربی، قاعده را مرحله‌به‌مرحله توضیح بده، مثال معتبر بساز و در صورت نیاز از کاربر تمرین بگیر.
- در مباحث اعتقادی، فقهی و تاریخی، ادعاها را از استنباط جدا کن. فتوا، نقل‌قول، شماره صفحه یا منبع را جعل نکن؛ اگر یقین نداری صریح بگو.
- درباره اختلاف دیدگاه‌های علمی/فقهی منصف باش و برای حکم شخصی حساس، مراجعه به مرجع یا استاد صلاحیت‌دار را یادآوری کن.
- برنامه‌ریزی را واقع‌بینانه و با رعایت خواب، استراحت، مدرسه/حوزه و مسئولیت‌ها پیشنهاد بده؛ از تحقیر یا فشار ناسالم دوری کن.
- اطلاعات محلی برنامه، فایل‌های دستگاه و سایر گفت‌وگوها به تو داده نشده‌اند؛ وانمود نکن که آن‌ها را دیده‌ای.
- پیام‌های گفت‌وگوی همین بخش به شکل خصوصی در سرور ذخیره می‌شوند؛ فقط برای پاسخ به درخواست حاضر از آن‌ها استفاده کن.`;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "روش درخواست پشتیبانی نمی‌شود." });

  let createdHere = false;
  let createdConversationId = "";
  let admin: ReturnType<typeof createClient> | null = null;
  let userId = "";

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const openAiKey = Deno.env.get("OPENAI_API_KEY");
    const model = Deno.env.get("OPENAI_MODEL") || "gpt-4o-mini";

    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      return json(503, { error: "تنظیمات داخلی سرور کامل نیست؛ مدیر سامانه باید تنظیمات Edge Function را بررسی کند." });
    }

    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader.startsWith("Bearer ")) {
      return json(401, { error: "برای استفاده از دستیار، ابتدا وارد حساب هم‌قدم شو." });
    }

    const accessToken = authHeader.slice("Bearer ".length).trim();
    if (!accessToken) return json(401, { error: "نشست معتبر نیست؛ دوباره وارد حساب شو." });

    const userClient = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: userResult, error: authError } = await userClient.auth.getUser(accessToken);
    const user = userResult?.user;
    if (authError || !user) return json(401, { error: "نشست معتبر نیست؛ دوباره وارد حساب شو." });
    userId = user.id;

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") return json(400, { error: "بدنهٔ درخواست معتبر نیست." });
    const action = body.action === "delete" ? "delete" : "chat";
    const conversationId = typeof body.conversationId === "string" ? body.conversationId : "";

    admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    if (action === "delete") {
      if (!uuidPattern.test(conversationId)) return json(400, { error: "شناسهٔ گفتگو معتبر نیست." });
      const { data: owned, error: ownerError } = await admin
        .from("ai_conversations").select("id").eq("id", conversationId).eq("user_id", userId).maybeSingle();
      if (ownerError) return json(500, { error: "بررسی مالکیت گفتگو ناموفق بود." });
      if (!owned) return json(404, { error: "گفتگو پیدا نشد." });
      const { error: deleteError } = await admin.from("ai_conversations").delete()
        .eq("id", conversationId).eq("user_id", userId);
      if (deleteError) return json(500, { error: "حذف گفتگو انجام نشد." });
      return json(200, { ok: true });
    }

    const message = typeof body.message === "string" ? body.message.trim() : "";
    if (!message) return json(400, { error: "پرسش را بنویس." });
    if (message.length > MAX_MESSAGE_CHARS) {
      return json(413, { error: `پرسش نباید بیشتر از ${MAX_MESSAGE_CHARS} نویسه باشد.` });
    }
    if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(message)) {
      return json(400, { error: "پرسش دارای نویسهٔ نامعتبر است." });
    }
    if (!openAiKey) {
      return json(503, { error: "هستهٔ دستیار آماده است، اما مدیر سامانه هنوز OPENAI_API_KEY را در Secrets سرور تنظیم نکرده است." });
    }

    let conversation: { id: string; title: string } | null = null;
    if (conversationId) {
      if (!uuidPattern.test(conversationId)) return json(400, { error: "شناسهٔ گفتگو معتبر نیست." });
      const { data, error } = await admin.from("ai_conversations").select("id,title")
        .eq("id", conversationId).eq("user_id", userId).maybeSingle();
      if (error) return json(500, { error: "دریافت گفتگو ناموفق بود." });
      if (!data) return json(404, { error: "این گفتگو وجود ندارد یا متعلق به حساب تو نیست." });
      conversation = data;
    }

    const { data: quota, error: quotaError } = await admin.rpc("consume_hamghadam_ai_quota", { p_user_id: userId });
    if (quotaError) return json(503, { error: "سهمیهٔ درخواست‌ها فعلاً قابل بررسی نیست؛ migration دستیار هوشمند را بررسی کن." });
    if (Number(quota) > MAX_REQUESTS_PER_MINUTE) {
      return json(429, { error: "در هر دقیقه حداکثر ۱۰ درخواست مجاز است؛ کمی صبر کن و دوباره بفرست." });
    }

    if (!conversation) {
      const title = message.replace(/\s+/g, " ").slice(0, 72) || "گفت‌وگوی تازه";
      const { data, error } = await admin.from("ai_conversations").insert({ user_id: userId, title })
        .select("id,title").single();
      if (error || !data) return json(500, { error: "ساخت گفت‌وگوی تازه ناموفق بود." });
      conversation = data;
      createdHere = true;
      createdConversationId = data.id;
    }

    const { data: prior, error: historyError } = await admin.from("ai_messages")
      .select("role,content").eq("conversation_id", conversation.id).eq("user_id", userId)
      .order("created_at", { ascending: false }).limit(MAX_CONTEXT_MESSAGES);
    if (historyError) {
      if (createdHere) await admin.from("ai_conversations").delete().eq("id", createdConversationId).eq("user_id", userId);
      return json(500, { error: "خواندن تاریخچهٔ همین گفتگو ناموفق بود." });
    }

    const history = (prior || []).reverse().map((row: { role: string; content: string }) => ({ role: row.role, content: row.content }));
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    let providerResponse: Response;
    try {
      providerResponse = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        signal: controller.signal,
        headers: { Authorization: `Bearer ${openAiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          messages: [{ role: "system", content: systemPrompt }, ...history, { role: "user", content: message }],
          temperature: 0.3,
          max_tokens: 1200,
        }),
      });
    } catch {
      if (createdHere) await admin.from("ai_conversations").delete().eq("id", createdConversationId).eq("user_id", userId);
      return json(504, { error: "پاسخ دستیار بیش از حد طول کشید یا ارتباط با سرویس مدل برقرار نشد؛ دوباره تلاش کن." });
    } finally {
      clearTimeout(timer);
    }

    const providerBody = await providerResponse.json().catch(() => null);
    if (!providerResponse.ok) {
      if (createdHere) await admin.from("ai_conversations").delete().eq("id", createdConversationId).eq("user_id", userId);
      return json(providerResponse.status === 429 ? 429 : 502, {
        error: providerResponse.status === 429
          ? "ظرفیت یا سهمیهٔ سرویس مدل در حال حاضر کافی نیست؛ بعداً دوباره تلاش کن."
          : "سرویس هوش مصنوعی نتوانست پاسخ دهد؛ تنظیمات کلید، مدل و دسترسی سرور بررسی شود.",
      });
    }

    const reply = providerBody?.choices?.[0]?.message?.content;
    if (typeof reply !== "string" || !reply.trim()) {
      if (createdHere) await admin.from("ai_conversations").delete().eq("id", createdConversationId).eq("user_id", userId);
      return json(502, { error: "سرویس مدل پاسخ قابل‌استفاده‌ای برنگرداند." });
    }

    const { error: insertError } = await admin.from("ai_messages").insert([
      { conversation_id: conversation.id, user_id: userId, role: "user", content: message },
      { conversation_id: conversation.id, user_id: userId, role: "assistant", content: reply.trim() },
    ]);
    if (insertError) {
      if (createdHere) await admin.from("ai_conversations").delete().eq("id", createdConversationId).eq("user_id", userId);
      return json(500, { error: "پاسخ تولید شد اما ذخیرهٔ امن گفتگو ناموفق بود؛ لطفاً دوباره تلاش کن." });
    }

    await admin.from("ai_conversations").update({ updated_at: new Date().toISOString() })
      .eq("id", conversation.id).eq("user_id", userId);

    return json(200, { ok: true, conversationId: conversation.id, title: conversation.title, reply: reply.trim(), model });
  } catch {
    if (createdHere && admin && createdConversationId && userId) {
      try { await admin.from("ai_conversations").delete().eq("id", createdConversationId).eq("user_id", userId); } catch { /* no sensitive details in response */ }
    }
    return json(500, { error: "خطای غیرمنتظره در دستیار رخ داد؛ شناسه‌ها و اطلاعات حساس در پیام خطا نمایش داده نمی‌شوند." });
  }
});
