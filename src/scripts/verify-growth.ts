import { computeGrowth, efficiencyBonus, streakEndingAt } from "../lib/growth";
import type { GrowthDay } from "../lib/growth";

function assert(cond: boolean, msg: string) {
  if (!cond) { console.error("FAIL:", msg); process.exit(1); }
  console.log("ok:", msg);
}

// Caleb 실데이터 재현: 온보딩 07-18, 활동 07-18/19/20 (claude_code+openai, 캐시 지배적).
const days: GrowthDay[] = [
  { date: "2026-07-18", tools: ["claude_code", "openai"], input: 72046, cacheRead: 841908013 },
  { date: "2026-07-19", tools: ["claude_code", "openai"], input: 43580, cacheRead: 894918067 },
  { date: "2026-07-20", tools: ["claude_code", "openai"], input: 23724, cacheRead: 360484718 },
];

// 효율보너스: 캐시율≈1(+3) + 2툴(+1) = +4.
assert(efficiencyBonus(days[0]) === 4, "효율보너스 07-18 = 4");

// GP: (10×1.0+4)+(10×1.0+4)+(round(10×1.2)+4)=14+14+16 = 44.
const g = computeGrowth(days, "2026-07-18", "2026-07-23");
assert(g.gp === 44, `GP=44 (got ${g.gp})`);
assert(g.level === 1, `level=1 (got ${g.level})`);
assert(g.stage === "germinated" && g.stageLabel === "(씨)발아", "stage=(씨)발아");
assert(g.toNextStage === 6, `새싹까지 6 (got ${g.toNextStage})`);
assert(g.bestStreak === 3, `bestStreak=3 (got ${g.bestStreak})`);
assert(g.streakDays === 0, `현재 스트릭=0, 3일 유휴 (got ${g.streakDays})`);
assert(g.vitality === "dozing" && g.idleDays === 3, "졸음 · 유휴 3일");
assert(g.milestones.includes("streak_3") && g.milestones.includes("tools_2"), "언락 🌸·🍄");

// 팀 epoch가 모든 활동일보다 이후 → eligible 없음 → 휴면.
const d0 = computeGrowth(days, "2027-01-01", "2027-01-01");
assert(d0.level === 0 && d0.stage === "dormant" && d0.stageEmoji === "🌰", "Lv0 휴면");

// 온보딩 후 활동 없음 → 휴면.
const d1 = computeGrowth([], "2026-07-18", "2026-07-23");
assert(d1.level === 0 && d1.stage === "dormant", "활동 0 → 휴면");

// 단일 휴식일은 스트릭 유지, 2연속은 종료.
const gap = new Set(["2026-07-10", "2026-07-11", "2026-07-13"]); // 12 쉼
assert(streakEndingAt(gap, "2026-07-13", "2026-07-10") === 3, "단일 갭 브릿지 → 3");
const gap2 = new Set(["2026-07-10", "2026-07-13"]); // 11,12 연속 쉼
assert(streakEndingAt(gap2, "2026-07-13", "2026-07-10") === 1, "2연속 갭 → 1");

// 코덱스-only 활동일도 active day·툴 다양성에 반영된다(소비자측: computeGrowth는
// 툴로 필터하지 않는다 — getGrowthDays가 codex 행을 넘겨주면 그대로 성장에 반영).
const codexDays: GrowthDay[] = [
  { date: "2026-07-18", tools: ["claude_code"], input: 1000, cacheRead: 9000 },
  { date: "2026-07-19", tools: ["codex"], input: 500, cacheRead: 4500 },
];
const cg = computeGrowth(codexDays, "2026-07-18", "2026-07-19");
assert(cg.activeDays === 2, `codex-only 날 포함 활동 2일 (got ${cg.activeDays})`);
assert(
  efficiencyBonus(codexDays[1]) >= 3,
  `codex 캐시율 반영 효율보너스 ≥3 (got ${efficiencyBonus(codexDays[1])})`,
);

console.log("ALL PASS");
