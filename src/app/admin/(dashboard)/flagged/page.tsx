import { supabaseAdmin } from "@/lib/supabase";
import { CRISIS_RETENTION_DAYS } from "@/lib/crisis-entries";

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

export default async function AdminFlaggedPage() {
  const [flaggedResult, crisisResult] = await Promise.all([
    supabaseAdmin
      .from("entries")
      .select("id, text, created_at")
      .eq("flagged_general", true)
      .order("created_at", { ascending: false }),
    supabaseAdmin.from("crisis_entries").select("entry_id, text, anonymized_at, created_at").order("created_at", {
      ascending: false,
    }),
  ]);

  if (flaggedResult.error) throw flaggedResult.error;
  if (crisisResult.error) throw crisisResult.error;

  const flagged = (flaggedResult.data ?? []) as FlaggedEntryRow[];
  const crisis = (crisisResult.data ?? []) as CrisisEntryRow[];

  return (
    <div className="flex flex-col gap-10">
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
              <li key={row.entry_id} className="rounded-lg border border-red-500/20 p-4">
                {row.anonymized_at ? (
                  <p className="text-sm text-white/35 italic">Texto anonimizado el {new Date(row.anonymized_at).toLocaleString()}.</p>
                ) : (
                  <p className="text-sm leading-relaxed text-white/85">{row.text}</p>
                )}
                <p className="mt-3 text-[11px] text-white/35">{new Date(row.created_at).toLocaleString()}</p>
              </li>
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
              <li key={row.id} className="rounded-lg border border-amber-500/20 p-4">
                <p className="text-sm leading-relaxed text-white/85">{row.text}</p>
                <p className="mt-3 text-[11px] text-white/35">{new Date(row.created_at).toLocaleString()}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
