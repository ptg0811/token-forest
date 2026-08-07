import { Types } from "mongoose";
import { connectDb, Post, Reaction, Member } from "@/lib/db";
import { REACTION_EMOJIS } from "@/lib/knowhow";

export type FeedReaction = { emoji: string; count: number; mine: boolean };
export type FeedPost = {
  id: string;
  source: "member" | "ingest";
  title: string;
  bodyMarkdown: string;
  link: string | null;
  tags: string[];
  authorName: string;
  activityAt: string; // ISO
  isOwner: boolean;
  reactions: FeedReaction[];
};

// /knowhow 피드: activityAt desc 상한 100 + 작성자명 + 리액션 집계(+뷰어 여부).
export async function getKnowhowFeed(viewerMemberId: string | null): Promise<FeedPost[]> {
  await connectDb();
  const posts = await Post.find({}).sort({ activityAt: -1 }).limit(100).lean();
  const ids = posts.map((p) => p._id);

  const memberIds = posts.map((p) => p.authorMemberId).filter(Boolean) as Types.ObjectId[];
  const members = memberIds.length
    ? await Member.find({ _id: { $in: memberIds } }, { name: 1 }).lean()
    : [];
  const nameById = new Map(members.map((m) => [String(m._id), m.name]));

  const agg = await Reaction.aggregate<{ _id: { postId: unknown; emoji: string }; count: number; members: unknown[] }>([
    { $match: { postId: { $in: ids } } },
    { $group: { _id: { postId: "$postId", emoji: "$emoji" }, count: { $sum: 1 }, members: { $addToSet: "$memberId" } } },
  ]);
  const byPost = new Map<string, FeedReaction[]>();
  for (const r of agg) {
    const pid = String(r._id.postId);
    const mine = viewerMemberId ? r.members.some((m) => String(m) === viewerMemberId) : false;
    const list = byPost.get(pid) ?? [];
    list.push({ emoji: r._id.emoji, count: r.count, mine });
    byPost.set(pid, list);
  }
  const order = (rs: FeedReaction[]) =>
    [...rs].sort((a, b) => REACTION_EMOJIS.indexOf(a.emoji as never) - REACTION_EMOJIS.indexOf(b.emoji as never));

  return posts.map((p) => {
    const id = String(p._id);
    return {
      id,
      source: p.source,
      title: p.title,
      bodyMarkdown: p.bodyMarkdown,
      link: p.link ?? null,
      tags: p.tags ?? [],
      authorName: nameById.get(String(p.authorMemberId)) ?? "알 수 없음",
      activityAt: new Date(p.activityAt).toISOString(),
      isOwner: Boolean(viewerMemberId && String(p.authorMemberId) === viewerMemberId),
      reactions: order(byPost.get(id) ?? []),
    };
  });
}
