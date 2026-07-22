import "@/scripts/env";
// One-off (run once after deploying peakPct):
//
//   MONGODB_URI=... pnpm exec tsx src/scripts/migrate-limit-peak.ts
//
// Existing snapshots predate peakPct — seed it from the only value we have
// (the last-written utilizationPct). $exists:false keeps reruns a no-op.
import { closeDb, connectDb } from "@/lib/db";
import { LimitSnapshot } from "@/lib/db/models";

async function main() {
  await connectDb();
  const res = await LimitSnapshot.updateMany(
    { peakPct: { $exists: false } },
    [{ $set: { peakPct: "$utilizationPct" } }],
    // mongoose 9 rejects aggregation-pipeline updates unless opted in.
    { updatePipeline: true },
  );
  console.log(`backfilled peakPct on ${res.modifiedCount} snapshot(s)`);
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
