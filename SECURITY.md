# Security notes

- Only `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` are permitted in the client build.
- Never add service-role/secret keys to `.env.local`, source code, Capacitor assets, Git, or a public HTML file.
- Conversation reads and message inserts are protected by RLS; support privileges use server-controlled `app_metadata.role`.
- Client roles are not inferred from `user_metadata`.
- Message HTML is escaped before rendering; message length is bounded to 5,000 Unicode code units.
- SQL grants are column-scoped for inserts, and support message rows are not updateable/deletable through the client API.
- Before production: configure email redirect URLs/deep links, turn on appropriate anti-abuse rate limits and CAPTCHA where suitable, review Auth confirmation rules and SMTP, test account-isolation policies using two real accounts, and run Supabase Security Advisors.
- The support inbox is an operational panel. Only trusted staff UUIDs should receive `app_metadata.role = `support``.
