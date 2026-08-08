import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase";
import { AdminCard } from "../../_components/admin-card";
import {
  approvePhraseAction,
  rejectPhraseAction,
  activatePhraseAction,
  deactivatePhraseAction,
  classifyPhraseAction,
} from "./actions";

type PhraseRow = {
  id: string;
  text: string;
  source: "seed" | "user";
  moderation_status: "pending" | "approved" | "rejected";
  active: boolean;
  created_at: string;
};

type PhraseNarrativeRow = {
  phrase_id: string;
  primary_theme: string;
  public_narrative: string;
  confidence: number;
};

type PhraseResonanceRow = {
  phrase_id: string;
};

const STATUS_STYLES: Record<PhraseRow["moderation_status"], string> = {
  approved: "border-emerald-500/40 text-emerald-300",
  rejected: "border-red-500/40 text-red-300",
  pending: "border-amber-500/40 text-amber-300",
};

// Two different axes, not one enum. pending/active/inactive partition every phrase by
// moderation/activation status (mutually exclusive, exhaustive — active=true only ever
// happens for moderation_status='approved', see phrases.ts's setPhraseActive, and a
// pending phrase is never active). unclassified cuts across all three: classification
// is available on any phrase regardless of its approval state (see the always-rendered
// Clasificar/Re-clasificar button below) — a phrase can be both "Necesitan revisión"
// and "Sin clasificar" at once. Only pending/active/inactive's counts sum to the real
// total phrase count; unclassified's count is independent, not part of that sum.
const TABS = [
  { key: "pending", label: "Necesitan revisión" },
  { key: "active", label: "Activas en el corpus" },
  { key: "inactive", label: "No activas" },
  { key: "unclassified", label: "Sin clasificar" },
] as const;

type Tab = (typeof TABS)[number]["key"];

function isValidTab(value: string | undefined): value is Tab {
  return TABS.some((tab) => tab.key === value);
}

// Same 4-branch filter, written twice (full-row query for the open tab, head-only
// count query for the others) rather than shared through one generic helper — tried
// that first; TypeScript can't unify Postgrest's builder generics across the two
// differently-shaped .select() calls without hitting "type instantiation is
// excessively deep." Each function below stays concretely typed instead, no generics,
// no casts.
function fullPhrasesQueryForTab(tab: Tab, unclassifiedIds: string[]) {
  const base = supabaseAdmin
    .from("phrases")
    .select("id, text, source, moderation_status, active, created_at", { count: "exact" })
    .order("created_at", { ascending: false });
  switch (tab) {
    case "pending":
      return base.eq("moderation_status", "pending");
    case "active":
      return base.eq("active", true);
    case "inactive":
      return base.eq("active", false).neq("moderation_status", "pending");
    case "unclassified":
      // No exclusions needed when nothing's been classified yet — every phrase already
      // qualifies, and notIn with an empty array is an edge case not worth risking.
      return unclassifiedIds.length > 0 ? base.notIn("id", unclassifiedIds) : base;
  }
}

function countPhrasesQueryForTab(tab: Tab, unclassifiedIds: string[]) {
  const base = supabaseAdmin.from("phrases").select("id", { count: "exact", head: true });
  switch (tab) {
    case "pending":
      return base.eq("moderation_status", "pending");
    case "active":
      return base.eq("active", true);
    case "inactive":
      return base.eq("active", false).neq("moderation_status", "pending");
    case "unclassified":
      return unclassifiedIds.length > 0 ? base.notIn("id", unclassifiedIds) : base;
  }
}

function ActionButton({
  action,
  id,
  label,
  tone = "neutral",
}: {
  action: (formData: FormData) => Promise<void>;
  id: string;
  label: string;
  tone?: "neutral" | "positive" | "negative";
}) {
  const toneClass =
    tone === "positive"
      ? "border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/10"
      : tone === "negative"
        ? "border-red-500/30 text-red-300 hover:bg-red-500/10"
        : "border-white/15 text-white/70 hover:bg-white/10 hover:text-white";

  return (
    <form action={action}>
      <input type="hidden" name="id" value={id} />
      <button type="submit" className={`rounded border px-2 py-1 text-xs ${toneClass}`}>
        {label}
      </button>
    </form>
  );
}

export default async function AdminPhrasesPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab: tabParam } = await searchParams;
  const selectedTab: Tab = isValidTab(tabParam) ? tabParam : "pending";
  const otherTabs = TABS.filter((tab) => tab.key !== selectedTab);

  // Needed regardless of which tab is open — the "Sin clasificar" nav badge always
  // needs a count, and this table is tiny (one row per classified phrase), same
  // "just query it, no join" style as the narratives/resonances queries below.
  const { data: classifiedIdRows, error: classifiedIdsError } = await supabaseAdmin
    .from("phrase_narratives")
    .select("phrase_id");
  if (classifiedIdsError) throw classifiedIdsError;
  const classifiedIds = (classifiedIdRows ?? []).map((row) => row.phrase_id as string);

  // One query per tab, not one big fetch filtered client-side — as the corpus grows
  // past the D24-25 100+ target, this is the shape pagination and caching both compose
  // onto later (a .range() per tab, a cache key per tab+page) without restructuring.
  // The tabs not currently open only need a count (head: true — no rows over the
  // wire); the open tab gets both its rows and its count in the same request.
  const [selectedResult, ...otherResults] = await Promise.all([
    fullPhrasesQueryForTab(selectedTab, classifiedIds),
    ...otherTabs.map((tab) => countPhrasesQueryForTab(tab.key, classifiedIds)),
  ]);

  if (selectedResult.error) throw selectedResult.error;
  for (const result of otherResults) {
    if (result.error) throw result.error;
  }

  const phrases = (selectedResult.data ?? []) as PhraseRow[];

  const countsByTab: Record<Tab, number> = { pending: 0, active: 0, inactive: 0, unclassified: 0 };
  countsByTab[selectedTab] = selectedResult.count ?? 0;
  otherTabs.forEach((tab, index) => {
    countsByTab[tab.key] = otherResults[index].count ?? 0;
  });
  // Only pending/active/inactive partition the whole corpus — unclassified cuts across
  // them, so it's deliberately excluded from this sum (see the TABS comment above).
  const totalCount = countsByTab.pending + countsByTab.active + countsByTab.inactive;

  // Part of the public-narrative experiment — separate query rather than a join,
  // matching this panel's existing simple-query style (see /admin/spend). Empty when
  // no phrase here has been classified yet, which is the common case. Scoped to the
  // current tab's phrases only, same as the resonance query below.
  let narrativesByPhraseId = new Map<string, PhraseNarrativeRow>();
  if (phrases.length > 0) {
    const { data: narrativeData, error: narrativeError } = await supabaseAdmin
      .from("phrase_narratives")
      .select("phrase_id, primary_theme, public_narrative, confidence")
      .in(
        "phrase_id",
        phrases.map((phrase) => phrase.id)
      );
    if (narrativeError) throw narrativeError;

    narrativesByPhraseId = new Map(
      ((narrativeData ?? []) as PhraseNarrativeRow[]).map((narrative) => [narrative.phrase_id, narrative])
    );
  }

  // Part of the "resonate" experiment — a private per-phrase tap signal, never shown
  // to visitors. This admin count is the only place the number is visible at all.
  let resonanceCountByPhraseId = new Map<string, number>();
  if (phrases.length > 0) {
    const { data: resonanceData, error: resonanceError } = await supabaseAdmin
      .from("phrase_resonances")
      .select("phrase_id")
      .in(
        "phrase_id",
        phrases.map((phrase) => phrase.id)
      );
    if (resonanceError) throw resonanceError;

    resonanceCountByPhraseId = new Map<string, number>();
    for (const row of (resonanceData ?? []) as PhraseResonanceRow[]) {
      resonanceCountByPhraseId.set(row.phrase_id, (resonanceCountByPhraseId.get(row.phrase_id) ?? 0) + 1);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-lg font-medium">Phrases (semilla + usuarios)</h1>
        <p className="mt-1 text-sm text-white/40">
          {totalCount} frase{totalCount === 1 ? "" : "s"} en total — semilla y enviadas por usuarios juntas.
          Esto es una herramienta de aprobación: puedes revisar, aprobar, rechazar, activar o desactivar cualquier frase.
        </p>
      </div>

      <nav className="flex flex-wrap gap-5 border-b border-white/10 pb-3 text-sm">
        {TABS.map((tab) => {
          const isActive = tab.key === selectedTab;
          return (
            <Link
              key={tab.key}
              href={`/admin/phrases?tab=${tab.key}`}
              className={`pb-1 ${
                isActive
                  ? "border-b-2 border-white text-white"
                  : "text-white/50 hover:text-white/80"
              }`}
            >
              {tab.label} ({countsByTab[tab.key]})
            </Link>
          );
        })}
      </nav>

      {phrases.length === 0 ? (
        <p className="text-sm text-white/40">No hay frases en esta pestaña.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {phrases.map((phrase) => (
            <AdminCard as="li" key={phrase.id} className="p-4">
              <div className="flex items-start justify-between gap-4">
                <p className="text-sm leading-relaxed text-white/85">{phrase.text}</p>
                <div className="flex shrink-0 gap-1.5">
                  <span className="rounded-full border border-white/15 px-2 py-0.5 text-[11px] tracking-wide text-white/40 uppercase">
                    {phrase.source}
                  </span>
                  <span
                    className={`rounded-full border px-2 py-0.5 text-[11px] tracking-wide uppercase ${STATUS_STYLES[phrase.moderation_status]}`}
                  >
                    {phrase.moderation_status}
                  </span>
                </div>
              </div>
              {narrativesByPhraseId.has(phrase.id) && (
                <p className="mt-2 rounded border border-dashed border-white/15 bg-white/[0.03] px-3 py-2 text-xs text-white/60">
                  <span className="text-white/40 uppercase tracking-wide">
                    {narrativesByPhraseId.get(phrase.id)!.primary_theme}
                  </span>{" "}
                  — {narrativesByPhraseId.get(phrase.id)!.public_narrative}{" "}
                  <span className="text-white/30">
                    (confidence {narrativesByPhraseId.get(phrase.id)!.confidence.toFixed(2)})
                  </span>
                </p>
              )}
              <div className="mt-3 flex items-center justify-between gap-4">
                <span className="text-[11px] text-white/35">
                  {new Date(phrase.created_at).toLocaleString()} · {phrase.active ? "activa en el corpus" : "no activa"}
                  {resonanceCountByPhraseId.has(phrase.id) &&
                    ` · ${resonanceCountByPhraseId.get(phrase.id)} resonate (visible en Observe)`}
                </span>
                <div className="flex shrink-0 gap-2">
                  {phrase.moderation_status !== "approved" && (
                    <ActionButton action={approvePhraseAction} id={phrase.id} label="Aprobar" tone="positive" />
                  )}
                  {phrase.moderation_status !== "rejected" && (
                    <ActionButton action={rejectPhraseAction} id={phrase.id} label="Rechazar" tone="negative" />
                  )}
                  {phrase.moderation_status === "approved" && !phrase.active && (
                    <ActionButton action={activatePhraseAction} id={phrase.id} label="Activar" />
                  )}
                  {phrase.active && (
                    <ActionButton action={deactivatePhraseAction} id={phrase.id} label="Desactivar" />
                  )}
                  <ActionButton
                    action={classifyPhraseAction}
                    id={phrase.id}
                    label={narrativesByPhraseId.has(phrase.id) ? "Re-clasificar" : "Clasificar"}
                  />
                </div>
              </div>
            </AdminCard>
          ))}
        </ul>
      )}
    </div>
  );
}
