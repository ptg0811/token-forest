import "@/scripts/env";
// One-off migration (run once after deploying v1.2):
//
//   pnpm exec tsx src/scripts/migrate-limits.ts
//
// v1.1 stored plan-limit snapshots as claude_limits rows inside usage_daily
// (kept out of totals via EXCLUDED_TOOLS). v1.2 moves them to their own
// limit_snapshots collection (per member + Claude account). This copies any
// existing claude_limits rows over — using the member email as the account
// email, since v1.1 had no per-account identity — then deletes the originals.
import { closeDb, connectDb } from "@/lib/db";
import { LimitSnapshot, Member, UsageDaily } from "@/lib/db/models";

async function main() {
  await connectDb();
  const rows = await UsageDaily.find({ tool: "claude_limits" }).lean();
  console.log(`found ${rows.length} legacy claude_limits row(s)`);

  const emailById = new Map(
    (await Member.find().lean()).map((m) => [String(m._id), m.email]),
  );

  let migrated = 0;
  for (const r of rows) {
    if (!r.memberId) continue; // unlinked meta rows are not worth carrying
    const accountEmail = emailById.get(String(r.memberId)) ?? r.externalId;
    await LimitSnapshot.updateOne(
      {
        date: r.date,
        memberId: r.memberId,
        accountEmail,
        window: r.model,
      },
      {
        $set: {
          utilizationPct: r.requests ?? 0,
          subscriptionType: null,
          rateLimitTier: null,
          resetsAt: null,
          raw: r.raw ?? null,
        },
      },
      { upsert: true },
    );
    migrated++;
  }
  const del = await UsageDaily.deleteMany({ tool: "claude_limits" });
  console.log(
    `migrated ${migrated} snapshot(s); removed ${del.deletedCount} legacy row(s) from usage_daily`,
  );
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
