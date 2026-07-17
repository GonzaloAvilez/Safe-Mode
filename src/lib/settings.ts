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

// Module-scope cache, not per-request — Fluid Compute reuses warm instances across
// requests, so this avoids a Supabase round-trip on every single page load just to
// check a flag an admin toggles rarely. Only lives on the instance that reads it, so a
// toggle can take up to CACHE_TTL_MS to be visible on other warm instances — an
// acceptable tradeoff for a manually-flipped visibility switch, not a hard real-time
// requirement. Keyed by the full settings key so multiple independent flags (site_public,
// contribute_open, ...) can share this one cache without stepping on each other.
const flagCache = new Map<string, { value: boolean; expiresAt: number }>();

async function getFlag(keyPrefix: string, defaultValue: boolean): Promise<boolean> {
  const key = `${keyPrefix}:${ENVIRONMENT}`;
  const now = Date.now();
  const cached = flagCache.get(key);
  if (cached && cached.expiresAt > now) return cached.value;

  const { data } = await supabaseAdmin.from("settings").select("value").eq("key", key).single();
  const value = data?.value ?? defaultValue;
  flagCache.set(key, { value, expiresAt: now + CACHE_TTL_MS });
  return value;
}

async function setFlag(keyPrefix: string, value: boolean): Promise<void> {
  const key = `${keyPrefix}:${ENVIRONMENT}`;
  await supabaseAdmin.from("settings").upsert({ key, value, updated_at: new Date().toISOString() });
  flagCache.delete(key);
}

// Fails open (site stays public) if the row is ever missing or the read errors — this
// flag exists to let the admin deliberately close the site, not as a security boundary,
// so a Supabase hiccup shouldn't accidentally take everything offline. A missing row is
// also simply the expected state the first time a given environment's key is ever read,
// since no migration seeds one per-environment row upfront.
export async function isSitePublic(): Promise<boolean> {
  return getFlag("site_public", true);
}

export async function setSitePublic(value: boolean): Promise<void> {
  return setFlag("site_public", value);
}

// Independent of site_public — controls only whether /contribute stays reachable while
// the rest of the site is closed (see proxy.ts). Fails closed (defaults to off) unlike
// site_public: this is a temporary, occasionally-on surface for gathering seeds, not the
// default state of the product, so a missing/errored row shouldn't accidentally expose it.
export async function isContributeOpen(): Promise<boolean> {
  return getFlag("contribute_open", false);
}

export async function setContributeOpen(value: boolean): Promise<void> {
  return setFlag("contribute_open", value);
}

// So the admin UI can make it obvious which environment's flag is being toggled —
// same shared table, easy to forget which row you're touching otherwise.
export function currentSettingsEnvironment(): string {
  return ENVIRONMENT;
}
