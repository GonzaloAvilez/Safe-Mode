import { supabaseAdmin } from "@/lib/supabase";
import { DAILY_SPEND_CAP_USD } from "@/lib/safety/spend-cap";

type DailySpendRow = {
  date: string;
  total_usd: number;
};

const RECENT_DAYS = 14;

export default async function AdminSpendPage() {
  const { data, error } = await supabaseAdmin
    .from("daily_spend")
    .select("date, total_usd")
    .order("date", { ascending: false })
    .limit(RECENT_DAYS);

  if (error) throw error;

  const rows = (data ?? []) as DailySpendRow[];
  const today = new Date().toISOString().slice(0, 10);
  const todayRow = rows.find((row) => row.date === today);
  const todaySpend = todayRow?.total_usd ?? 0;
  const pctOfCap = Math.min(100, (todaySpend / DAILY_SPEND_CAP_USD) * 100);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-lg font-medium">Gasto diario (OpenAI embeddings)</h1>
        <p className="mt-1 text-sm text-white/40">
          Solo los embeddings cuestan — la Moderation API es gratuita. Tope duro: ${DAILY_SPEND_CAP_USD}/día (D4).
        </p>
      </div>

      <div className="max-w-md rounded-lg border border-white/10 p-5">
        <div className="flex items-baseline justify-between">
          <span className="text-2xl font-medium">${todaySpend.toFixed(4)}</span>
          <span className="text-sm text-white/40">de ${DAILY_SPEND_CAP_USD.toFixed(2)}</span>
        </div>
        <div className="mt-3 h-1.5 w-full rounded-full bg-white/10">
          <div
            className={`h-full rounded-full ${pctOfCap >= 90 ? "bg-red-400" : pctOfCap >= 60 ? "bg-amber-400" : "bg-emerald-400"}`}
            style={{ width: `${pctOfCap}%` }}
          />
        </div>
        <p className="mt-2 text-[11px] text-white/35">{pctOfCap.toFixed(1)}% del tope de hoy ({today}).</p>
      </div>

      <div>
        <h2 className="text-sm font-medium text-white/70">Últimos {RECENT_DAYS} días</h2>
        {rows.length === 0 ? (
          <p className="mt-2 text-sm text-white/40">Sin registros de gasto todavía.</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-1.5">
            {rows.map((row) => (
              <li key={row.date} className="flex items-center justify-between border-b border-white/5 py-1.5 text-sm">
                <span className="text-white/60">{row.date}</span>
                <span className="text-white/85">${row.total_usd.toFixed(4)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
