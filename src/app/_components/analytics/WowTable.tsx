import { formatNumber } from "@/app/_lib/ui";
import type { WowRow } from "@/lib/queries";

// Direction is carried by an arrow glyph as well as color, so the sign never
// rests on hue alone. Green = up (good), red = down; "신규" for no baseline.
function Delta({ pct }: { pct: number | null }) {
  if (pct === null)
    return (
      <span className="tabular-nums" style={{ color: "var(--series-4)" }}>
        ▲ 신규
      </span>
    );
  const rounded = Math.round(pct);
  if (rounded === 0)
    return <span className="tabular-nums text-[var(--text-muted)]">— 0%</span>;
  const up = rounded > 0;
  return (
    <span
      className="tabular-nums"
      style={{ color: up ? "var(--series-4)" : "var(--series-6)" }}
    >
      {up ? "▲" : "▼"} {up ? "+" : ""}
      {rounded}%
    </span>
  );
}

export function WowTable({ rows, max = 12 }: { rows: WowRow[]; max?: number }) {
  const top = rows.slice(0, max);
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-xs text-[var(--text-muted)]">
          <th className="pb-2 font-medium">구성원</th>
          <th className="pb-2 text-right font-medium">이번 주</th>
          <th className="pb-2 text-right font-medium">지난 주</th>
          <th className="pb-2 text-right font-medium">증감</th>
        </tr>
      </thead>
      <tbody>
        {top.map((r) => (
          <tr
            key={r.memberId}
            className="border-t border-black/5 dark:border-white/5"
          >
            <td className="py-2 text-[var(--text-primary)]">{r.name}</td>
            <td className="py-2 text-right tabular-nums text-[var(--text-secondary)]">
              {r.tokens ? formatNumber(r.tokens) : "—"}
            </td>
            <td className="py-2 text-right tabular-nums text-[var(--text-muted)]">
              {r.prevTokens ? formatNumber(r.prevTokens) : "—"}
            </td>
            <td className="py-2 text-right">
              <Delta pct={r.pct} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
