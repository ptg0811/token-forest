export const dynamic = "force-dynamic";

import ReactMarkdown from "react-markdown";
import Link from "next/link";
import { getViewer } from "@/lib/auth";
import { getKnowhowFeed } from "@/lib/knowhow-queries";
import { notionEnabled } from "@/lib/notion";
import PostEditor from "./PostEditor";
import PostActions from "./PostActions";
import ReactionBar from "./ReactionBar";

export default async function KnowhowPage() {
  const viewer = await getViewer();
  const memberId = viewer.status === "member" ? viewer.member.id : null;
  const posts = await getKnowhowFeed(memberId);

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-4 p-6">
      <h1 className="text-xl font-semibold">노하우 공유</h1>

      {memberId ? (
        <PostEditor mode="create" />
      ) : (
        <p className="text-sm text-[var(--text-secondary)]">글 작성·리액션은 로그인(내 사용량에서 등록) 후 가능합니다.</p>
      )}

      {posts.length === 0 && (
        <p className="text-sm text-[var(--text-secondary)]">
          아직 공유된 노하우가 없어요.{!notionEnabled() && " (Notion 연동 미설정)"}
        </p>
      )}

      {posts.map((p) => (
        <article key={p.id} className="flex flex-col gap-2 rounded-xl border border-black/10 p-4 dark:border-white/10">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="font-semibold">
              {p.title}{" "}
              <span className="align-middle text-[10px] uppercase text-[var(--text-muted)]">
                {p.source === "notion" ? "Notion" : "멤버"}
              </span>
            </h2>
            <span className="whitespace-nowrap text-xs text-[var(--text-muted)]">
              {p.authorName} · {p.activityAt.slice(0, 10)}
            </span>
          </div>
          {p.isOwner && (
            <PostActions postId={p.id} initial={{ title: p.title, bodyMarkdown: p.bodyMarkdown, link: p.link, tags: p.tags }} />
          )}
          {p.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {p.tags.map((t) => (
                <span key={t} className="rounded-full bg-[var(--accent)]/12 px-2 py-0.5 text-xs text-[var(--accent-strong)]">{t}</span>
              ))}
            </div>
          )}
          <div className="knowhow-md">
            <ReactMarkdown>{p.bodyMarkdown}</ReactMarkdown>
          </div>
          <div className="flex flex-wrap items-center gap-3 border-t border-black/5 pt-2 dark:border-white/5">
            {memberId && <ReactionBar postId={p.id} reactions={p.reactions} />}
            {(p.link || p.notionUrl) && (
              <Link href={(p.link ?? p.notionUrl)!} target="_blank" className="text-xs text-[var(--accent)] underline">
                {p.source === "notion" ? "Notion에서 열기 ↗" : "링크 열기 ↗"}
              </Link>
            )}
          </div>
        </article>
      ))}
    </main>
  );
}
