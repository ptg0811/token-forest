import { Types } from "mongoose";
import { Post, Reaction } from "../lib/db";

function assert(cond: boolean, msg: string) {
  if (!cond) { console.error("FAIL:", msg); process.exit(1); }
  console.log("ok:", msg);
}

const good = new Post({ source: "member", title: "t", authorMemberId: new Types.ObjectId(), activityAt: new Date(0) });
assert(good.validateSync() === undefined, "유효한 Post 통과");

const ingest = new Post({ source: "ingest", title: "t", authorMemberId: new Types.ObjectId(), activityAt: new Date(0) });
assert(ingest.validateSync() === undefined, "source ingest 통과");

const noAuthor = new Post({ source: "member", title: "t", activityAt: new Date(0) });
assert(noAuthor.validateSync()?.errors.authorMemberId !== undefined, "authorMemberId 필수");

const noTitle = new Post({ source: "member", authorMemberId: new Types.ObjectId(), activityAt: new Date(0) });
assert(noTitle.validateSync()?.errors.title !== undefined, "title 필수");

const badSource = new Post({ source: "notion", title: "t", authorMemberId: new Types.ObjectId(), activityAt: new Date(0) });
assert(badSource.validateSync()?.errors.source !== undefined, "source enum member|ingest 강제");

const r = new Reaction({ postId: new Types.ObjectId(), memberId: new Types.ObjectId(), emoji: "👍" });
assert(r.validateSync() === undefined, "유효한 Reaction 통과");

console.log("ALL PASS");
