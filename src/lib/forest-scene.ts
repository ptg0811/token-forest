// ForestScene 순수 로직 — 렌더와 분리해 픽스처로 검증한다.
// 배치는 멤버 id 해시만 사용: GP·레벨은 입력조차 받지 않아 등수 신호가 구조적으로 불가능.

export type TimeBand = "dawn" | "day" | "dusk" | "night";

export function timeBand(kstHour: number): TimeBand {
  if (kstHour >= 5 && kstHour < 8) return "dawn";
  if (kstHour >= 8 && kstHour < 17) return "day";
  if (kstHour >= 17 && kstHour < 20) return "dusk";
  return "night";
}

// FNV-1a 32bit — 렌더 결정성 (Math.random 금지 대체).
export function hash32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

export type TreePos = {
  id: string;
  xPct: number; // 좌우 5~95%
  swayVariant: 0 | 1 | 2; // fs-sway-a/b/c
  swayDur: number; // 3.6~5.9s
  swayDelay: number; // 0~-3.9s (위상 분산)
  gustDelay: number; // 0~-15s
};

export function treeLayout(ids: string[]): TreePos[] {
  const sorted = [...ids].sort((a, b) => hash32(a) - hash32(b));
  const n = Math.max(sorted.length, 1);
  const slotW = 84 / n; // 8%~92% 균등 슬롯
  return sorted.map((id, i) => {
    const h = hash32(id);
    const base = 8 + slotW * i + slotW / 2;
    const jitter = ((h % 1000) / 1000 - 0.5) * slotW * 0.4;
    return {
      id,
      xPct: Math.round((base + jitter) * 10) / 10,
      swayVariant: (h % 3) as 0 | 1 | 2,
      swayDur: 3.6 + ((h >>> 8) % 24) / 10,
      swayDelay: -(((h >>> 16) % 40) / 10),
      gustDelay: -((h >>> 24) % 16),
    };
  });
}

const DAY_ANIMALS = ["🐿️", "🐇"] as const;
const NIGHT_ANIMALS = ["🦌", "🦉"] as const;

export function pickAnimal(seed: number, band: TimeBand): string {
  const pool = band === "night" ? NIGHT_ANIMALS : DAY_ANIMALS;
  return pool[seed % pool.length];
}
