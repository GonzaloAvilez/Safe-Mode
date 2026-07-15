import "server-only";
import { supabaseAdmin } from "./supabase";

const CACHE_TTL_MS = 30_000;

// Local dev, `preview`, and (eventually) `master`/production all point at the exact
// same Supabase project — same URL, same service-role key, no per-environment
// database (see [[project_supabase_shared_env]]). A single `site_public` row would
// mean toggling it anywhere closes *every* environment at once, defeating the whole
// point (closing production without also taking down preview). VERCEL_ENV — set
// automatically by Vercel to "production"/"preview", unset locally — scopes the key
// so each environment gets its own independent row in the same shared table.
const ENVIRONMENT = process.env.VERCEL_ENV ?? "development";
const SITE_PUBLIC_KEY = `site_public:${ENVIRONMENT}`;

// Module-scope cache, not per-request — Fluid Compute reuses warm instances across
// requests, so this avoids a Supabase round-trip on every single page load just to
// check one flag an admin toggles rarely. Only lives on the instance that reads it,
// so a toggle can take up to CACHE_TTL_MS to be visible on other warm instances —
// an acceptable tradeoff for a manually-flipped visibility switch, not a hard
// real-time requirement.
let cache: { sitePublic: boolean; expiresAt: number } | null = null;

// Fails open (site stays public) if the row is ever missing or the read errors —
// this flag exists to let the admin deliberately close the site, not as a security
// boundary, so a Supabase hiccup shouldn't accidentally take everything offline. A
// missing row is also simply the expected state the first time a given environment's
// key is ever read, since no migration seeds one per-environment row upfront.
export async function isSitePublic(): Promise<boolean> {
  const now = Date.now();
  if (cache && cache.expiresAt > now) return cache.sitePublic;

  const { data } = await supabaseAdmin.from("settings").select("value").eq("key", SITE_PUBLIC_KEY).single();
  const sitePublic = data?.value ?? true;
  cache = { sitePublic, expiresAt: now + CACHE_TTL_MS };
  return sitePublic;
}

export async function setSitePublic(value: boolean): Promise<void> {
  await supabaseAdmin
    .from("settings")
    .upsert({ key: SITE_PUBLIC_KEY, value, updated_at: new Date().toISOString() });
  cache = null;
}

// So the admin UI can make it obvious which environment's flag is being toggled —
// same shared table, easy to forget which row you're touching otherwise.
export function currentSettingsEnvironment(): string {
  return ENVIRONMENT;
}
