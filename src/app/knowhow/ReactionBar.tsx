"use client";

import { useTransition } from "react";
import { toggleReaction } from "./actions";
import { REACTION_EMOJIS } from "@/lib/knowhow";
import type { FeedReaction } from "@/lib/knowhow-queries";

export default function ReactionBar({ postId, reactions }: { postId: string; reactions: FeedReaction[] }) {
  const [pending, start] = useTransition();
  const countOf = (e: string) => reactions.find((r) => r.emoji === e);
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {REACTION_EMOJIS.map((e) => {
        const r = countOf(e);
        const on = r?.mine;
        return (
          <button
            key={e}
            disabled={pending}
            onClick={() => start(() => toggleReaction(postId, e))}
            className={
              on
                ? "rounded-full border border-[var(--accent)] bg-[var(--accent)]/15 px-2.5 py-0.5 text-sm text-[var(--accent-strong)]"
                : "rounded-full border border-black/10 px-2.5 py-0.5 text-sm text-[var(--text-secondary)] hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/5"
            }
          >
            {e}{r?.count ? ` ${r.count}` : ""}
          </button>
        );
      })}
    </div>
  );
}
