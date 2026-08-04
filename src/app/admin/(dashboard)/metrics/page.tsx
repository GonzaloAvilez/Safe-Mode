import { supabaseAdmin } from "@/lib/supabase";
import { AdminCard } from "../../_components/admin-card";

type OutcomeCounts = Record<string, number>;

export default async function AdminMetricsPage() {
  const { data, error } = await supabaseAdmin.from("entries").select("outcome");

  if (error) throw error;

  const rows = data ?? [];

  const counts: OutcomeCounts = {};
  for (const row of rows) {
    const key = row.outcome ?? "pending";
    counts[key] = (counts[key] ?? 0) + 1;

  }

  const matched = counts["matched"] ?? 0;
  const noMatch = counts["no_match"] ?? 0;
  const matchRate = matched + noMatch > 0 ? (matched / (matched + noMatch)) * 100 : 0;

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-lg font-medium">Resultados reales de entradas</h1>
        <p className="mt-1 text-sm text-white/40">
          {rows.length} entrada{rows.length === 1 ? "" : "s"} en total. Desglose real de qué pasó con cada una,
          no una estimación.
        </p>
      </div>

      <AdminCard className="max-w-md p-5">
        <div className="text-2xl font-medium">{matchRate.toFixed(1)}%</div>
        <div className="text-[11px] text-white/35">match rate (de las que llegaron a intentar matchear)</div>
      </AdminCard>

      <div>
        <h2 className="text-sm font-medium text-white/70">Desglose por resultado</h2>
        {rows.length === 0 ? (
          <p className="mt-2 text-sm text-white/40">Todavía no hay entradas registradas.</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-1.5">
            {Object.entries(counts).map(([outcome, count]) => (
              <li key={outcome} className="flex items-center justify-between border-b border-white/5 py-1.5 text-sm">
                <span className="text-white/60">{outcome}</span>
                <span className="text-white/85">{count}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
