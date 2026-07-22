import "@/scripts/env";
// One-off migration for the machineId dimension (run once after deploying):
//
//   pnpm exec tsx src/scripts/migrate-machine-id.ts
//
// 1. Docs written before the field existed don't match {machineId: ""} upsert
//    filters (missing ≠ ""), which would create duplicates — backfill "".
// 2. syncIndexes drops the old (date,tool,model,externalId) unique index and
//    creates the new one that includes machineId.
import { closeDb, connectDb } from "@/lib/db";
import { UsageDaily } from "@/lib/db/models";

async function main() {
  await connectDb();
  const res = await UsageDaily.updateMany(
    { machineId: { $exists: false } },
    { $set: { machineId: "" } },
  );
  console.log(`backfilled machineId="" on ${res.modifiedCount} docs`);
  const dropped = await UsageDaily.syncIndexes();
  console.log(`syncIndexes done (dropped: ${JSON.stringify(dropped)})`);
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
