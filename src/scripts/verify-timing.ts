import { kstDate, teamEpoch } from "@/lib/date";

let pass = 0;
let fail = 0;
function check(label: string, cond: boolean) {
  if (cond) pass++;
  else { fail++; console.error(`FAIL: ${label}`); }
}

// kstDate: instant + 9h, then UTC calendar date = KST calendar date
check("UTC 23:00 -> next KST day", kstDate(Date.parse("2026-07-26T23:00:00Z")) === "2026-07-27");
check("UTC 15:00 = KST midnight -> new day", kstDate(Date.parse("2026-07-26T15:00:00Z")) === "2026-07-27");
check("UTC 14:59:59 -> still prev KST day", kstDate(Date.parse("2026-07-26T14:59:59Z")) === "2026-07-26");
check("UTC 07-27T14:00 -> same KST day", kstDate(Date.parse("2026-07-27T14:00:00Z")) === "2026-07-27");

// teamEpoch: env when set, else 30-days-ago fallback (mirrors sync.ts)
const saved = process.env.TOKEN_FOREST_BACKFILL_START;
process.env.TOKEN_FOREST_BACKFILL_START = "2026-06-01";
check("teamEpoch reads env", teamEpoch() === "2026-06-01");
delete process.env.TOKEN_FOREST_BACKFILL_START;
check("teamEpoch fallback is a YYYY-MM-DD", /^\d{4}-\d{2}-\d{2}$/.test(teamEpoch()));
if (saved !== undefined) process.env.TOKEN_FOREST_BACKFILL_START = saved;

console.log(`PASS=${pass} FAIL=${fail}`);
process.exit(fail === 0 ? 0 : 1);
