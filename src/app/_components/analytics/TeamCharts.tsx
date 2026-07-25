"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ComposedChart,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatNumber } from "@/app/_lib/ui";
import type { LimitDay, TierWeek, WeeklyRate } from "@/lib/queries";

// Axis/grid constants duplicated from charts.tsx (not exported there — kept
// local by design so that file stays untouched).
const AXIS = "var(--text-muted)";
const GRID = "var(--grid)";

const axisProps = {
  stroke: "var(--axis)",
  tick: { fill: AXIS, fontSize: 11 },
  tickLine: false,
} as const;

function shortDate(v: string): string {
  // "2026-07-15" -> "07-15" (weeks are Monday dates, so this covers both).
  return v.length === 10 ? v.slice(5) : v;
}

const pctTick = (v: number) => `${v}%`;

function pct(v: number): string {
  return `${v.toFixed(1).replace(/\.0$/, "")}%`;
}

const CHART_MARGIN = { top: 8, right: 8, left: 0, bottom: 0 } as const;

// Shared tooltip shell: surface card, text-token ink (same look as the
// ChartTooltip in charts.tsx).
function TipBox({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-md border border-black/10 bg-[var(--surface-1)] px-3 py-2 text-xs shadow-lg dark:border-white/10">
      <div className="mb-1 font-medium text-[var(--text-secondary)]">{title}</div>
      {children}
    </div>
  );
}

// Inline legend: color chip + free-form label. The Legend in charts.tsx
// assumes tool keys, so team charts carry their own.
function InlineLegend({
  items,
}: {
  items: Array<{ label: string; color: string }>;
}) {
  if (items.length < 2) return null;
  return (
    <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
      {items.map((it) => (
        <li
          key={it.label}
          className="flex items-center gap-1.5 text-xs text-[var(--text-secondary)]"
        >
          <span
            className="inline-block h-2.5 w-2.5 rounded-sm"
            style={{ background: it.color }}
          />
          {it.label}
        </li>
      ))}
    </ul>
  );
}

// ---- adoption rate ----------------------------------------------------------

function AdoptionTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ payload?: WeeklyRate }>;
  label?: string | number;
}) {
  const row = payload?.[0]?.payload;
  if (!active || !row) return null;
  return (
    <TipBox title={shortDate(String(label))}>
      <div className="tabular-nums text-[var(--text-primary)]">
        {row.active}/{row.total}명 ({pct(row.activePct)})
      </div>
    </TipBox>
  );
}

// Weekly team adoption: distinct active members / roster, as %. Dots stay on —
// each point is a whole week, so the point itself is the datum.
export function AdoptionRateChart({
  data,
  height = 240,
}: {
  data: WeeklyRate[];
  height?: number;
}) {
  if (!data.length) return null;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={CHART_MARGIN}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey="week" tickFormatter={shortDate} minTickGap={16} {...axisProps} />
        <YAxis width={40} domain={[0, 100]} tickFormatter={pctTick} {...axisProps} />
        <Tooltip cursor={{ stroke: "var(--axis)" }} content={<AdoptionTooltip />} />
        <Line
          type="monotone"
          dataKey="activePct"
          stroke="var(--series-1)"
          strokeWidth={2}
          dot={{ r: 3, fill: "var(--series-1)", strokeWidth: 0 }}
          activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--surface-1)" }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

// ---- small weekly trend (shared by efficiency + scorecard views) -----------

function SmallTrendTooltip({
  active,
  payload,
  label,
  format,
}: {
  active?: boolean;
  payload?: Array<{ value?: number | null }>;
  label?: string | number;
  format: (v: number) => string;
}) {
  const v = payload?.[0]?.value;
  if (!active || v === null || v === undefined) return null;
  return (
    <TipBox title={shortDate(String(label))}>
      <div className="tabular-nums text-[var(--text-primary)]">{format(v)}</div>
    </TipBox>
  );
}

// One small weekly line, generic over the row shape so both the team
// efficiency trend and the scorecard's pooled/median pairs can share it.
// Null weeks (metric undefined, e.g. no CC sessions) break the line on
// purpose — no connectNulls, a gap is information.
//
// IQR band: when a point carries p25/p75 (weeklyTeamSeries only emits these
// once a week reaches the 8-active-member guard — src/lib/scorecard.ts
// showBand) and showBand is requested, a low-opacity Area is drawn behind
// the line spanning [p25, p75] — the member-distribution spread behind the
// median. Below 8 active members the fields are absent and no band renders.
export function SmallTrend<T extends { week: string; p25?: number; p75?: number }>({
  data,
  dataKey,
  title,
  domain,
  tickFormatter,
  format,
  yWidth,
  dashed = false,
  showBand = false,
}: {
  data: T[];
  dataKey: keyof T & string;
  title: string;
  domain?: [number, number];
  tickFormatter: (v: number) => string;
  format: (v: number) => string;
  yWidth: number;
  dashed?: boolean;
  showBand?: boolean;
}) {
  const hasBand = showBand && data.some((d) => d.p25 != null && d.p75 != null);
  const chartData = hasBand
    ? data.map((d) => ({
        ...d,
        range: d.p25 != null && d.p75 != null ? [d.p25, d.p75] : undefined,
      }))
    : data;
  return (
    <div>
      <div className="mb-1 text-xs font-medium text-[var(--text-secondary)]">
        {title}
      </div>
      <ResponsiveContainer width="100%" height={160}>
        <ComposedChart data={chartData} margin={CHART_MARGIN}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis
            dataKey="week"
            tickFormatter={shortDate}
            minTickGap={16}
            {...axisProps}
          />
          <YAxis
            width={yWidth}
            domain={domain}
            tickFormatter={tickFormatter}
            {...axisProps}
          />
          <Tooltip
            cursor={{ stroke: "var(--axis)" }}
            content={<SmallTrendTooltip format={format} />}
          />
          {hasBand && (
            <Area
              type="monotone"
              dataKey="range"
              stroke="none"
              fill="var(--series-1)"
              fillOpacity={0.15}
              isAnimationActive={false}
              connectNulls={false}
            />
          )}
          <Line
            type="monotone"
            dataKey={dataKey}
            stroke="var(--series-1)"
            strokeWidth={2}
            strokeDasharray={dashed ? "4 3" : undefined}
            dot={{ r: 2.5, fill: "var(--series-1)", strokeWidth: 0 }}
            activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--surface-1)" }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

// ---- model tier mix ---------------------------------------------------------

function familyColor(i: number): string {
  return `var(--series-${(i % 8) + 1})`;
}

function TierTooltip({
  active,
  payload,
  label,
  families,
}: {
  active?: boolean;
  payload?: Array<{ dataKey?: string | number; value?: number }>;
  label?: string | number;
  families: string[];
}) {
  if (!active || !payload?.length) return null;
  const rows = payload.filter((p) => (p.value ?? 0) > 0);
  if (!rows.length) return null;
  return (
    <TipBox title={shortDate(String(label))}>
      <ul className="space-y-1">
        {rows.map((p) => {
          const family = String(p.dataKey);
          return (
            <li key={family} className="flex items-center gap-2">
              <span
                className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm"
                style={{ background: familyColor(families.indexOf(family)) }}
              />
              <span className="text-[var(--text-secondary)]">{family}</span>
              <span className="ml-auto pl-3 font-medium tabular-nums text-[var(--text-primary)]">
                {pct(p.value ?? 0)}
              </span>
            </li>
          );
        })}
      </ul>
    </TipBox>
  );
}

// Stacked 100% area: weekly token share per pricing family. The surface-color
// stroke is the gap that keeps adjacent layers distinct; chip colors in the
// tooltip/legend come from the family's index, not the stroke.
export function TierMixChart({
  weeks,
  families,
  height = 260,
}: {
  weeks: TierWeek[];
  families: string[];
  height?: number;
}) {
  if (!weeks.length || !families.length) return null;
  return (
    <div>
      <ResponsiveContainer width="100%" height={height}>
        <AreaChart data={weeks} margin={CHART_MARGIN}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis
            dataKey="week"
            tickFormatter={shortDate}
            minTickGap={16}
            {...axisProps}
          />
          <YAxis width={40} domain={[0, 100]} tickFormatter={pctTick} {...axisProps} />
          <Tooltip
            cursor={{ stroke: "var(--axis)" }}
            content={<TierTooltip families={families} />}
          />
          {families.map((f, i) => (
            <Area
              key={f}
              type="monotone"
              dataKey={f}
              stackId="tier"
              fill={familyColor(i)}
              fillOpacity={1}
              stroke="var(--surface-1)"
              strokeWidth={1}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
      <InlineLegend
        items={families.map((f, i) => ({ label: f, color: familyColor(i) }))}
      />
    </div>
  );
}

// ---- limit history ----------------------------------------------------------

// Fixed colors for the windows we know; anything else takes series-3 onward in
// order of appearance, so a window keeps its color within the chart.
const WINDOW_COLORS: Record<string, string> = {
  five_hour: "var(--series-1)",
  seven_day: "var(--series-2)",
};

function LimitTooltip({
  active,
  payload,
  label,
  colorOf,
}: {
  active?: boolean;
  payload?: Array<{ dataKey?: string | number; value?: number }>;
  label?: string | number;
  colorOf: Map<string, string>;
}) {
  if (!active || !payload?.length) return null;
  const rows = payload.filter((p) => p.value !== null && p.value !== undefined);
  if (!rows.length) return null;
  return (
    <TipBox title={shortDate(String(label))}>
      <ul className="space-y-1">
        {rows.map((p) => {
          const window = String(p.dataKey);
          return (
            <li key={window} className="flex items-center gap-2">
              <span
                className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm"
                style={{ background: colorOf.get(window) }}
              />
              <span className="text-[var(--text-secondary)]">{window}</span>
              <span className="ml-auto pl-3 font-medium tabular-nums text-[var(--text-primary)]">
                {formatNumber(p.value ?? 0)}%
              </span>
            </li>
          );
        })}
      </ul>
    </TipBox>
  );
}

// Daily peak utilization for one account, one line per limit window, with a
// dashed 90% caution line. Small dots keep isolated days (gaps in a window's
// history) visible — a dotless broken line would render nothing there.
export function LimitHistoryChart({
  days,
  height = 220,
}: {
  days: LimitDay[];
  height?: number;
}) {
  if (!days.length) return null;

  const windows: string[] = [];
  for (const d of days) if (!windows.includes(d.window)) windows.push(d.window);
  const colorOf = new Map<string, string>();
  let nextSlot = 3;
  for (const w of windows) {
    colorOf.set(w, WINDOW_COLORS[w] ?? `var(--series-${((nextSlot++ - 1) % 8) + 1})`);
  }

  // Pivot: one row per date, one column per window.
  const byDate = new Map<string, Record<string, string | number>>();
  for (const d of days) {
    let row = byDate.get(d.date);
    if (!row) byDate.set(d.date, (row = { date: d.date }));
    row[d.window] = d.peakPct;
  }
  const data = [...byDate.values()].sort((a, b) =>
    String(a.date).localeCompare(String(b.date)),
  );

  return (
    <div>
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={data} margin={CHART_MARGIN}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis
            dataKey="date"
            tickFormatter={shortDate}
            minTickGap={24}
            {...axisProps}
          />
          <YAxis width={40} domain={[0, 100]} tickFormatter={pctTick} {...axisProps} />
          <Tooltip
            cursor={{ stroke: "var(--axis)" }}
            content={<LimitTooltip colorOf={colorOf} />}
          />
          <ReferenceLine
            y={90}
            stroke="var(--series-6)"
            strokeDasharray="4 4"
            strokeWidth={1}
          />
          {windows.map((w) => {
            const color = colorOf.get(w);
            return (
              <Line
                key={w}
                type="monotone"
                dataKey={w}
                stroke={color}
                strokeWidth={2}
                dot={{ r: 2, fill: color, strokeWidth: 0 }}
                activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--surface-1)" }}
              />
            );
          })}
        </LineChart>
      </ResponsiveContainer>
      <InlineLegend
        items={windows.map((w) => ({ label: w, color: colorOf.get(w) ?? "" }))}
      />
    </div>
  );
}
