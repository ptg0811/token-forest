const DAY_MS = 24 * 60 * 60 * 1000;

export function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * DAY_MS).toISOString().slice(0, 10);
}

export function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS)
    .toISOString()
    .slice(0, 10);
}

export function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

// KST (Asia/Seoul, fixed +9, no DST) calendar date for an instant (epoch ms).
// Shifting the instant by +9h then reading the UTC date yields the KST date.
export function kstDate(ms: number): string {
  return new Date(ms + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

// Today's date in KST — the display/growth day boundary for a Korean team.
export function todayKst(): string {
  return kstDate(Date.now());
}

// Team-wide tracking epoch: the shared anchor for growth GP (everyone measured
// from the same day, not their personal onboarding). Mirrors sync.ts's
// first-run backfill floor.
export function teamEpoch(): string {
  return process.env.TOKEN_FOREST_BACKFILL_START ?? isoDaysAgo(30);
}
