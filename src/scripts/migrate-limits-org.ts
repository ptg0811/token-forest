import "@/scripts/env";
// One-off migration (run once after deploying the organization dimension):
//
//   pnpm exec tsx src/scripts/migrate-limits-org.ts
//
// limit_snapshots gained an `organization` field so one account's several
// plans (personal Max + Team seat) stay distinct. Backfill "" on old docs so
// they match the new upsert filter, then rebuild the unique index.
import { closeDb, connectDb } from "@/lib/db";
import { LimitSnapshot } from "@/lib/db/models";

async function main() {
  await connectDb();
  const res = await LimitSnapshot.updateMany(
    { organization: { $exists: false } },
    { $set: { organization: "" } },
  );
  console.log(`backfilled organization="" on ${res.modifiedCount} docs`);
  const dropped = await LimitSnapshot.syncIndexes();
  console.log(`syncIndexes done (dropped: ${JSON.stringify(dropped)})`);
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
