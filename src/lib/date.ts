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
