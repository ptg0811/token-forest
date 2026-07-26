// KST (Asia/Seoul, fixed +9, no DST) bucketing for the uploader. MUST stay
// byte-for-byte equivalent to src/lib/date.ts kstDate on the server — the two
// packages can't share a module, so this is a deliberate mirror.
export function kstDate(ts) {
  return new Date(new Date(ts).getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}
export function kstHour(ts) {
  return new Date(new Date(ts).getTime() + 9 * 3600 * 1000).toISOString().slice(0, 13);
}
