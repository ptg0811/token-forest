"use client";

import { useState, useTransition } from "react";
import { deletePost } from "./actions";
import PostEditor from "./PostEditor";
import type { PostInput } from "@/lib/knowhow";

export default function PostActions({ postId, initial }: { postId: string; initial: PostInput }) {
  const [editing, setEditing] = useState(false);
  const [pending, start] = useTransition();
  if (editing) return <PostEditor mode="edit" postId={postId} initial={initial} onDone={() => setEditing(false)} />;
  return (
    <span className="flex gap-2 text-xs">
      <button onClick={() => setEditing(true)} className="text-[var(--accent)]">편집</button>
      <button
        disabled={pending}
        onClick={() => {
          if (confirm("이 글을 삭제할까요?")) start(() => deletePost(postId));
        }}
        className="text-[var(--text-muted)]"
      >
        삭제
      </button>
    </span>
  );
}
