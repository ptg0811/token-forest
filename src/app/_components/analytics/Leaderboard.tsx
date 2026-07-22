"use client";

import { useState } from "react";
import {
  Bar,
  BarChart,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Legend } from "@/app/_components/charts";
import {
  formatCompact,
  formatNumber,
  toolColor,
  toolLabel,
  toolSlot,
} from "@/app/_lib/ui";
import type { LeaderboardRow } from "@/lib/queries";
import { useNumStyle } from "@/app/_components/NumStyleProvider";

// Which number the bars show. "tokens" is the raw input+output sum (not
// comparable across sources); "share" is the cost-weighted index where the
// team total is 100 (see src/lib/pricing.ts).
type Metric = "tokens" | "share";

const METRIC_TIP: Record<Metric, string> = {
  tokens: "입력+출력 토큰 단순합산 — 토크나이저·도구 특성이 달라 소스 간 직접 비교 지표는 아닙니다",
  share:
    "모델 단가로 가중한 상대 활용도(팀 합계=100). 토크나이저·도구 차이를 보정하며 캐시 토큰을 포함합니다. 단가는 근사치",
};

type ChartRow = {
  name: string;
  total: number;
  tokens: number;
  requests: number;
} & Record<string, number | string>;

// Per-tool values + the member's total and request count. Reads the full
// datum off payload[0].payload so `requests` (not a plotted series) is
// available.
function LeaderboardTooltip({
  active,
  payload,
  metric,
}: {
  active?: boolean;
  payload?: Array<{
    dataKey?: string | number;
    value?: number;
    color?: string;
    payload?: ChartRow;
  }>;
  metric?: Metric;
}) {
  const numStyle = useNumStyle();
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  if (!row) return null;
  const isShare = metric === "share";
  const fmt = (v: number) => (isShare ? v.toFixed(1) : formatNumber(v));
  const segments = payload.filter((p) => (p.value ?? 0) !== 0);
  return (
    <div className="rounded-md border border-black/10 bg-[var(--surface-1)] px-3 py-2 text-xs shadow-lg dark:border-white/10">
      <div className="mb-1 font-medium text-[var(--text-secondary)]">{row.name}</div>
      <ul className="space-y-1">
        {segments.map((p) => (
          <li key={String(p.dataKey)} className="flex items-center gap-2">
            <span
              className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm"
              style={{ background: String(p.color) }}
            />
            <span className="text-[var(--text-secondary)]">
              {toolLabel(String(p.dataKey))}
            </span>
            <span className="ml-auto pl-3 font-medium tabular-nums text-[var(--text-primary)]">
              {fmt(p.value ?? 0)}
            </span>
          </li>
        ))}
      </ul>
      <div className="mt-1.5 flex justify-between gap-3 border-t border-black/5 pt-1.5 text-[var(--text-secondary)] dark:border-white/5">
        <span>
          {isShare
            ? `지수 ${row.total.toFixed(1)} · ${formatCompact(row.tokens, numStyle)} 토큰`
            : `합계 ${formatNumber(row.tokens)} 토큰`}
        </span>
        <span className="tabular-nums">
          요청 {formatNumber(row.requests)}
          {row.requests > 0 && (
            <span className="ml-2 text-[var(--text-muted)]">
              · 요청당 {formatCompact(row.tokens / row.requests, numStyle)}
            </span>
          )}
        </span>
      </div>
    </div>
  );
}

function ToggleButton({
  active,
  onClick,
  title,
  children,
}: {
  active: boolean;
  onClick: () => void;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`rounded-md px-2.5 py-1 transition-colors ${
        active
          ? "bg-[var(--series-1)] font-medium text-white"
          : "text-[var(--text-secondary)] hover:bg-black/5 dark:hover:bg-white/5"
      }`}
    >
      {children}
    </button>
  );
}

// Horizontal ranking (나래비), stacked by tool. Metric is switchable between
// raw tokens and the cost-weighted index; sort direction toggles asc/desc.
// Total is direct-labeled at each bar's end; requests ride along in the
// tooltip as the secondary read.
export function Leaderboard({
  rows,
  max = 12,
}: {
  rows: LeaderboardRow[];
  max?: number;
}) {
  const numStyle = useNumStyle();
  const [metric, setMetric] = useState<Metric>("tokens");
  const [desc, setDesc] = useState(true);
  const isShare = metric === "share";

  const valueOf = (r: LeaderboardRow) => (isShare ? r.weightedShare : r.tokens);
  const top = rows
    .slice()
    .sort(
      (a, b) =>
        (desc ? valueOf(b) - valueOf(a) : valueOf(a) - valueOf(b)) ||
        a.name.localeCompare(b.name),
    )
    .slice(0, max);
  const toolSet = new Set<string>();
  for (const r of top) {
    for (const t of Object.keys(isShare ? r.byToolShare : r.byTool)) toolSet.add(t);
  }
  // Fixed categorical order by slot so a tool keeps its color across renders.
  const tools = [...toolSet].sort((a, b) => toolSlot(a) - toolSlot(b));

  const data: ChartRow[] = top.map((r) => ({
    name: r.name,
    total: valueOf(r),
    tokens: r.tokens,
    requests: r.requests,
    ...Object.fromEntries(
      tools.map((t) => [t, (isShare ? r.byToolShare : r.byTool)[t] ?? 0]),
    ),
  }));
  const height = Math.max(160, data.length * 40 + 24);

  const renderTotal = (props: {
    x?: number | string;
    y?: number | string;
    width?: number | string;
    height?: number | string;
    index?: number;
  }) => {
    const x = Number(props.x ?? 0);
    const y = Number(props.y ?? 0);
    const width = Number(props.width ?? 0);
    const h = Number(props.height ?? 0);
    const row = data[props.index ?? 0];
    if (!row) return null;
    return (
      <text
        x={x + width + 6}
        y={y + h / 2}
        dy="0.32em"
        fontSize={11}
        className="tabular-nums"
        fill="var(--text-secondary)"
      >
        {isShare ? row.total.toFixed(1) : formatCompact(row.tokens, numStyle)}
      </text>
    );
  };

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="inline-flex rounded-lg border border-black/10 p-0.5 dark:border-white/10">
          <ToggleButton
            active={!isShare}
            onClick={() => setMetric("tokens")}
            title={METRIC_TIP.tokens}
          >
            토큰(단순합산)
          </ToggleButton>
          <ToggleButton
            active={isShare}
            onClick={() => setMetric("share")}
            title={METRIC_TIP.share}
          >
            보정 지수
          </ToggleButton>
        </div>
        <button
          type="button"
          onClick={() => setDesc((d) => !d)}
          className="rounded-lg border border-black/10 px-2.5 py-1.5 text-[var(--text-secondary)] transition-colors hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/5"
        >
          {desc ? "내림차순 ▼" : "오름차순 ▲"}
        </button>
      </div>
      <ResponsiveContainer width="100%" height={height}>
        <BarChart
          layout="vertical"
          data={data}
          margin={{ top: 4, right: 56, left: 0, bottom: 0 }}
        >
          <XAxis type="number" hide />
          <YAxis
            type="category"
            dataKey="name"
            width={96}
            tickLine={false}
            axisLine={false}
            tick={{ fill: "var(--text-secondary)", fontSize: 12 }}
          />
          <Tooltip
            cursor={{ fill: "var(--grid)", opacity: 0.4 }}
            content={<LeaderboardTooltip metric={metric} />}
          />
          {tools.map((t, i) => (
            <Bar
              key={t}
              dataKey={t}
              stackId="value"
              fill={toolColor(t)}
              stroke="var(--surface-1)"
              strokeWidth={2}
              maxBarSize={26}
              radius={i === tools.length - 1 ? [0, 3, 3, 0] : undefined}
            >
              {i === tools.length - 1 && <LabelList content={renderTotal} />}
            </Bar>
          ))}
        </BarChart>
      </ResponsiveContainer>
      <Legend tools={tools} />
      <p className="mt-2 text-[11px] text-[var(--text-muted)]">{METRIC_TIP[metric]}</p>
      <MethodologyNote />
    </div>
  );
}

function SourceLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="text-[var(--series-1)] underline decoration-dotted underline-offset-2"
    >
      {children}
    </a>
  );
}

// Why the index exists, with primary sources — so a member can audit the
// methodology instead of taking the number on faith.
function MethodologyNote() {
  return (
    <details className="mt-2 text-[11px] text-[var(--text-muted)]">
      <summary className="cursor-pointer select-none font-medium text-[var(--text-secondary)]">
        보정 지수란? — 계산 방식과 근거
      </summary>
      <div className="mt-2 space-y-2 leading-relaxed">
        <p>
          <strong>계산:</strong> 각 사용 기록의 토큰(입력·출력·캐시 읽기/쓰기)에 해당 모델의
          공식 단가(USD/100만 토큰)를 곱해 합산하고, 팀 전체 합을 100으로 정규화한 상대치입니다.
          금액 자체는 표시하지 않습니다 — 이 지표의 목적은 비용 정산이 아니라 공정한 비교입니다.
        </p>
        <p>
          <strong>왜 단순합산으로는 안 되나:</strong> 토큰은 벤더·모델마다 단위가 다릅니다.
          Anthropic 공식 문서는 신형 토크나이저(Opus 4.7+/Fable 5/Sonnet 5)가 같은 텍스트에서
          약 30% 더 많은 토큰을 생성한다고 명시하며(
          <SourceLink href="https://platform.claude.com/docs/en/about-claude/pricing">
            Anthropic 가격 문서
          </SourceLink>
          ), 토크나이저 간 격차가 수 배에 달할 수 있음은 학술적으로도 검증됐습니다(
          <SourceLink href="https://arxiv.org/abs/2305.15425">
            Petrov et al., NeurIPS 2023
          </SourceLink>
          ). 유일한 공통 단위는 가격이라, 모델 비교 벤치마크들도 단가 가중을 씁니다(
          <SourceLink href="https://artificialanalysis.ai/tools/llm-price-calculator">
            Artificial Analysis
          </SourceLink>
          ).
        </p>
        <p>
          <strong>캐시를 포함하는 이유:</strong> 캐시 읽기/쓰기도 과금되는 실제 연산입니다
          (Anthropic 기준 읽기=기본 입력의 0.1×, 쓰기=1.25× —{" "}
          <SourceLink href="https://platform.claude.com/docs/en/build-with-claude/prompt-caching">
            프롬프트 캐싱 문서
          </SourceLink>
          ). 에이전틱 도구 사용의 대부분이 캐시라, 빼면 소비 구조가 왜곡됩니다. 단가 출처:{" "}
          <SourceLink href="https://platform.claude.com/docs/en/about-claude/pricing">
            Anthropic
          </SourceLink>
          {" · "}
          <SourceLink href="https://developers.openai.com/api/docs/pricing">OpenAI</SourceLink>
          {" "}공식 가격표(2026-07 기준, <code>src/lib/pricing.ts</code>).
        </p>
        <p>
          <strong>지수 ≠ 성과:</strong> 토큰은 투입량이라 업무 능률을 나타내지 않습니다.
          통제 실험에서 개발자들은 AI로 20% 빨라졌다고 느꼈지만 실제로는 19% 느렸고(
          <SourceLink href="https://metr.org/blog/2025-07-10-early-2025-ai-experienced-os-dev-study/">
            METR RCT, 2025
          </SourceLink>
          ), 개발 생산성은 단일 지표로 측정할 수 없다는 것이 정설입니다(
          <SourceLink href="https://queue.acm.org/detail.cfm?id=3454124">
            SPACE, ACM Queue 2021
          </SourceLink>
          ). 이 지수는 활용도·도입률 지표로만 읽어 주세요.
        </p>
      </div>
    </details>
  );
}
