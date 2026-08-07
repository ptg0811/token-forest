import { Types } from "mongoose";
import { Post, Reaction } from "../lib/db";

function assert(cond: boolean, msg: string) {
  if (!cond) { console.error("FAIL:", msg); process.exit(1); }
  console.log("ok:", msg);
}

const good = new Post({ source: "member", title: "t", activityAt: new Date(0) });
assert(good.validateSync() === undefined, "유효한 member Post 통과");

const noSource = new Post({ title: "t", activityAt: new Date(0) });
assert(noSource.validateSync()?.errors.source !== undefined, "source 필수");

const noTitle = new Post({ source: "member", activityAt: new Date(0) });
assert(noTitle.validateSync()?.errors.title !== undefined, "title 필수");

const badSource = new Post({ source: "x", title: "t", activityAt: new Date(0) });
assert(badSource.validateSync()?.errors.source !== undefined, "source enum 강제");

const r = new Reaction({ postId: new Types.ObjectId(), memberId: new Types.ObjectId(), emoji: "👍" });
assert(r.validateSync() === undefined, "유효한 Reaction 통과");
const rBad = new Reaction({ memberId: new Types.ObjectId(), emoji: "👍" });
assert(rBad.validateSync()?.errors.postId !== undefined, "postId 필수");

console.log("ALL PASS");
