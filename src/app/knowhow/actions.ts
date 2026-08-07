"use server";

import { Types } from "mongoose";
import { revalidatePath } from "next/cache";
import { connectDb, Post, Reaction } from "@/lib/db";
import { requireMember } from "@/lib/auth";
import { validatePostInput, isValidEmoji, type PostInput } from "@/lib/knowhow";

export async function createPost(input: PostInput): Promise<void> {
  const member = await requireMember();
  const v = validatePostInput(input);
  if (!v.ok) throw new Error(v.error);
  await connectDb();
  const now = new Date();
  await Post.create({
    source: "member",
    title: v.value.title,
    bodyMarkdown: v.value.bodyMarkdown,
    link: v.value.link,
    tags: v.value.tags,
    authorMemberId: new Types.ObjectId(member.id),
    activityAt: now,
  });
  revalidatePath("/knowhow");
}

export async function updatePost(postId: string, input: PostInput): Promise<void> {
  const member = await requireMember();
  const v = validatePostInput(input);
  if (!v.ok) throw new Error(v.error);
  await connectDb();
  const res = await Post.updateOne(
    { _id: new Types.ObjectId(postId), authorMemberId: new Types.ObjectId(member.id) },
    { $set: { title: v.value.title, bodyMarkdown: v.value.bodyMarkdown, link: v.value.link, tags: v.value.tags, activityAt: new Date() } },
  );
  if (res.matchedCount === 0) throw new Error("권한이 없거나 글을 찾을 수 없습니다.");
  revalidatePath("/knowhow");
}

export async function deletePost(postId: string): Promise<void> {
  const member = await requireMember();
  await connectDb();
  const post = await Post.findOne({
    _id: new Types.ObjectId(postId),
    authorMemberId: new Types.ObjectId(member.id),
  });
  if (!post) throw new Error("권한이 없거나 글을 찾을 수 없습니다.");
  await Reaction.deleteMany({ postId: post._id });
  await post.deleteOne();
  revalidatePath("/knowhow");
}

export async function toggleReaction(postId: string, emoji: string): Promise<void> {
  const member = await requireMember();
  if (!isValidEmoji(emoji)) throw new Error("허용되지 않은 이모지입니다.");
  await connectDb();
  const key = { postId: new Types.ObjectId(postId), memberId: new Types.ObjectId(member.id), emoji };
  const existing = await Reaction.findOne(key);
  if (existing) await existing.deleteOne();
  else await Reaction.create(key);
  revalidatePath("/knowhow");
}
