import { NextRequest, NextResponse } from "next/server";
import { connectDb, Member, Post } from "@/lib/db";
import { validatePostInput } from "@/lib/knowhow";

// Claude 세션(또는 자동화)이 생성한 노하우 글 주입. 인증: 멤버 ingest 토큰(Bearer),
// usage /api/ingest와 동일. 같은 (멤버, link) 재주입은 멱등 update.
export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) {
    return NextResponse.json({ error: "missing bearer token" }, { status: 401 });
  }
  await connectDb();
  const member = await Member.findOne({ ingestToken: token }).lean();
  if (!member) {
    return NextResponse.json({ error: "invalid token" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "invalid payload" }, { status: 400 });
  }
  const v = validatePostInput(body as Record<string, unknown>);
  if (!v.ok) {
    return NextResponse.json({ error: v.error }, { status: 400 });
  }

  const now = new Date();
  const set = {
    source: "ingest" as const,
    title: v.value.title,
    bodyMarkdown: v.value.bodyMarkdown,
    link: v.value.link,
    tags: v.value.tags,
    authorMemberId: member._id,
    activityAt: now,
  };

  // 멱등: link가 있으면 (멤버, link)로 upsert, 없으면 항상 새 글.
  let id: string;
  if (v.value.link) {
    const doc = await Post.findOneAndUpdate(
      { authorMemberId: member._id, link: v.value.link },
      { $set: set },
      { upsert: true, new: true },
    );
    id = String(doc!._id);
  } else {
    const doc = await Post.create(set);
    id = String(doc._id);
  }
  return NextResponse.json({ ok: true, id });
}
