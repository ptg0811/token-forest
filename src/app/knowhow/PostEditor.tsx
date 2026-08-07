"use client";

import { useState, useTransition } from "react";
import { createPost, updatePost } from "./actions";
import type { PostInput } from "@/lib/knowhow";

type Props = {
  mode: "create" | "edit";
  postId?: string;
  initial?: PostInput;
  onDone?: () => void;
};

export default function PostEditor({ mode, postId, initial, onDone }: Props) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [body, setBody] = useState(initial?.bodyMarkdown ?? "");
  const [link, setLink] = useState(initial?.link ?? "");
  const [tags, setTags] = useState((initial?.tags ?? []).join(", "));
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function submit() {
    setError(null);
    const input: PostInput = {
      title,
      bodyMarkdown: body,
      link: link.trim() || null,
      tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
    };
    start(async () => {
      try {
        if (mode === "create") await createPost(input);
        else await updatePost(postId!, input);
        onDone?.();
      } catch (e) {
        setError((e as Error).message);
      }
    });
  }

  const field = "w-full rounded-md border border-black/10 bg-transparent px-3 py-2 text-sm dark:border-white/15";
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-black/10 p-4 dark:border-white/10">
      <input className={field} placeholder="제목" value={title} onChange={(e) => setTitle(e.target.value)} />
      <textarea className={field} rows={5} placeholder="본문 (마크다운)" value={body} onChange={(e) => setBody(e.target.value)} />
      <input className={field} placeholder="공유 링크 (선택, http(s))" value={link} onChange={(e) => setLink(e.target.value)} />
      <input className={field} placeholder="태그 (쉼표 구분, 선택)" value={tags} onChange={(e) => setTags(e.target.value)} />
      {error && <p className="text-sm text-red-500">{error}</p>}
      <div className="flex gap-2">
        <button
          disabled={pending}
          onClick={submit}
          className="rounded-md bg-[var(--accent)] px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
        >
          {mode === "create" ? "게시" : "저장"}
        </button>
        {onDone && (
          <button disabled={pending} onClick={onDone} className="rounded-md px-3 py-1.5 text-sm text-[var(--text-secondary)]">
            취소
          </button>
        )}
      </div>
    </div>
  );
}
