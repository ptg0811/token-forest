// 노하우 인앱 작성 순수 상수·검증 (DB·네트워크 미의존).
export const REACTION_EMOJIS = ["👍", "🎉", "👀", "💡", "🔥"] as const;
export type ReactionEmoji = (typeof REACTION_EMOJIS)[number];

export function isValidEmoji(e: string): e is ReactionEmoji {
  return (REACTION_EMOJIS as readonly string[]).includes(e);
}

export type PostInput = { title: string; bodyMarkdown: string; link: string | null; tags: string[] };

export function validatePostInput(raw: {
  title?: string; bodyMarkdown?: string; link?: string | null; tags?: unknown;
}): { ok: true; value: PostInput } | { ok: false; error: string } {
  const title = (raw.title ?? "").trim();
  if (!title) return { ok: false, error: "제목을 입력하세요." };
  const bodyMarkdown = (raw.bodyMarkdown ?? "").trim();
  const link = ((raw.link ?? "") as string).trim() || null;
  if (!bodyMarkdown && !link) return { ok: false, error: "본문 또는 링크 중 하나는 필요합니다." };
  if (link && !/^https?:\/\//i.test(link)) return { ok: false, error: "링크는 http(s) URL이어야 합니다." };
  const tags = Array.isArray(raw.tags)
    ? raw.tags.map((t) => String(t).trim()).filter(Boolean)
    : [];
  return { ok: true, value: { title, bodyMarkdown, link, tags } };
}
