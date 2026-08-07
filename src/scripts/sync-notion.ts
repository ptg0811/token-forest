import "@/scripts/env";
import { syncNotionPosts, notionEnabled } from "@/lib/notion";
import { closeDb } from "@/lib/db";

async function main() {
  if (!notionEnabled()) {
    console.log("NOTION_TOKEN / NOTION_POSTS_DB 미설정 — 스킵");
    process.exit(0);
  }
  const status = await syncNotionPosts();
  console.log(`notion 동기화: ${status}`);
  await closeDb();
  process.exit(status === "error" ? 1 : 0);
}
main();
