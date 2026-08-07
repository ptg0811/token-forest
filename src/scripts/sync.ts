import "@/scripts/env";
// Run server-side poller connectors.
//
//   pnpm sync                        # all connectors, incremental (with lookback)
//   pnpm sync --tool cursor          # one connector
//   pnpm sync --since 2026-07-01     # backfill from a date
import { allConnectors, connectorFor } from "@/connectors";
import { addDays, isoDaysAgo, todayUtc } from "@/lib/date";
import {
  autoClaimEmailIdentities,
  lastSyncedDate,
  recordSyncRun,
  upsertHourlyRows,
  upsertUsageRows,
} from "@/lib/usage";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

export async function runSync(opts: { tool?: string; since?: string } = {}) {
  const targets = opts.tool
    ? [connectorFor(opts.tool) ?? fail(`unknown tool: ${opts.tool}`)]
    : allConnectors();
  if (targets.length === 0) {
    console.log("no connectors registered");
    return;
  }
  for (const connector of targets) {
    const lookback = connector.lookbackDays ?? 3;
    // Resume from the stored cursor minus `lookback` days (re-fetching recent
    // days absorbs late-arriving data). Resuming from the cursor — not from
    // a fixed lookback window — means an outage longer than the lookback
    // still backfills instead of leaving a gap. A connector's FIRST run
    // backfills from TOKEN_FOREST_BACKFILL_START (team-wide tracking epoch,
    // e.g. 2026-06-01) or 30 days when unset.
    const cursor = await lastSyncedDate(connector.tool);
    const firstRunSince =
      process.env.TOKEN_FOREST_BACKFILL_START ?? isoDaysAgo(30);
    const since =
      opts.since ?? (cursor ? addDays(cursor, -lookback) : firstRunSince);
    try {
      const rows = await connector.fetchDaily(since);
      await upsertUsageRows(rows);
      // Hour-grained mirror, if this connector can attribute usage to an hour.
      // It feeds the additive usage_hourly collection only; the incremental
      // cursor stays driven by the daily rows below. A failure here must not
      // fail the run — the daily rows above already landed, and hourly data is
      // supplementary (heatmap only).
      let hourlyNote = "";
      if (connector.fetchHourly) {
        try {
          const hourlyRows = await connector.fetchHourly(since);
          const { upserted } = await upsertHourlyRows(hourlyRows);
          hourlyNote = `, ${hourlyRows.length} hourly rows (${upserted} written)`;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.warn(`${connector.tool}: hourly mirror failed (daily OK) — ${msg}`);
          hourlyNote = ", hourly mirror failed (see warning)";
        }
      }
      // Advance the cursor only to the newest day the connector actually
      // returned — central APIs lag, and stamping "today" would misreport
      // freshness and skip the lagged days on the next incremental run.
      const maxDate = rows.reduce(
        (acc, r) => (r.date > acc ? r.date : acc),
        "",
      );
      const synced = maxDate || cursor || todayUtc();
      await recordSyncRun(connector.tool, "ok", { lastSyncedDate: synced });
      console.log(
        `${connector.tool}: upserted ${rows.length} rows${hourlyNote} (since ${since}, through ${synced})`,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await recordSyncRun(connector.tool, "error", { message });
      console.error(`${connector.tool}: FAILED — ${message}`);
      process.exitCode = 1;
    }
  }
  // New rows may belong to a registered email that had no usage before.
  try {
    const claimed = await autoClaimEmailIdentities();
    if (claimed > 0) console.log(`auto-claimed ${claimed} email-matching identit(y/ies)`);
  } catch (err) {
    console.warn("auto-claim failed (sync itself OK):", err);
  }
}

// Single-flight guard shared by the in-process cron and POST /api/sync (both
// live in the same server process). A second caller while a sync is running
// gets {started:false} instead of a concurrent run hammering the vendor APIs.
let syncing: Promise<void> | null = null;

export function isSyncing(): boolean {
  return syncing !== null;
}

export async function runSyncExclusive(): Promise<{ started: boolean }> {
  if (syncing) return { started: false };
  syncing = runSync().finally(() => {
    syncing = null;
  });
  await syncing;
  return { started: true };
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

// Only run when invoked directly (pnpm sync), not when imported by the cron worker.
if (process.argv[1]?.endsWith("sync.ts")) {
  import("@/lib/db").then(({ closeDb }) =>
    runSync({ tool: arg("tool"), since: arg("since") }).finally(() => closeDb()),
  );
}
