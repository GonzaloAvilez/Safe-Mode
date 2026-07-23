import { supabaseAdmin } from "@/lib/supabase";
import { approvePhraseAction, rejectPhraseAction, activatePhraseAction, deactivatePhraseAction } from "./actions";

type PhraseRow = {
  id: string;
  text: string;
  moderation_status: "pending" | "approved" | "rejected";
  active: boolean;
  created_at: string;
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
    .select("id, text, moderation_status, active, created_at")
    .eq("source", "user")
    .order("created_at", { ascending: false });

  if (error) throw error;

  const phrases = (data ?? []) as PhraseRow[];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-lg font-medium">Phrases de usuario (Leave a Trace)</h1>
        <p className="mt-1 text-sm text-white/40">
          {phrases.length} frase{phrases.length === 1 ? "" : "s"} enviada{phrases.length === 1 ? "" : "s"}.
          Esto es una herramienta de aprobación: puedes revisar, aprobar, rechazar, activar o desactivar cualquier frase antes 
          de que forme parte del corpus de Refugio.
        </p>
      </div>

      {phrases.length === 0 ? (
        <p className="text-sm text-white/40">Todavía no hay frases enviadas por usuarios.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {phrases.map((phrase) => (
            <li key={phrase.id} className="rounded-lg border border-white/10 p-4">
              <div className="flex items-start justify-between gap-4">
                <p className="text-sm leading-relaxed text-white/85">{phrase.text}</p>
                <span
                  className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] tracking-wide uppercase ${STATUS_STYLES[phrase.moderation_status]}`}
                >
                  {phrase.moderation_status}
                </span>
              </div>
              <div className="mt-3 flex items-center justify-between gap-4">
                <span className="text-[11px] text-white/35">
                  {new Date(phrase.created_at).toLocaleString()} · {phrase.active ? "activa en el corpus" : "no activa"}
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
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
