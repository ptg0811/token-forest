// 팀 AI 사용 성숙도 — 업계 5단계 채택 모델 차용(인식→도입→정착→체화→전환).
// 종합 = 4축 중 최소("가장 약한 기둥"). 단일 점수 아님 — 병목 표시.
// 문턱은 v1 보정 상수(소표본 — 실데이터 관측 후 튜닝). 스펙:
// docs/superpowers/specs/2026-07-26-maturity-and-tooltips-design.md

export const STAGE_LABELS = ["인식", "도입", "정착", "체화", "전환"] as const;
export type Stage = 1 | 2 | 3 | 4 | 5;
export type Axis = "habit" | "efficiency" | "skill" | "breadth";

// 각 축 하한 문턱: [2단계 하한, 3단계, 4단계, 5단계]. 값 < 첫 하한이면 1단계.
const THRESHOLDS: Record<Axis, [number, number, number, number]> = {
  habit: [30, 60, 85, 100], // 활성률 %
  efficiency: [40, 60, 75, 88], // 캐시 적중률 % (중앙값)
  skill: [3, 6, 12, 15], // 세션 깊이 (중앙값)
  breadth: [2, 3, 4, 5], // 구별 도구 수
};

export function axisStage(axis: Axis, value: number | null): Stage {
  if (value == null) return 1;
  const t = THRESHOLDS[axis];
  let stage = 1;
  for (let i = 0; i < t.length; i++) if (value >= t[i]) stage = i + 2;
  return stage as Stage;
}

export type MaturityInput = {
  habit: number | null;
  efficiency: number | null;
  skill: number | null;
  breadth: number | null;
};

// 다음 단계로 가려면 이 축을 얼마까지 — 병목 축 기준 조건 텍스트.
const AXIS_KO: Record<Axis, string> = {
  habit: "활성률", efficiency: "캐시 적중률 중앙값", skill: "세션 깊이 중앙값", breadth: "사용 도구 수",
};
const AXIS_UNIT: Record<Axis, string> = { habit: "%", efficiency: "%", skill: "", breadth: "종" };

export type MaturityResult = {
  overall: Stage;
  bottleneck: Axis;
  axes: Record<Axis, Stage>;
  nextCondition: string;
};

export function overallMaturity(input: MaturityInput): MaturityResult {
  const axes: Record<Axis, Stage> = {
    habit: axisStage("habit", input.habit),
    efficiency: axisStage("efficiency", input.efficiency),
    skill: axisStage("skill", input.skill),
    breadth: axisStage("breadth", input.breadth),
  };
  const entries = Object.entries(axes) as Array<[Axis, Stage]>;
  const overall = Math.min(...entries.map(([, s]) => s)) as Stage;
  // 병목 = 최소 단계 축 중 첫째(습관>효율>숙련>확장 순으로 안정적)
  const order: Axis[] = ["habit", "efficiency", "skill", "breadth"];
  const bottleneck = order.find((a) => axes[a] === overall)!;

  let nextCondition: string;
  if (overall === 5) {
    nextCondition = "최고 단계입니다 — 현 수준을 유지하세요.";
  } else {
    const target = THRESHOLDS[bottleneck][overall - 1]; // overall단계→다음 하한
    const cur = input[bottleneck];
    const curTxt = cur == null ? "데이터 없음" : `현재 ${Math.round(cur)}${AXIS_UNIT[bottleneck]}`;
    nextCondition = `${STAGE_LABELS[overall]} 단계로 — ${AXIS_KO[bottleneck]} ${target}${AXIS_UNIT[bottleneck]} 도달 (${curTxt})`;
  }
  return { overall, bottleneck, axes, nextCondition };
}
