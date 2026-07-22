"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatCompact, formatNumber, toolColor, toolLabel } from "@/app/_lib/ui";
import { useNumStyle } from "@/app/_components/NumStyleProvider";

type Row = Record<string, string | number>;

const AXIS = "var(--text-muted)";
const GRID = "var(--grid)";

const axisProps = {
  stroke: "var(--axis)",
  tick: { fill: AXIS, fontSize: 11 },
  tickLine: false,
} as const;

function shortDate(v: string): string {
  // "2026-07-15" -> "07-15"; weeks "2026-W28" pass through.
  return v.length === 10 ? v.slice(5) : v;
}

const METRIC_LABELS: Record<string, string> = {
  tokens: "토큰",
  requests: "요청",
};

function seriesLabel(key: string): string {
  return METRIC_LABELS[key] ?? toolLabel(key);
}

// One tooltip style for every chart: surface card, text-token ink, colored dot
// carries identity (never colored text).
function ChartTooltip({
  active,
  payload,
  label,
  unit,
}: {
  active?: boolean;
  payload?: Array<{ dataKey?: string | number; name?: string; value?: number; color?: string }>;
  label?: string | number;
  unit: string;
}) {
  if (!active || !payload?.length) return null;
  const rows = payload.filter((p) => (p.value ?? 0) !== 0);
  if (!rows.length) return null;
  return (
    <div className="rounded-md border border-black/10 bg-[var(--surface-1)] px-3 py-2 text-xs shadow-lg dark:border-white/10">
      <div className="mb-1 font-medium text-[var(--text-secondary)]">
        {shortDate(String(label))}
      </div>
      <ul className="space-y-1">
        {rows.map((p) => (
          <li key={String(p.dataKey)} className="flex items-center gap-2">
            <span
              className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm"
              style={{ background: String(p.color) }}
            />
            <span className="text-[var(--text-secondary)]">
              {seriesLabel(String(p.dataKey))}
            </span>
            <span className="ml-auto pl-3 font-medium tabular-nums text-[var(--text-primary)]">
              {formatNumber(p.value ?? 0)} {unit}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Legend({ tools }: { tools: string[] }) {
  if (tools.length < 2) return null;
  return (
    <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
      {tools.map((t) => (
        <li key={t} className="flex items-center gap-1.5 text-xs text-[var(--text-secondary)]">
          <span
            className="inline-block h-2.5 w-2.5 rounded-sm"
            style={{ background: toolColor(t) }}
          />
          {toolLabel(t)}
        </li>
      ))}
    </ul>
  );
}

// Stacked columns of tokens by tool over time. A 2px surface stroke on each
// segment is the surface-gap that keeps touching segments distinct.
export function StackedTokensChart({
  data,
  tools,
  height = 280,
}: {
  data: Row[];
  tools: string[];
  height?: number;
}) {
  const numStyle = useNumStyle();
  return (
    <div>
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis
            dataKey="date"
            tickFormatter={shortDate}
            minTickGap={24}
            {...axisProps}
          />
          <YAxis
            width={52}
            tickFormatter={(v: number) => formatCompact(v, numStyle)}
            {...axisProps}
          />
          <Tooltip
            cursor={{ fill: "var(--grid)", opacity: 0.4 }}
            content={<ChartTooltip unit="토큰" />}
          />
          {tools.map((t, i) => (
            <Bar
              key={t}
              dataKey={t}
              stackId="tokens"
              fill={toolColor(t)}
              stroke="var(--surface-1)"
              strokeWidth={2}
              maxBarSize={24}
              radius={i === tools.length - 1 ? [3, 3, 0, 0] : undefined}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
      <Legend tools={tools} />
    </div>
  );
}

// Grouped columns: weekly active members per tool (adoption).
export function AdoptionChart({
  data,
  tools,
  height = 260,
}: {
  data: Row[];
  tools: string[];
  height?: number;
}) {
  return (
    <div>
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="date" tickFormatter={shortDate} minTickGap={16} {...axisProps} />
          <YAxis width={32} allowDecimals={false} {...axisProps} />
          <Tooltip
            cursor={{ fill: "var(--grid)", opacity: 0.4 }}
            content={<ChartTooltip unit="명" />}
          />
          {tools.map((t) => (
            <Bar key={t} dataKey={t} fill={toolColor(t)} maxBarSize={18} radius={[3, 3, 0, 0]} />
          ))}
        </BarChart>
      </ResponsiveContainer>
      <Legend tools={tools} />
    </div>
  );
}

// Single-series area trend (requests overview, member tokens/requests detail).
export function TrendArea({
  data,
  dataKey,
  color = "var(--series-1)",
  unit,
  height = 240,
}: {
  data: Row[];
  dataKey: string;
  color?: string;
  unit: string;
  height?: number;
}) {
  const gradId = `grad-${dataKey}`;
  const numStyle = useNumStyle();
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.18} />
            <stop offset="100%" stopColor={color} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey="date" tickFormatter={shortDate} minTickGap={24} {...axisProps} />
        <YAxis
          width={52}
          tickFormatter={(v: number) => formatCompact(v, numStyle)}
          {...axisProps}
        />
        <Tooltip cursor={{ stroke: "var(--axis)" }} content={<ChartTooltip unit={unit} />} />
        <Area
          type="monotone"
          dataKey={dataKey}
          stroke={color}
          strokeWidth={2}
          fill={`url(#${gradId})`}
          dot={false}
          activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--surface-1)" }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
