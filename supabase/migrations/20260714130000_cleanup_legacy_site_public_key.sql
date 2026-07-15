-- The original site_public row (no environment suffix) predates scoping this flag per
-- environment. Local dev, `preview`, and (eventually) `master`/production all share the
-- same Supabase project — one row meant closing any one of them closed all three at
-- once, which defeats the point of the flag. src/lib/settings.ts now reads/writes
-- "site_public:<VERCEL_ENV>" instead; this row is orphaned.

delete from settings where key = 'site_public';
