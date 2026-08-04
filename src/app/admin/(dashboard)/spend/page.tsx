import { supabaseAdmin } from "@/lib/supabase";
import { DAILY_SPEND_CAP_USD } from "@/lib/safety/spend-cap";
import { DailySpendChart } from "./daily-chart";

type DailySpendRow = {
  date: string;
  total_usd: number;
  call_count: number;
  total_tokens: number;
};

const RECENT_DAYS = 14;

export default async function AdminSpendPage() {
  const [{ data, error }, { data: allData, error: allError }] = await Promise.all([
    supabaseAdmin
      .from("daily_spend")
      .select("date, total_usd, call_count, total_tokens")
      .order("date", { ascending: false })
      .limit(RECENT_DAYS),
    // No limit — this is the full history, since the table is tiny at MVP scale (one row
    // per day since D7), same reasoning /admin/metrics uses for a plain select + JS reduce
    // instead of a Postgres-side aggregate.
    supabaseAdmin.from("daily_spend").select("total_usd, call_count, total_tokens"),
  ]);

  if (error) throw error;
  if (allError) throw allError;

  const rows = (data ?? []) as DailySpendRow[];
  const today = new Date().toISOString().slice(0, 10);
  const todayRow = rows.find((row) => row.date === today);
  const todaySpend = todayRow?.total_usd ?? 0;
  const todayCalls = todayRow?.call_count ?? 0;
  const todayTokens = todayRow?.total_tokens ?? 0;
  const pctOfCap = Math.min(100, (todaySpend / DAILY_SPEND_CAP_USD) * 100);

  const totalSpend = (allData ?? []).reduce(
    (acc, row) => ({
      usd: acc.usd + row.total_usd,
      calls: acc.calls + row.call_count,
      tokens: acc.tokens + row.total_tokens,
    }),
    { usd: 0, calls: 0, tokens: 0 }
  );

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-lg font-medium">Gasto diario (OpenAI embeddings)</h1>
        <p className="mt-1 text-sm text-white/40">
          Solo los embeddings cuestan — la Moderation API es gratuita. Tope duro: ${DAILY_SPEND_CAP_USD}/día (D4). A
          este precio ($0.02 por 1M tokens), el dólar real casi siempre redondea a cero — las llamadas y tokens son
          la señal que sí se ve.
        </p>
      </div>

      <div className="max-w-md rounded-lg border border-white/10 p-5">
        <div className="flex items-baseline gap-6">
          <div>
            <div className="text-2xl font-medium">{todayCalls}</div>
            <div className="text-[11px] text-white/35">llamadas hoy</div>
          </div>
          <div>
            <div className="text-2xl font-medium">{todayTokens.toLocaleString()}</div>
            <div className="text-[11px] text-white/35">tokens hoy</div>
          </div>
          <div>
            <div className="text-2xl font-medium">${todaySpend.toFixed(6)}</div>
            <div className="text-[11px] text-white/35">de ${DAILY_SPEND_CAP_USD.toFixed(2)}</div>
          </div>
        </div>
        <div className="mt-3 h-1.5 w-full rounded-full bg-white/10">
          <div
            className={`h-full rounded-full ${pctOfCap >= 90 ? "bg-red-400" : pctOfCap >= 60 ? "bg-amber-400" : "bg-emerald-400"}`}
            style={{ width: `${pctOfCap}%` }}
          />
        </div>
        <p className="mt-2 text-[11px] text-white/35">{pctOfCap.toFixed(4)}% del tope de hoy ({today}).</p>
      </div>

      <div className="max-w-md rounded-lg border border-white/10 p-5">
        <h2 className="text-sm font-medium text-white/70">Gasto total histórico</h2>
        <div className="mt-3 flex items-baseline gap-6">
          <div>
            <div className="text-2xl font-medium">{totalSpend.calls}</div>
            <div className="text-[11px] text-white/35">llamadas totales</div>
          </div>
          <div>
            <div className="text-2xl font-medium">{totalSpend.tokens.toLocaleString()}</div>
            <div className="text-[11px] text-white/35">tokens totales</div>
          </div>
          <div>
            <div className="text-2xl font-medium">${totalSpend.usd.toFixed(6)}</div>
            <div className="text-[11px] text-white/35">desde que empezó a registrarse</div>
          </div>
        </div>
      </div>

      <div>
        <h2 className="text-sm font-medium text-white/70">Últimos {RECENT_DAYS} días</h2>
        {rows.length === 0 ? (
          <p className="mt-2 text-sm text-white/40">Sin registros de gasto todavía.</p>
        ) : (
          <>
            <div className="mt-4 rounded-lg border border-white/10 p-5">
              <DailySpendChart rows={[...rows].reverse()} />
            </div>
            <details className="mt-3 text-sm">
              <summary className="cursor-pointer text-white/40 hover:text-white/70">Ver tabla</summary>
              <table className="mt-2 w-full text-left">
                <thead>
                  <tr className="text-[11px] text-white/35">
                    <th className="border-b border-white/5 py-1.5 font-normal">Día</th>
                    <th className="border-b border-white/5 py-1.5 font-normal">Llamadas</th>
                    <th className="border-b border-white/5 py-1.5 font-normal">Tokens</th>
                    <th className="border-b border-white/5 py-1.5 font-normal">Gasto</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.date} className="border-b border-white/5">
                      <td className="py-1.5 text-white/60">{row.date}</td>
                      <td className="py-1.5 text-white/85">{row.call_count}</td>
                      <td className="py-1.5 text-white/85">{row.total_tokens.toLocaleString()}</td>
                      <td className="py-1.5 text-white/85">${row.total_usd.toFixed(6)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          </>
        )}
      </div>
    </div>
  );
}
