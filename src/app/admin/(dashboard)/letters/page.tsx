import {
  getHoursAwaitingReview,
  getReviewUrgency,
  listLettersAwaitingReview,
  REVIEW_PROMISE_HOURS,
  REVIEW_WARNING_HOURS,
  type ReviewUrgency,
} from "@/lib/letter-review";
import type { LetterSender } from "@/lib/letter-lifecycle";
import { AdminCard } from "../../_components/admin-card";
import { approveLetterAction, rejectLetterAction } from "./actions";

const SENDER_LABELS: Record<LetterSender, string> = {
  visitor: "Visitante",
  author: "Autor de la frase",
};

const URGENCY_STYLES: Record<ReviewUrgency, { tone: "neutral" | "warning" | "danger"; text: string }> = {
  on_time: { tone: "neutral", text: "text-white/40" },
  due_soon: { tone: "warning", text: "text-amber-300" },
  overdue: { tone: "danger", text: "text-red-300" },
};

function DecisionButton({
  action,
  id,
  label,
  tone,
}: {
  action: (formData: FormData) => Promise<void>;
  id: string;
  label: string;
  tone: "positive" | "negative";
}) {
  const toneClass =
    tone === "positive"
      ? "border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/10"
      : "border-red-500/30 text-red-300 hover:bg-red-500/10";

  return (
    <form action={action}>
      <input type="hidden" name="id" value={id} />
      <button type="submit" className={`rounded border px-3 py-1.5 text-xs ${toneClass}`}>
        {label}
      </button>
    </form>
  );
}

export default async function AdminLettersPage() {
  const letters = await listLettersAwaitingReview();
  const now = new Date();

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-lg font-medium">Cartas por revisar</h1>
        <p className="mt-1 text-sm text-white/40">
          Pasaron la moderación y el detector de contacto, y esperan tu revisión antes de entregarse. A quien escribe se
          le prometen hasta {REVIEW_PROMISE_HOURS} h; se destacan desde las {REVIEW_WARNING_HOURS} h. La más antigua va
          primero. Sin datos que identifiquen a nadie: solo texto, rol y fechas.
        </p>
      </div>

      {letters.length === 0 ? (
        <p className="text-sm text-white/40">No hay cartas esperando revisión.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {letters.map((letter) => {
            const urgency = URGENCY_STYLES[getReviewUrgency(letter.createdAt, now)];
            const hours = Math.floor(getHoursAwaitingReview(letter.createdAt, now));

            return (
              <AdminCard as="li" key={letter.id} tone={urgency.tone} className="flex flex-col gap-4 p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-xs text-white/60">{SENDER_LABELS[letter.sender]}</span>
                  <span className={`text-xs ${urgency.text}`}>Esperando {hours} h</span>
                </div>

                <div>
                  <p className="text-[11px] uppercase tracking-wide text-white/35">Frase</p>
                  <blockquote className="mt-1 break-words border-l-2 border-white/20 pl-3 text-sm text-white/60">
                    {letter.phraseText}
                  </blockquote>
                </div>

                {letter.deliveredLetters.length > 0 && (
                  <div>
                    <p className="text-[11px] uppercase tracking-wide text-white/35">Cartas ya entregadas</p>
                    <ol className="mt-1 flex flex-col gap-2">
                      {letter.deliveredLetters.map((earlier) => (
                        <li key={earlier.deliveredAt} className="text-sm text-white/55">
                          <span className="text-[11px] text-white/35">{SENDER_LABELS[earlier.sender]}: </span>
                          {earlier.body ?? <span className="italic text-white/30">texto anonimizado</span>}
                        </li>
                      ))}
                    </ol>
                  </div>
                )}

                <div>
                  <p className="text-[11px] uppercase tracking-wide text-white/35">Carta en revisión</p>
                  <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed text-white/90">
                    {letter.body}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2 border-t border-white/10 pt-3">
                  <DecisionButton action={approveLetterAction} id={letter.id} label="Entregar" tone="positive" />
                  <DecisionButton action={rejectLetterAction} id={letter.id} label="Rechazar" tone="negative" />
                  <span className="ml-auto text-[11px] text-white/35">{new Date(letter.createdAt).toLocaleString()}</span>
                </div>
              </AdminCard>
            );
          })}
        </ul>
      )}
    </div>
  );
}
