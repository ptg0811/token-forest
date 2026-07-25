import {
  getScorecardSums,
  getScorecardWeeklySums,
  getCacheSavings,
  getModelAdoption,
  getOnboardingActivity,
} from "../lib/queries";
import { isoDaysAgo, todayUtc } from "../lib/date";
import { closeDb } from "../lib/db";

function assert(cond: boolean, msg: string) {
  if (!cond) { console.error("FAIL:", msg); process.exit(1); }
  console.log("ok:", msg);
}

async function main() {
  const range = { from: isoDaysAgo(28), to: todayUtc() };

  const sums = await getScorecardSums(range);
  assert(Array.isArray(sums), "getScorecardSums → array");
  console.log(`getScorecardSums: ${sums.length} rows`);
  for (const r of sums) {
    assert(typeof r.memberId === "string", "sums row memberId is string");
    assert(typeof r.tool === "string", "sums row tool is string");
    assert(Array.isArray(r.models), "sums row models is array");
    for (const f of ["input", "output", "cacheRead", "cacheCreation", "requests", "sessions"] as const) {
      assert(typeof r.sums[f] === "number", `sums row sums.${f} is number`);
    }
  }

  const weekly = await getScorecardWeeklySums(range);
  assert(Array.isArray(weekly), "getScorecardWeeklySums → array");
  console.log(`getScorecardWeeklySums: ${weekly.length} rows`);
  for (const r of weekly) {
    assert(typeof r.week === "string", "weekly row week is string");
    assert(typeof r.memberId === "string", "weekly row memberId is string");
    assert(typeof r.tool === "string", "weekly row tool is string");
    assert(Array.isArray(r.models), "weekly row models is array");
    for (const f of ["input", "output", "cacheRead", "cacheCreation", "requests", "sessions"] as const) {
      assert(typeof r.sums[f] === "number", `weekly row sums.${f} is number`);
    }
  }

  const savings = await getCacheSavings(range);
  assert(typeof savings.saved === "number", "getCacheSavings.saved is number");
  assert(typeof savings.spent === "number", "getCacheSavings.spent is number");
  console.log(`getCacheSavings: saved=${savings.saved.toFixed(2)} spent=${savings.spent.toFixed(2)}`);

  const adoption = await getModelAdoption(120);
  assert(Array.isArray(adoption), "getModelAdoption → array");
  console.log(`getModelAdoption: ${adoption.length} rows`);
  for (const r of adoption) {
    assert(typeof r.model === "string", "adoption row model is string");
    assert(typeof r.globalFirst === "string", "adoption row globalFirst is string");
    assert(Array.isArray(r.memberFirstDates), "adoption row memberFirstDates is array");
  }

  const ramp = await getOnboardingActivity();
  assert(Array.isArray(ramp), "getOnboardingActivity → array");
  console.log(`getOnboardingActivity: ${ramp.length} rows`);
  for (const r of ramp) {
    assert(typeof r.memberId === "string", "ramp row memberId is string");
    assert(typeof r.name === "string", "ramp row name is string");
    assert(typeof r.onboardedAt === "string", "ramp row onboardedAt is string");
    assert(Array.isArray(r.activeDates), "ramp row activeDates is array");
  }

  console.log("ALL PASS");
  await closeDb();
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
