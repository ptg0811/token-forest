import "@/scripts/env";
// Send (or preview) the Slack weekly report.
//
//   pnpm report            # send to SLACK_WEBHOOK_URL
//   pnpm report --dry-run  # print to stdout instead
import { closeDb } from "@/lib/db";
import { buildWeeklyReport, sendWeeklyReport } from "@/lib/slack";

async function main() {
  if (process.argv.includes("--dry-run")) {
    console.log(await buildWeeklyReport());
  } else {
    await sendWeeklyReport();
    console.log("weekly report sent");
  }
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
