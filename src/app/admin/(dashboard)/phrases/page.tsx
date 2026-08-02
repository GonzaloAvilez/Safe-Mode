import { supabaseAdmin } from "@/lib/supabase";
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

export default async function AdminPhrasesPage() {
  const { data, error } = await supabaseAdmin
    .from("phrases")
    .select("id, text, source, moderation_status, active, created_at")
    .order("created_at", { ascending: false });

  if (error) throw error;

  const phrases = (data ?? []) as PhraseRow[];

  // Part of the public-narrative experiment — separate query rather than a join,
  // matching this panel's existing simple-query style (see /admin/spend). Empty when
  // no phrase here has been classified yet, which is the common case.
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
          {phrases.length} frase{phrases.length === 1 ? "" : "s"} en total — semilla y enviadas por usuarios juntas.
          Esto es una herramienta de aprobación: puedes revisar, aprobar, rechazar, activar o desactivar cualquier frase.
        </p>
      </div>

      {phrases.length === 0 ? (
        <p className="text-sm text-white/40">Todavía no hay frases.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {phrases.map((phrase) => (
            <li key={phrase.id} className="rounded-lg border border-white/10 p-4">
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
                  {phrase.source === "user" && (
                    <ActionButton
                      action={classifyPhraseAction}
                      id={phrase.id}
                      label={narrativesByPhraseId.has(phrase.id) ? "Re-clasificar" : "Clasificar"}
                    />
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
