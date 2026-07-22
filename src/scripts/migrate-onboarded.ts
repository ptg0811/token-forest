import "@/scripts/env";
// One-off (run once after deploying the onboarding wizard):
//
//   MONGODB_URI=... pnpm exec tsx src/scripts/migrate-onboarded.ts
//
// Existing members finished onboarding before the wizard existed — stamp
// onboardedAt so they land on the checklist, not inside the wizard.
import { closeDb, connectDb } from "@/lib/db";
import { Member } from "@/lib/db/models";

async function main() {
  await connectDb();
  // { onboardedAt: null } matches both explicit nulls and docs that predate
  // the field entirely (missing key) — no $exists branch needed.
  const res = await Member.updateMany(
    { onboardedAt: null },
    { $set: { onboardedAt: new Date() } },
  );
  console.log(`backfilled onboardedAt on ${res.modifiedCount} member(s)`);
  // Legacy docs also lack the toolPrefs key, and .lean() reads skip schema
  // defaults — materialize [] so consumers can .includes()/.map() safely.
  // ($exists: false only matches legacy docs, so re-running stays a no-op.)
  const prefs = await Member.updateMany(
    { toolPrefs: { $exists: false } },
    { $set: { toolPrefs: [] } },
  );
  console.log(`backfilled toolPrefs=[] on ${prefs.modifiedCount} member(s)`);
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
