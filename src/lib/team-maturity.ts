// AI 사용 성숙도 배너 입력 조립 — /team과 홈(/) 양쪽이 공유하는 단일 계산처.
// 순수 조립 로직(maturityFromParts)과 자립 쿼리 실행(getTeamMaturity)을 분리해,
// /team은 이미 로드한 쿼리 결과를 재사용하고 홈은 독립적으로 조회할 수 있게 한다.

import {
  getAllMembers,
  getModelAdoption,
  getScorecardWeeklySums,
  getTeamAdoptionRate,
  getToolSummary,
  type DateRange,
  type ScorecardWeeklyRow,
} from "@/lib/queries";
import { overallMaturity, type MaturityResult } from "@/lib/maturity";
import {
  adoptionLeadDays,
  sessionDepth as sessionDepthMetric,
  weeklyTeamSeries,
  type WeeklySeriesPoint,
} from "@/lib/scorecard";

// 최신 주 값 추출 헬퍼 (시리즈 마지막 point의 중앙값)
function latestMedian(series: WeeklySeriesPoint[]): number | null {
  return series.length ? series[series.length - 1].median : null;
}

export type MaturityParts = {
  adoptionRate: { activePct: number }[];
  scoreWeekly: ScorecardWeeklyRow[];
  toolSummary: { tool: string; tokens: number; requests: number }[];
  modelAdoption: { leadDays: number | null }[];
  teamSize: number;
};

// 원재료(이미 계산된 조각들)만 받아 성숙도를 계산하는 순수 함수 — /team의 원래
// 인라인 로직을 그대로 옮긴 것. 쿼리 호출은 하지 않는다.
export function maturityFromParts(parts: MaturityParts): MaturityResult {
  const { adoptionRate, scoreWeekly, toolSummary, modelAdoption } = parts;

  const claudeOnlyWeekly = scoreWeekly.filter((r) => r.tool === "claude_code");
  const cacheHitSeries = weeklyTeamSeries(scoreWeekly, (s) =>
    s.input + s.cacheRead > 0 ? s.cacheRead / (s.input + s.cacheRead) : null,
  );
  const sessionDepthSeries = weeklyTeamSeries(claudeOnlyWeekly, sessionDepthMetric);

  const latestAdoption = adoptionRate.length
    ? adoptionRate[adoptionRate.length - 1].activePct
    : null;
  const cacheHitMedianPct =
    latestMedian(cacheHitSeries) != null ? latestMedian(cacheHitSeries)! * 100 : null;

  // 실제 활동이 있는 도구만 breadth로 센다 (정적 카탈로그가 아니라 관측된 사용).
  const toolCount = toolSummary.filter((t) => t.tokens > 0 || t.requests > 0).length;

  // 신모델 채택 리드타임 — 관측된 것 중 최단(가장 빠른 흡수). 미도달(null)은 제외.
  const observedLeadDays = modelAdoption
    .map((m) => m.leadDays)
    .filter((d): d is number => d != null);
  const newModelLeadDays = observedLeadDays.length ? Math.min(...observedLeadDays) : null;

  return overallMaturity({
    habit: latestAdoption,
    efficiency: cacheHitMedianPct,
    skill: latestMedian(sessionDepthSeries),
    breadth: toolCount,
    newModelLeadDays,
  });
}

// 독립 호출용 — 홈(/)처럼 /team의 다른 쿼리들을 로드하지 않는 화면에서 배너 하나만
// 필요할 때 쓴다. 필요한 쿼리만 골라 실행 후 maturityFromParts에 위임한다.
export async function getTeamMaturity(range: DateRange): Promise<MaturityResult> {
  const [adoptionRate, scoreWeekly, toolSummary, adoption, allMembers] = await Promise.all([
    getTeamAdoptionRate(range),
    getScorecardWeeklySums(range),
    getToolSummary(range),
    getModelAdoption(120),
    getAllMembers(),
  ]);

  const teamSize = allMembers.length;
  const modelAdoption = adoption.map((a) => ({
    leadDays: adoptionLeadDays(a.memberFirstDates, teamSize),
  }));

  return maturityFromParts({ adoptionRate, scoreWeekly, toolSummary, modelAdoption, teamSize });
}
