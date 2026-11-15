import { LETTER_MAX_LENGTH } from "@/lib/letters";
import {
  getSeedPhraseMailbox,
  type MailboxCorrespondence,
  type MailboxCorrespondenceState,
  type MailboxLetter,
} from "@/lib/mailbox";
import { AdminCard } from "../../_components/admin-card";
import { SeedPhraseLetterForm } from "./seed-phrase-letter-form";

const STATE_LABELS: Record<MailboxCorrespondenceState, { text: string; className: string }> = {
  your_turn: { text: "Te toca responder", className: "text-amber-300" },
  awaiting_review: { text: "Tu carta está en revisión", className: "text-white/50" },
  their_turn: { text: "Esperando al visitante", className: "text-white/40" },
  closed: { text: "Cerrada", className: "text-white/30" },
};

// Only your own letters can be in review or rejected here: the visitor's appear once
// delivered (same rules as any author's mailbox).
const OWN_LETTER_NOTES: Partial<Record<MailboxLetter["status"], string>> = {
  held: "En revisión: entrégala desde Letters",
  rejected: "Rechazada en tu revisión, no se entregó",
};

// Correspondences waiting for your letter go first; otherwise newest first, as listed.
function yourTurnFirst(correspondences: MailboxCorrespondence[]): MailboxCorrespondence[] {
  return [
    ...correspondences.filter(({ state }) => state === "your_turn"),
    ...correspondences.filter(({ state }) => state !== "your_turn"),
  ];
}

function LetterItem({ letter }: { letter: MailboxLetter }) {
  const isYours = letter.sender === "author";
  const note = isYours ? OWN_LETTER_NOTES[letter.status] : undefined;
  const date = letter.deliveredAt ?? letter.createdAt;

  return (
    <li className={`flex flex-col gap-1 ${isYours ? "border-l-2 border-white/15 pl-3" : ""}`}>
      <div className="flex flex-wrap items-baseline gap-2 text-[11px] text-white/35">
        <span>{isYours ? "Tú" : "Visitante"}</span>
        <span>{new Date(date).toLocaleString()}</span>
        {note && <span className="text-amber-300/80">{note}</span>}
      </div>
      <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-white/85">
        {letter.body ?? <span className="italic text-white/30">texto anonimizado</span>}
      </p>
    </li>
  );
}

export default async function AdminMailboxPage() {
  const { correspondences } = await getSeedPhraseMailbox();

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-lg font-medium">Tu buzón de frases semilla</h1>
        <p className="mt-1 text-sm text-white/40">
          Correspondencias sobre tus frases semilla, vistas como autor: igual que las ve cualquier autor con su llave.
          Una aparece cuando ya entregaste la primera carta del visitante desde Letters. Tus respuestas pasan por la
          misma moderación y revisión que cualquier carta: después de enviarla, entrégala desde Letters.
        </p>
      </div>

      {correspondences.length === 0 ? (
        <p className="text-sm text-white/40">Todavía no te ha llegado ninguna carta.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {yourTurnFirst(correspondences).map((correspondence) => {
            const state = STATE_LABELS[correspondence.state];

            return (
              <AdminCard
                as="li"
                key={correspondence.id}
                tone={correspondence.state === "your_turn" ? "warning" : "neutral"}
                className="flex flex-col gap-4 p-4"
              >
                <span className={`text-xs ${state.className}`}>{state.text}</span>

                <div>
                  <p className="text-[11px] uppercase tracking-wide text-white/35">Tu frase</p>
                  <blockquote className="mt-1 break-words border-l-2 border-white/20 pl-3 text-sm text-white/60">
                    {correspondence.phraseText}
                  </blockquote>
                </div>

                <ol className="flex flex-col gap-3">
                  {correspondence.letters.map((letter) => (
                    <LetterItem key={`${letter.sender}-${letter.createdAt}`} letter={letter} />
                  ))}
                </ol>

                {correspondence.state === "your_turn" && (
                  <SeedPhraseLetterForm correspondenceId={correspondence.id} maxLength={LETTER_MAX_LENGTH} />
                )}
              </AdminCard>
            );
          })}
        </ul>
      )}
    </div>
  );
}
