"use client";

import { SmallTrend } from "./TeamCharts";
import { EmptyState } from "@/app/_components/ui";
import type { WeeklySeriesPoint } from "@/lib/scorecard";

// 팀 AI 활용 스코어카드 — 4축(습관·효율·숙련·확장), 원값만 표시(점수화 없음).
// 개인 유래 지표는 풀드(자원 관점)+중앙값(사람 관점) 두 시리즈를 나란히 보여준다
// (weeklyTeamSeries가 8명 미만 주엔 IQR 밴드를 이미 생략해 만든 데이터를 그대로 씀).
// 스펙: docs/superpowers/specs/2026-07-26-ai-scorecard-design.md

export type ModelAdoptionDisplay = {
  model: string;
  globalFirst: string;
  leadDays: number | null; // null = 팀 절반 미도달("확산 중")
};

export type TeamScorecardProps = {
  cacheHit: WeeklySeriesPoint[]; // 0..1
  cacheReuse: WeeklySeriesPoint[]; // 배율
  contextYield: WeeklySeriesPoint[]; // 0..1
  sessionDepth: WeeklySeriesPoint[]; // 턴/세션, claude_code 한정
  cacheSavingsPct: number | null; // 0..1 (A2)
  premiumShare: WeeklySeriesPoint[]; // 0..1, 프리미엄(Opus/Fable급) 토큰 비중
  modelAdoption: ModelAdoptionDisplay[];
  rampAvg: number[] | null; // 코호트 평균 [1주차..N주차], 코호트 0명이면 null
  cohortSize: number;
};

function pct(v: number): string {
  return `${(v * 100).toFixed(1).replace(/\.0$/, "")}%`;
}
const pctTick = (v: number) => `${Math.round(v * 100)}%`;
function ratio1(v: number): string {
  return v.toFixed(1);
}
function ratio2(v: number): string {
  return v.toFixed(2);
}

// 풀드(실선) + 중앙값(점선) 나란히 두 개 — SmallTrend는 단일 시리즈만 그리므로
// 관점별로 두 차트를 붙여 병기한다.
function TrendPair({
  title,
  data,
  domain,
  tickFormatter,
  format,
  yWidth,
}: {
  title: string;
  data: WeeklySeriesPoint[];
  domain?: [number, number];
  tickFormatter: (v: number) => string;
  format: (v: number) => string;
  yWidth: number;
}) {
  if (!data.length) return null;
  return (
    <div>
      <div className="mb-1 text-xs font-medium text-[var(--text-secondary)]">{title}</div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <SmallTrend
          data={data}
          dataKey="pooled"
          title="풀드 (자원 관점)"
          domain={domain}
          tickFormatter={tickFormatter}
          format={format}
          yWidth={yWidth}
        />
        <SmallTrend
          data={data}
          dataKey="median"
          title="중앙값 (사람 관점, 음영=IQR)"
          domain={domain}
          tickFormatter={tickFormatter}
          format={format}
          yWidth={yWidth}
          dashed
          showBand
        />
      </div>
    </div>
  );
}

export default function TeamScorecard({
  cacheHit,
  cacheReuse,
  contextYield,
  sessionDepth,
  cacheSavingsPct,
  premiumShare,
  modelAdoption,
  rampAvg,
  cohortSize,
}: TeamScorecardProps) {
  return (
    <div className="space-y-6 text-sm">
      <section>
        <h3 className="text-xs font-semibold text-[var(--text-muted)]">효율</h3>
        {cacheSavingsPct != null ? (
          <p className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl font-semibold tabular-nums text-[var(--text-primary)]">
              {pct(cacheSavingsPct)}
            </span>
            <span className="text-xs text-[var(--text-muted)]">캐시 절감률</span>
          </p>
        ) : (
          <p className="mt-1 text-xs text-[var(--text-muted)]">이 기간 절감 데이터가 없습니다.</p>
        )}
        <p className="text-[11px] text-[var(--text-muted)]">
          가중 자원 기준 — 달러 아님. 모델별 공개 단가로 상대 비중만 계산합니다.
        </p>
        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <TrendPair
            title="캐시 적중률"
            data={cacheHit}
            domain={[0, 1]}
            tickFormatter={pctTick}
            format={pct}
            yWidth={40}
          />
          <TrendPair
            title="캐시 재사용 배율"
            data={cacheReuse}
            tickFormatter={ratio1}
            format={ratio2}
            yWidth={36}
          />
          <TrendPair
            title="컨텍스트 수율"
            data={contextYield}
            domain={[0, 1]}
            tickFormatter={pctTick}
            format={pct}
            yWidth={40}
          />
          <TrendPair
            title="프리미엄 모델 비중"
            data={premiumShare}
            domain={[0, 1]}
            tickFormatter={pctTick}
            format={pct}
            yWidth={40}
          />
        </div>
        <p className="mt-2 text-[11px] text-[var(--text-muted)]">
          재사용 배율과 수율은 함께 보세요 — 세션을 길게 끌면 배율은 오르지만 수율이 떨어집니다(견제 쌍).
          프리미엄 모델 비중은 무방향 지표입니다 — 높다고 나쁜 게 아니라 작업 난이도의 반영일 수 있습니다.
        </p>
      </section>

      <section>
        <h3 className="text-xs font-semibold text-[var(--text-muted)]">숙련</h3>
        <TrendPair
          title="세션 깊이 (턴/세션 · Claude Code 한정)"
          data={sessionDepth}
          tickFormatter={ratio1}
          format={ratio1}
          yWidth={36}
        />
        <p className="mt-1 text-[11px] text-[var(--text-muted)]">
          무방향 지표입니다 — 값이 높거나 낮다고 좋고 나쁨을 뜻하지 않습니다. 작업 스타일의 차이로 읽으세요.
        </p>

        <h4 className="mt-4 text-xs font-medium text-[var(--text-secondary)]">신모델 채택</h4>
        {modelAdoption.length ? (
          <table className="mt-1 w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-[var(--text-muted)]">
                <th className="pb-2 font-medium">모델</th>
                <th className="pb-2 font-medium">전역 최초 사용일</th>
                <th className="pb-2 text-right font-medium">팀 절반 도달까지</th>
              </tr>
            </thead>
            <tbody>
              {modelAdoption.map((m) => (
                <tr key={m.model} className="border-t border-black/5 dark:border-white/5">
                  <td className="py-2">{m.model}</td>
                  <td className="py-2 text-[var(--text-secondary)]">{m.globalFirst}</td>
                  <td className="py-2 text-right tabular-nums">
                    {m.leadDays != null ? `${m.leadDays}일` : "확산 중"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <EmptyState message="최근 신모델 등장 기록이 없습니다." />
        )}
      </section>

      {rampAvg && (
        <section>
          <h3 className="text-xs font-semibold text-[var(--text-muted)]">습관화 — 온보딩 램프업</h3>
          <p className="mt-1 text-xs text-[var(--text-muted)]">
            최근 12주 내 온보딩한 {cohortSize}명 평균 · 온보딩 후 주차별 활동일
          </p>
          <table className="mt-2 w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-[var(--text-muted)]">
                {rampAvg.map((_, i) => (
                  <th key={i} className="pb-2 text-center font-medium">
                    {i + 1}주차
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr className="border-t border-black/5 dark:border-white/5">
                {rampAvg.map((v, i) => (
                  <td key={i} className="py-2 text-center tabular-nums">
                    {v.toFixed(1)}일
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </section>
      )}

      <section>
        <h3 className="text-xs font-semibold text-[var(--text-muted)]">확장</h3>
        <p className="mt-1 text-xs text-[var(--text-muted)]">
          도구·모델 다양성 추세는 위 &ldquo;도입 확산&rdquo; 섹션을 참조하세요 (도입 매트릭스 · 주간 활성 사용자).
        </p>
      </section>

      <details className="rounded-lg bg-[var(--surface-2)] px-3 py-2 text-xs text-[var(--text-secondary)]">
        <summary className="cursor-pointer select-none font-medium">이 지표들이란?</summary>
        <div className="mt-2 space-y-2">
          <p>
            <strong className="text-[var(--text-primary)]">AI를 잘 사용한다</strong> = ① 일상
            습관으로 정착시키고(습관화) ② 같은 일을 자원 효율적으로 처리하며(효율) ③ 도구를 깊게
            다루고(숙련) ④ 활용 범위를 넓혀가는 것(확장) — 4축 모두 원값 표시, 점수화·합산·순위화는
            하지 않습니다.
          </p>
          <ul className="list-disc space-y-1 pl-4">
            <li>습관화 — 도입률 · 주간 활성 · 온보딩 램프업(온보딩 후 주차별 활동일수).</li>
            <li>
              효율 — 캐시 재사용 배율(cacheRead/cacheCreation) · 컨텍스트 수율(output/(input+cacheRead)) ·
              캐시 절감률(절감 가중치/(실소비+절감 가중치), % 표시) · 프리미엄 모델 비중(프리미엄 토큰/전체 토큰).
            </li>
            <li>
              숙련 — 세션 깊이(requests/sessions, Claude Code 한정) · 신모델 채택 리드타임(전역 최초
              사용일 → 팀 절반(ceil(인원/2)) 도달일까지의 일수).
            </li>
            <li>확장 — 도구 사용량 가중 엔트로피 · 사용 모델 종 수 (도입 매트릭스·주간 활성으로 시각화).</li>
          </ul>
          <p className="font-medium text-[var(--text-primary)]">한계</p>
          <ul className="list-disc space-y-1 pl-4">
            <li>&ldquo;창의성&rdquo; 자체는 측정할 수 없습니다 — 도구·모델 다양성과 신기능 채택 속도라는 범위의 넓이만 프록시로 봅니다.</li>
            <li>Copilot 등 토큰을 보고하지 않는 도구는 토큰 기반 지표에서 자동 제외됩니다(requests만 집계).</li>
            <li>세션 수는 Claude Code 업로더만 기록합니다 — 세션 깊이는 Claude Code 한정 지표입니다.</li>
            <li>캐시 적중률은 불필요한 재호출로도 부풀릴 수 있어 완전히 방어되지 않는 알려진 한계입니다.</li>
            <li>중앙값 차트의 음영(IQR)은 개인 특정 방지를 위해 활성 인원이 8명 이상인 주에만 표시됩니다.</li>
          </ul>
        </div>
      </details>
    </div>
  );
}
