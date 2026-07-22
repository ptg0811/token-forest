"use client";

import { useActionState, useState } from "react";
import type { MyDigest } from "@/lib/queries";
import {
  saveDigestDraft,
  shareDigest,
  skipDigest,
  type MeState,
} from "./actions";
import { Card } from "@/app/_components/ui";

// Style tokens mirror client.tsx (inputCls / primaryBtn / ghostBtn).
const textareaCls =
  "w-full rounded-md border border-black/15 bg-transparent px-3 py-2 text-sm outline-none focus:border-[var(--series-1)] dark:border-white/15";
const primaryBtn =
  "rounded-md bg-[var(--series-1)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50";
const ghostBtn =
  "rounded-md border border-black/15 px-4 py-2 text-sm font-medium disabled:opacity-50 dark:border-white/15";
const linkBtn =
  "text-sm text-[var(--text-muted)] underline underline-offset-2 disabled:opacity-50";

// The /me self-approval card for yesterday's digest draft. One form, three
// server actions selected per-button via formAction. Trust contract: nothing
// leaves this card until the member explicitly presses [팀에 공유] — the
// button itself is the consent, no extra confirm dialog. On share/skip the
// action revalidates /me and the draft query returns null, so the card
// disappears without any client-side bookkeeping.
export function DigestCard({ digest }: { digest: MyDigest }) {
  const [saveState, saveAction, savePending] = useActionState<MeState, FormData>(
    saveDigestDraft,
    {},
  );
  const [shareState, shareAction, sharePending] = useActionState<
    MeState,
    FormData
  >(shareDigest, {});
  const [skipState, skipAction, skipPending] = useActionState<MeState, FormData>(
    skipDigest,
    {},
  );
  // Three independent action states; show only the message of the button the
  // member pressed last, so a stale message never survives the next submit.
  const [last, setLast] = useState<"save" | "share" | "skip" | null>(null);
  const state: MeState =
    last === "save"
      ? saveState
      : last === "share"
        ? shareState
        : last === "skip"
          ? skipState
          : {};
  const pending = savePending || sharePending || skipPending;
  const materials = digest.materials.trim();

  return (
    <Card
      title={`어제의 다이제스트 (${digest.date})`}
      hint="공유 전까지 본인만 볼 수 있습니다"
    >
      <form className="space-y-3">
        <input type="hidden" name="date" value={digest.date} />
        <textarea
          name="content"
          rows={8}
          defaultValue={digest.content}
          required
          className={textareaCls}
        />
        {materials && (
          <details className="text-sm">
            <summary className="cursor-pointer text-xs font-medium text-[var(--text-secondary)]">
              재료 보기
            </summary>
            <pre className="mt-2 max-h-64 overflow-y-auto whitespace-pre-wrap rounded-md bg-black/5 px-3 py-2 font-mono text-xs text-[var(--text-secondary)] dark:bg-white/5">
              {materials}
            </pre>
          </details>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            formAction={saveAction}
            onClick={() => setLast("save")}
            disabled={pending}
            className={ghostBtn}
          >
            {savePending ? "저장 중…" : "수정 저장"}
          </button>
          <button
            type="submit"
            formAction={shareAction}
            onClick={() => setLast("share")}
            disabled={pending}
            className={primaryBtn}
          >
            {sharePending ? "공유 중…" : "팀에 공유"}
          </button>
          <button
            type="submit"
            formAction={skipAction}
            formNoValidate
            onClick={() => setLast("skip")}
            disabled={pending}
            className={linkBtn}
          >
            {skipPending ? "처리 중…" : "건너뛰기"}
          </button>
          {state.message && (
            <span
              className={`text-sm ${
                state.ok ? "text-[var(--series-4)]" : "text-[var(--series-6)]"
              }`}
            >
              {state.message}
            </span>
          )}
        </div>
      </form>
    </Card>
  );
}
