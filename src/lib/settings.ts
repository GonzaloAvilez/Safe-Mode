import "server-only";
import { supabaseAdmin } from "./supabase";

const CACHE_TTL_MS = 30_000;

// Module-scope cache, not per-request — Fluid Compute reuses warm instances across
// requests, so this avoids a Supabase round-trip on every single page load just to
// check one flag an admin toggles rarely. Only lives on the instance that reads it,
// so a toggle can take up to CACHE_TTL_MS to be visible on other warm instances —
// an acceptable tradeoff for a manually-flipped visibility switch, not a hard
// real-time requirement.
let cache: { sitePublic: boolean; expiresAt: number } | null = null;

// Fails open (site stays public) if the row is ever missing or the read errors —
// this flag exists to let the admin deliberately close the site, not as a security
// boundary, so a Supabase hiccup shouldn't accidentally take everything offline.
export async function isSitePublic(): Promise<boolean> {
  const now = Date.now();
  if (cache && cache.expiresAt > now) return cache.sitePublic;

  const { data } = await supabaseAdmin.from("settings").select("value").eq("key", "site_public").single();
  const sitePublic = data?.value ?? true;
  cache = { sitePublic, expiresAt: now + CACHE_TTL_MS };
  return sitePublic;
}

export async function setSitePublic(value: boolean): Promise<void> {
  await supabaseAdmin
    .from("settings")
    .upsert({ key: "site_public", value, updated_at: new Date().toISOString() });
  cache = null;
}
