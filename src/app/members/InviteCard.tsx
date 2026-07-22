"use client";

import { useState } from "react";

// Multi-line copy box for the new-member invite message. Sibling of
// CopyableCommand (me/client.tsx), which is single-line/monospace — this one
// preserves line breaks and copies prose.
export function CopyableText({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-start gap-2">
      <p className="flex-1 whitespace-pre-wrap rounded-md bg-black/5 px-3 py-2 text-xs leading-relaxed dark:bg-white/5">
        {text}
      </p>
      <button
        type="button"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(text);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          } catch {
            /* clipboard unavailable — user can select manually */
          }
        }}
        className="shrink-0 rounded-md border border-black/15 px-2.5 py-1 text-xs font-medium dark:border-white/15"
      >
        {copied ? "복사됨" : "복사"}
      </button>
    </div>
  );
}
