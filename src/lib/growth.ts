import { addDays } from "./date";

// 하루치 활동 재료(툴별 합산은 호출측에서 끝냄).
export type GrowthDay = {
  date: string; // YYYY-MM-DD (UTC)
  tools: string[]; // 그날 활동한 distinct 툴
  input: number; // claude_code input 합
  cacheRead: number; // claude_code cacheRead 합
};

export type GrowthState = {
  gp: number;
  level: number; // 0 = 발아 전(휴면)
  stage: string; // dormant | germinated | seedling | sapling | young | mature | ancient
  stageEmoji: string;
  stageLabel: string;
  toNextLevel: number | null; // 다음 레벨까지 GP (고목 상한 도달 시 null)
  toNextStage: number | null;
  activeDays: number;
  streakDays: number;
  bestStreak: number;
  streakMultiplier: number;
  efficiencyBonusToday: number; // 최신 활동일 기준
  vitality: "lively" | "neutral" | "dozing";
  idleDays: number;
  milestones: string[];
  nextMilestone: { axis: string; label: string; remaining: number } | null;
};

// 단계: [key, emoji, label, minGP]. 마지막이 상한(무한).
const STAGES: Array<[string, string, string, number]> = [
  ["germinated", "🌱", "(씨)발아", 0],
  ["seedling", "🌿", "새싹", 50],
  ["sapling", "🪴", "묘목", 150],
  ["young", "🌳", "어린나무", 350],
  ["mature", "🌲", "큰나무", 700],
  ["ancient", "🌳✨", "고목", 1300],
];

// 연속일 → 배수 (내림차순 매칭).
const STREAK_TIERS: Array<[number, number]> = [
  [60, 2.5],
  [30, 2.0],
  [14, 1.8],
  [7, 1.5],
  [3, 1.2],
  [0, 1.0],
];

function streakMultiplier(days: number): number {
  for (const [min, mult] of STREAK_TIERS) if (days >= min) return mult;
  return 1.0;
}

// 효율 보너스(하루, 상한 +5): 캐시히트 round(율×3) + (distinct툴−1, 상한2).
// 스펙 표기는 floor지만 스펙 예시(캐시율≈0.9999 → +3)와 모순 — 예시 출력이
// 의도이므로 round로 계산한다(율 1.0 근처가 +3으로 떨어지지 않게).
export function efficiencyBonus(day: GrowthDay): number {
  const denom = day.input + day.cacheRead;
  const cacheRatio = denom > 0 ? day.cacheRead / denom : 0;
  const cacheBonus = Math.round(cacheRatio * 3); // 0..3
  const diversityBonus = Math.min(2, Math.max(0, day.tools.length - 1)); // 0..2
  return Math.min(5, cacheBonus + diversityBonus);
}

// 트레일링 7일에 미활동 1일까지 허용(굴러가는 창), 그 이상이면 스트릭 종료.
// cursor 기준 [cursor, cursor+6] 창의 미스가 2 이상이면 끊긴다.
export function streakEndingAt(
  active: Set<string>,
  end: string,
  earliest: string,
): number {
  let streak = 0;
  const misses: string[] = [];
  let cursor = end;
  while (cursor >= earliest) {
    if (active.has(cursor)) {
      streak++;
    } else {
      misses.push(cursor);
      const windowEnd = addDays(cursor, 6);
      const inWindow = misses.filter((m) => m >= cursor && m <= windowEnd).length;
      if (inWindow > 1) break;
    }
    cursor = addDays(cursor, -1);
  }
  return streak;
}

function stageFor(gp: number): [string, string, string, number, number | null] {
  let idx = 0;
  for (let i = 0; i < STAGES.length; i++) if (gp >= STAGES[i][3]) idx = i;
  const [key, emoji, label, min] = STAGES[idx];
  const nextMin = idx + 1 < STAGES.length ? STAGES[idx + 1][3] : null;
  return [key, emoji, label, min, nextMin];
}

// 마일스톤 축: [threshold, label] — count가 threshold 이상이면 언락.
const MILESTONES = {
  streak: [
    [3, "🌸"], [7, "🦋"], [14, "🐝"], [30, "🌈"], [60, "⭐"],
  ] as Array<[number, string]>,
  active_days: [
    [10, "💧"], [30, "🐦"], [100, "🦌"], [200, "🦉"], [365, "🏞️"],
  ] as Array<[number, string]>,
  efficiency: [
    [7, "☀️"], [30, "🌞"],
  ] as Array<[number, string]>,
  tools: [
    [2, "🍄"], [3, "🌾"], [4, "🌻"],
  ] as Array<[number, string]>,
};

// --- 표시용 카탈로그 (UI 전용 파생 — 엔진 로직과 단일 소스) ---

const AXIS_LABEL: Record<string, (n: number) => string> = {
  streak: (n) => `${n}일 연속`,
  active_days: (n) => `누적 활동 ${n}일`,
  efficiency: (n) => `효율 보너스 ${n}일`,
  tools: (n) => `도구 ${n}종`,
};

export const MILESTONE_CATALOG = Object.entries(MILESTONES).flatMap(([axis, tiers]) =>
  tiers.map(([threshold, emoji]) => ({
    key: `${axis}_${threshold}`,
    axis,
    emoji,
    label: AXIS_LABEL[axis](threshold),
    threshold,
  })),
);

export const STAGE_CATALOG = STAGES.map(([stage, emoji, label, minGp]) => ({
  stage,
  emoji,
  label,
  minGp,
}));

function collectMilestones(counts: Record<string, number>): {
  unlocked: string[];
  next: { axis: string; label: string; remaining: number } | null;
} {
  const unlocked: string[] = [];
  let next: { axis: string; label: string; remaining: number } | null = null;
  for (const axis of Object.keys(MILESTONES) as Array<keyof typeof MILESTONES>) {
    const count = counts[axis] ?? 0;
    for (const [th, label] of MILESTONES[axis]) {
      if (count >= th) unlocked.push(`${axis}_${th}`);
      else {
        const remaining = th - count;
        if (!next || remaining < next.remaining) next = { axis, label, remaining };
        break; // 축별 다음 미달 티어에서 멈춤
      }
    }
  }
  return { unlocked, next };
}

// today: 표시 기준 오늘(KST). teamEpoch: 팀 추적 시작일 YYYY-MM-DD — GP는 개인
// 온보딩일이 아니라 이 팀 공통 기준일부터 누적한다(등록 시점 무관 공정).
export function computeGrowth(
  days: GrowthDay[],
  teamEpoch: string,
  today: string,
): GrowthState {
  const DORMANT: GrowthState = {
    gp: 0, level: 0, stage: "dormant", stageEmoji: "🌰", stageLabel: "부화 전 씨앗",
    toNextLevel: 0, toNextStage: 0, activeDays: 0, streakDays: 0, bestStreak: 0,
    streakMultiplier: 1.0, efficiencyBonusToday: 0, vitality: "dozing", idleDays: 0,
    milestones: [], nextMilestone: null,
  };

  // 팀 epoch 이후 활동일만. 활동이 없으면(위저드 완료와 무관) 휴면.
  const eligible = days
    .filter((d) => d.date >= teamEpoch)
    .sort((a, b) => a.date.localeCompare(b.date));
  if (eligible.length === 0) return DORMANT;

  const active = new Set(eligible.map((d) => d.date));
  const earliest = eligible[0].date;

  // GP 누적: 각 활동일의 그 시점 스트릭 배수 × 10 + 효율보너스.
  let gp = 0;
  let highEffDays = 0;
  for (const d of eligible) {
    const s = streakEndingAt(active, d.date, earliest);
    const eff = efficiencyBonus(d);
    if (eff >= 3) highEffDays++;
    gp += Math.round(10 * streakMultiplier(s)) + eff;
  }

  const [stage, stageEmoji, stageLabel, , nextStageMin] = stageFor(gp);
  const level = Math.floor(gp / 50) + 1;
  const toNextLevel = 50 - (gp % 50);
  const toNextStage = nextStageMin === null ? null : nextStageMin - gp;

  const streakDays = streakEndingAt(active, today, earliest);
  const latest = eligible[eligible.length - 1].date;
  let bestStreak = 0;
  for (const d of eligible) bestStreak = Math.max(bestStreak, streakEndingAt(active, d.date, earliest));

  const distinctTools = new Set<string>();
  for (const d of eligible) for (const t of d.tools) distinctTools.add(t);

  const { unlocked, next } = collectMilestones({
    streak: bestStreak,
    active_days: eligible.length,
    efficiency: highEffDays,
    tools: distinctTools.size,
  });

  // 활력: 최신 활동일과 today 차이(일).
  const idleDays = Math.round(
    (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${latest}T00:00:00Z`)) / 86400000,
  );
  const vitality = idleDays <= 0 ? "lively" : idleDays >= 3 ? "dozing" : "neutral";

  return {
    gp, level, stage, stageEmoji, stageLabel,
    toNextLevel,
    toNextStage,
    activeDays: eligible.length,
    streakDays, bestStreak,
    streakMultiplier: streakMultiplier(streakDays),
    efficiencyBonusToday: efficiencyBonus(eligible[eligible.length - 1]),
    vitality, idleDays: Math.max(0, idleDays),
    milestones: unlocked, nextMilestone: next,
  };
}
