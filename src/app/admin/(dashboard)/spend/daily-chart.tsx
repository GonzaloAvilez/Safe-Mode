"use client";

import { useState } from "react";

type DailySpendRow = {
  date: string;
  total_usd: number;
  call_count: number;
  total_tokens: number;
};

const VIEWBOX_WIDTH = 728;
const VIEWBOX_HEIGHT = 180;
const PLOT_TOP = 10;
const BASELINE_Y = 140;
const BAR_MAX_WIDTH = 20;
const BAR_COLOR = "#3987e5";
const BAR_COLOR_HOVER = "#5598e7";

function niceCeil(value: number): number {
  if (value <= 5) return 5;
  if (value <= 10) return 10;
  if (value <= 20) return 20;
  if (value <= 50) return Math.ceil(value / 10) * 10;
  return Math.ceil(value / 25) * 25;
}

function formatShortDate(isoDate: string): string {
  const [, month, day] = isoDate.split("-");
  return `${day}/${month}`;
}

// Rounded top corners, square baseline — bars grow from a single baseline.
function barPath(x: number, y: number, width: number, height: number): string {
  const r = Math.max(0, Math.min(4, height / 2, width / 2));
  const top = y;
  const bottom = y + height;
  return `M${x},${bottom} V${top + r} Q${x},${top} ${x + r},${top} H${x + width - r} Q${x + width},${top} ${x + width},${top + r} V${bottom} Z`;
}

export function DailySpendChart({ rows }: { rows: DailySpendRow[] }) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const maxCalls = niceCeil(Math.max(1, ...rows.map((row) => row.call_count)));
  const plotHeight = BASELINE_Y - PLOT_TOP;
  const slotWidth = VIEWBOX_WIDTH / rows.length;

  const active = activeIndex !== null ? rows[activeIndex] : null;
  const activeLeftPct = activeIndex !== null ? ((activeIndex + 0.5) / rows.length) * 100 : 0;
  const activeBarTopY =
    activeIndex !== null ? BASELINE_Y - (rows[activeIndex].call_count / maxCalls) * plotHeight : BASELINE_Y;
  const activeBottomPct = ((VIEWBOX_HEIGHT - activeBarTopY) / VIEWBOX_HEIGHT) * 100;

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`}
        className="w-full"
        style={{ aspectRatio: `${VIEWBOX_WIDTH} / ${VIEWBOX_HEIGHT}` }}
        role="img"
        aria-label={`Llamadas por día, últimos ${rows.length} días`}
      >
        {/* gridlines */}
        <line
          x1={0}
          x2={VIEWBOX_WIDTH}
          y1={BASELINE_Y}
          y2={BASELINE_Y}
          stroke="rgba(255,255,255,0.15)"
          strokeWidth={1}
        />
        <line x1={0} x2={VIEWBOX_WIDTH} y1={PLOT_TOP} y2={PLOT_TOP} stroke="rgba(255,255,255,0.08)" strokeWidth={1} />
        <text x={VIEWBOX_WIDTH} y={PLOT_TOP - 2} textAnchor="end" className="fill-white/35" fontSize={9}>
          {maxCalls}
        </text>
        <text x={VIEWBOX_WIDTH} y={BASELINE_Y - 3} textAnchor="end" className="fill-white/35" fontSize={9}>
          0
        </text>

        {rows.map((row, index) => {
          const barHeight = (row.call_count / maxCalls) * plotHeight;
          const x = index * slotWidth + (slotWidth - BAR_MAX_WIDTH) / 2;
          const y = BASELINE_Y - barHeight;
          const isActive = activeIndex === index;

          return (
            <g
              key={row.date}
              tabIndex={0}
              role="img"
              aria-label={`${row.date}: ${row.call_count} llamadas, ${row.total_tokens.toLocaleString()} tokens, $${row.total_usd.toFixed(6)}`}
              className="cursor-default outline-none"
              onPointerEnter={() => setActiveIndex(index)}
              onPointerLeave={() => setActiveIndex((current) => (current === index ? null : current))}
              onFocus={() => setActiveIndex(index)}
              onBlur={() => setActiveIndex((current) => (current === index ? null : current))}
            >
              {/* generous hit area, bigger than the painted bar */}
              <rect x={index * slotWidth} y={PLOT_TOP} width={slotWidth} height={BASELINE_Y - PLOT_TOP} fill="transparent" />
              {row.call_count > 0 && (
                <path d={barPath(x, y, BAR_MAX_WIDTH, barHeight)} fill={isActive ? BAR_COLOR_HOVER : BAR_COLOR} />
              )}
              <text
                x={index * slotWidth + slotWidth / 2}
                y={VIEWBOX_HEIGHT - 4}
                textAnchor="middle"
                className={isActive ? "fill-white/70" : "fill-white/35"}
                fontSize={9}
              >
                {formatShortDate(row.date)}
              </text>
            </g>
          );
        })}
      </svg>

      {active && (
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-2 rounded-md border border-white/10 bg-neutral-900 px-2.5 py-1.5 text-xs whitespace-nowrap shadow-lg"
          style={{ left: `${activeLeftPct}%`, bottom: `${activeBottomPct}%` }}
        >
          <div className="font-medium text-white">{active.call_count} llamadas</div>
          <div className="mt-0.5 text-white/60">
            {active.date} · {active.total_tokens.toLocaleString()} tokens · ${active.total_usd.toFixed(6)}
          </div>
        </div>
      )}
    </div>
  );
}
