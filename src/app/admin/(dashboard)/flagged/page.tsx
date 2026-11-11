import { supabaseAdmin } from "@/lib/supabase";
import { CRISIS_RETENTION_DAYS } from "@/lib/crisis-entries";
import { CRISIS_LETTER_RETENTION_DAYS } from "@/lib/letter-retention";
import { AdminCard } from "../../_components/admin-card";

type FlaggedEntryRow = {
  id: string;
  text: string | null;
  created_at: string;
};

type CrisisEntryRow = {
  entry_id: string;
  text: string | null;
  anonymized_at: string | null;
  created_at: string;
};

// Letters are linked to an identity (unlike entries), so only text, role and dates are
// selected: no id of any kind reaches this page (not even as a React key, which Next
// ships to the browser in the RSC payload).
type CrisisLetterRow = {
  sender: "visitor" | "author";
  body: string | null;
  anonymized_at: string | null;
  created_at: string;
};

const LETTER_SENDER_LABELS: Record<CrisisLetterRow["sender"], string> = {
  visitor: "Visitante",
  author: "Autor de la frase",
};

export default async function AdminFlaggedPage() {
  const [flaggedResult, crisisResult, crisisLettersResult] = await Promise.all([
    supabaseAdmin
      .from("entries")
      .select("id, text, created_at")
      .eq("flagged_general", true)
      .order("created_at", { ascending: false }),
    supabaseAdmin.from("crisis_entries").select("entry_id, text, anonymized_at, created_at").order("created_at", {
      ascending: false,
    }),
    supabaseAdmin
      .from("letters")
      .select("sender, body, anonymized_at, created_at")
      .eq("status", "rejected")
      .eq("rejection_reason", "crisis")
      .order("created_at", { ascending: false }),
  ]);

  if (flaggedResult.error) throw flaggedResult.error;
  if (crisisResult.error) throw crisisResult.error;
  if (crisisLettersResult.error) throw crisisLettersResult.error;

  const flagged = (flaggedResult.data ?? []) as FlaggedEntryRow[];
  const crisis = (crisisResult.data ?? []) as CrisisEntryRow[];
  const crisisLetters = (crisisLettersResult.data ?? []) as CrisisLetterRow[];

  return (
    <div className="flex flex-col gap-10">
      <section className="flex flex-col gap-4">
        <div>
          <h1 className="text-lg font-medium">Crisis letters</h1>
          <p className="mt-1 text-sm text-white/40">
            Cartas que la moderación marcó como crisis (ADR-004): no se entregaron y a quien escribió se le mostró el
            recurso de ayuda. Solo texto, rol y fecha, sin datos que identifiquen a nadie. Se anonimizan
            automáticamente {CRISIS_LETTER_RETENTION_DAYS} días después de escritas (cron diario). Qué hacer con ellas
            está por decidir.
          </p>
        </div>
        {crisisLetters.length === 0 ? (
          <p className="text-sm text-white/40">Sin cartas de crisis registradas.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {crisisLetters.map((row, index) => (
              <AdminCard as="li" key={`${row.created_at}-${index}`} tone="danger" className="p-4">
                {row.anonymized_at ? (
                  <p className="text-sm text-white/35 italic">
                    Texto anonimizado el {new Date(row.anonymized_at).toLocaleString()}.
                  </p>
                ) : (
                  <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-white/85">{row.body}</p>
                )}
                <p className="mt-3 text-[11px] text-white/35">
                  {LETTER_SENDER_LABELS[row.sender]} · {new Date(row.created_at).toLocaleString()}
                </p>
              </AdminCard>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-4">
        <div>
          <h1 className="text-lg font-medium">Crisis entries</h1>
          <p className="mt-1 text-sm text-white/40">
            Texto aislado de la tabla general (ver P2 del hardening de seguridad). Se anonimiza automáticamente
            {" "}
            {CRISIS_RETENTION_DAYS} días después de creado — un cron diario borra el texto, deja solo la marca de
            tiempo.
          </p>
        </div>
        {crisis.length === 0 ? (
          <p className="text-sm text-white/40">Sin entries de crisis registradas.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {crisis.map((row) => (
              <AdminCard as="li" key={row.entry_id} tone="danger" className="p-4">
                {row.anonymized_at ? (
                  <p className="text-sm text-white/35 italic">Texto anonimizado el {new Date(row.anonymized_at).toLocaleString()}.</p>
                ) : (
                  <p className="text-sm leading-relaxed text-white/85">{row.text}</p>
                )}
                <p className="mt-3 text-[11px] text-white/35">{new Date(row.created_at).toLocaleString()}</p>
              </AdminCard>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-4">
        <div>
          <h1 className="text-lg font-medium">Entries flaggeadas (moderación general)</h1>
          <p className="mt-1 text-sm text-white/40">
            Flaggeadas por la Moderation API fuera de las categorías de self-harm (esas van arriba, en Crisis).
          </p>
        </div>
        {flagged.length === 0 ? (
          <p className="text-sm text-white/40">Sin entries flaggeadas.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {flagged.map((row) => (
              <AdminCard as="li" key={row.id} tone="warning" className="p-4">
                <p className="text-sm leading-relaxed text-white/85">{row.text}</p>
                <p className="mt-3 text-[11px] text-white/35">{new Date(row.created_at).toLocaleString()}</p>
              </AdminCard>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
