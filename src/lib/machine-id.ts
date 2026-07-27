import { createHash } from "node:crypto";

// Device identity is pseudonymous: an opaque per-machine token, never a hostname.
// Same rule is shared by the ingest backstop and the one-time migration.

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Already opaque: a client-generated UUID, or a hashed "dev_…" token.
export function isOpaqueMachineId(v: string): boolean {
  return UUID_RE.test(v) || v.startsWith("dev_");
}

// Normalize any machineId to a non-identifying form. "" (pollers/legacy) stays "".
// Opaque values pass through (idempotent). A hostname is hashed to "dev_"+12 hex.
export function anonymizeMachineId(raw: string): string {
  if (raw === "" || isOpaqueMachineId(raw)) return raw;
  return "dev_" + createHash("sha256").update(raw).digest("hex").slice(0, 12);
}

// Map opaque machineIds to stable display labels "기기 1/2/3". "" → placeholder.
// Stable within a render by sorting the distinct non-empty ids.
export function deviceLabels(machineIds: string[]): Map<string, string> {
  const distinct = [...new Set(machineIds.filter((m) => m !== ""))].sort();
  const map = new Map<string, string>();
  distinct.forEach((id, i) => map.set(id, `기기 ${i + 1}`));
  if (machineIds.includes("")) map.set("", "(기기명 없음)");
  return map;
}
