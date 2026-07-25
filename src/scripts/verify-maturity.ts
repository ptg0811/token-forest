import {
  STAGE_LABELS, axisStage, overallMaturity, type MaturityInput,
} from "../lib/maturity";

function assert(cond: boolean, msg: string) {
  if (!cond) { console.error("FAIL:", msg); process.exit(1); }
  console.log("ok:", msg);
}

// 라벨 5개
assert(STAGE_LABELS.length === 5, "단계 5개");
assert(STAGE_LABELS[0] === "인식" && STAGE_LABELS[4] === "전환", "라벨 양끝");

// 축별 경계 — 습관(활성률 %)
assert(axisStage("habit", 20) === 1, "활성 20% → 인식");
assert(axisStage("habit", 30) === 2, "활성 30% → 도입");
assert(axisStage("habit", 60) === 3, "활성 60% → 정착");
assert(axisStage("habit", 85) === 4, "활성 85% → 체화");
assert(axisStage("habit", 100) === 5, "활성 100% → 전환");
// 효율(적중률 %)
assert(axisStage("efficiency", 39) === 1, "적중 39% → 인식");
assert(axisStage("efficiency", 60) === 3, "적중 60% → 정착");
assert(axisStage("efficiency", 88) === 5, "적중 88% → 전환");
// 숙련(세션 깊이)
assert(axisStage("skill", 2.9) === 1, "깊이 2.9 → 인식");
assert(axisStage("skill", 6) === 3, "깊이 6 → 정착");
assert(axisStage("skill", 12) === 4, "깊이 12 → 체화");
// 확장(도구 종 수 프록시 — 팀이 쓰는 구별 도구 수)
assert(axisStage("breadth", 1) === 1, "1도구 → 인식");
assert(axisStage("breadth", 2) === 2, "2도구 → 도입");
assert(axisStage("breadth", 3) === 3, "3도구 → 정착");
assert(axisStage("breadth", 4) === 4, "4도구 → 체화");

// null 입력 → 1(가장 보수적)로 처리
assert(axisStage("efficiency", null) === 1, "null → 인식");

// 종합 = 최소 축 + 병목 식별
const input: MaturityInput = { habit: 85, efficiency: 60, skill: 12, breadth: 4 };
const r = overallMaturity(input);
assert(r.overall === 3, `종합=최소(효율 정착) → 3 (got ${r.overall})`);
assert(r.bottleneck === "efficiency", `병목=효율 (got ${r.bottleneck})`);
assert(r.axes.habit === 4 && r.axes.skill === 4 && r.axes.breadth === 4, "타 축 4");
assert(r.nextCondition.length > 0, "다음 조건 텍스트 비어있지 않음");
assert(r.overall < 5, "5단계 미만이면 다음 조건 있음");

// 이미 최상: 다음 조건 = 없음 표시
const top = overallMaturity({ habit: 100, efficiency: 90, skill: 15, breadth: 5 });
assert(top.overall === 5, "전원 최상 → 5");

// I2 — 신모델 리드타임이 숙련 축을 게이트한다.
// 깊이는 높지만(15 → 5단계) 신모델 채택 관측이 없으면(null) 3단계로 제한.
const noNewModel = overallMaturity({
  habit: 100, efficiency: 90, skill: 15, breadth: 5, newModelLeadDays: null,
});
assert(noNewModel.axes.skill === 3, `깊이 높음+신모델 관측 없음 → 숙련 3단계 제한 (got ${noNewModel.axes.skill})`);
assert(noNewModel.overall === 3, `종합도 숙련에 눌려 3 (got ${noNewModel.overall})`);
assert(noNewModel.bottleneck === "skill", `병목=숙련 (got ${noNewModel.bottleneck})`);

// 깊이 높음 + 리드타임 5일(<7일) → 5단계까지 허용
const fastNewModel = overallMaturity({
  habit: 100, efficiency: 90, skill: 15, breadth: 5, newModelLeadDays: 5,
});
assert(fastNewModel.axes.skill === 5, `깊이 높음+리드 5일 → 숙련 5단계 (got ${fastNewModel.axes.skill})`);
assert(fastNewModel.overall === 5, `종합 5 (got ${fastNewModel.overall})`);

// 깊이 높음 + 리드타임 10일(<14, >=7) → 4단계까지만
const midNewModel = overallMaturity({
  habit: 100, efficiency: 90, skill: 15, breadth: 5, newModelLeadDays: 10,
});
assert(midNewModel.axes.skill === 4, `깊이 높음+리드 10일 → 숙련 4단계 제한 (got ${midNewModel.axes.skill})`);
assert(midNewModel.nextCondition.includes("리드타임"), "리드타임 게이트 병목이면 안내 문구에 리드타임 언급");

// newModelLeadDays 생략(필드 자체 없음, 하위 호환) — 게이트 미적용, 기존 동작 그대로.
// 명시적 null(신호는 배선됐지만 관측된 신모델 채택이 없음)만 3단계로 캡한다.
assert(axisStage("skill", 15) === 5, "axisStage 단독 호출은 리드타임 게이트 없이 그대로 (got backward-compat)");
const omitted = overallMaturity({ habit: 100, efficiency: 90, skill: 15, breadth: 5 });
assert(omitted.axes.skill === 5, "newModelLeadDays 생략(하위 호환) → 게이트 미적용, 깊이 그대로 5단계");

console.log("ALL PASS");
