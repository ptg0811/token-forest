"use client";

import { useActionState, useState } from "react";
import {
  claimUnmapped,
  login,
  logout,
  regenerateToken,
  registerMember,
  saveCopilot,
  type MeState,
} from "./actions";

const inputCls =
  "w-full rounded-md border border-black/15 bg-transparent px-3 py-2 text-sm outline-none focus:border-[var(--series-1)] dark:border-white/15";
const labelCls = "mb-1 block text-xs font-medium text-[var(--text-secondary)]";
const primaryBtn =
  "rounded-md bg-[var(--series-1)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50";
const ghostBtn =
  "rounded-md border border-black/15 px-4 py-2 text-sm font-medium disabled:opacity-50 dark:border-white/15";

function FieldError({ msg }: { msg?: string }) {
  if (!msg) return null;
  return <p className="mt-1 text-xs text-[var(--series-6)]">{msg}</p>;
}

// Small reusable "copy to clipboard" control. Falls back silently if the
// clipboard API is unavailable (non-secure context).
function CopyButton({ value, label = "복사" }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          /* clipboard unavailable — user can select manually */
        }
      }}
      className="shrink-0 rounded-md border border-black/15 px-2.5 py-1 text-xs font-medium dark:border-white/15"
    >
      {copied ? "복사됨" : label}
    </button>
  );
}

// One-time token reveal. The token is only ever returned by an action once;
// this is the member's single chance to copy it.
function TokenReveal({ token }: { token: string }) {
  return (
    <div className="mt-3 rounded-lg border border-[var(--series-3)]/50 bg-[var(--series-3)]/5 p-3">
      <p className="mb-2 text-xs font-medium text-[var(--text-secondary)]">
        아래 토큰은 지금 한 번만 표시됩니다. 안전한 곳에 보관하세요.
      </p>
      <div className="flex items-center gap-2">
        <code className="flex-1 overflow-x-auto whitespace-nowrap rounded-md bg-black/5 px-2.5 py-1.5 font-mono text-xs dark:bg-white/5">
          {token}
        </code>
        <CopyButton value={token} />
      </div>
    </div>
  );
}

// Copyable shell one-liner (the Claude Code installer command).
export function CopyableCommand({ command }: { command: string }) {
  return (
    <div className="flex items-center gap-2">
      <code className="flex-1 overflow-x-auto whitespace-nowrap rounded-md bg-black/5 px-2.5 py-1.5 font-mono text-xs dark:bg-white/5">
        {command}
      </code>
      <CopyButton value={command} />
    </div>
  );
}

// ---- anonymous: token login -------------------------------------------------

export function LoginForm() {
  const [state, action, pending] = useActionState<MeState, FormData>(login, {});
  return (
    <form action={action} className="space-y-3">
      <div>
        <label className={labelCls}>인제스트 토큰</label>
        <input
          name="token"
          placeholder="tmk_…"
          autoComplete="off"
          required
          className={`${inputCls} font-mono`}
        />
      </div>
      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className={primaryBtn}>
          {pending ? "확인 중…" : "로그인"}
        </button>
        {state.ok === false && state.message && (
          <span className="text-sm text-[var(--series-6)]">{state.message}</span>
        )}
      </div>
    </form>
  );
}

// ---- unknown email: 1-minute registration -----------------------------------

export function RegisterCard({ email }: { email: string }) {
  const [state, action, pending] = useActionState<MeState, FormData>(
    registerMember,
    {},
  );
  if (state.ok && state.token) {
    return (
      <div>
        <p className="text-sm text-[var(--series-4)]">{state.message}</p>
        <TokenReveal token={state.token} />
        <p className="mt-3 text-xs text-[var(--text-muted)]">
          이 토큰으로 업로더/설치 스크립트를 설정한 뒤 이 페이지를 새로고침하면 연결
          체크리스트가 나타납니다.
        </p>
      </div>
    );
  }
  return (
    <form action={action} className="space-y-3">
      <div>
        <label className={labelCls}>이메일 (신원에서 자동 확인됨)</label>
        <input value={email} readOnly disabled className={`${inputCls} opacity-70`} />
      </div>
      <div>
        <label className={labelCls}>이름</label>
        <input name="name" placeholder="홍길동" required className={inputCls} />
        <FieldError msg={state.errors?.name} />
      </div>
      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className={primaryBtn}>
          {pending ? "등록 중…" : "시작하기"}
        </button>
        {state.ok === false && state.message && (
          <span className="text-sm text-[var(--series-6)]">{state.message}</span>
        )}
      </div>
    </form>
  );
}

// ---- copilot: github username + PAT -----------------------------------------

export function CopilotForm() {
  const [state, action, pending] = useActionState<MeState, FormData>(
    saveCopilot,
    {},
  );
  return (
    <form action={action} className="space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className={labelCls}>GitHub 사용자명</label>
          <input name="username" placeholder="octocat" required className={inputCls} />
          <FieldError msg={state.errors?.username} />
        </div>
        <div>
          <label className={labelCls}>Fine-grained PAT (Plan: read)</label>
          <input
            name="pat"
            type="password"
            placeholder="github_pat_…"
            autoComplete="off"
            required
            className={`${inputCls} font-mono`}
          />
          <FieldError msg={state.errors?.pat} />
        </div>
      </div>
      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className={primaryBtn}>
          {pending ? "저장 중…" : "Copilot 연결 저장"}
        </button>
        {state.ok && state.message && (
          <span className="text-sm text-[var(--series-4)]">{state.message}</span>
        )}
        {state.ok === false && !state.errors && state.message && (
          <span className="text-sm text-[var(--series-6)]">{state.message}</span>
        )}
      </div>
    </form>
  );
}

// ---- self-claim an unmapped record ------------------------------------------

export function ClaimButton({
  tool,
  externalId,
  claimable = true,
}: {
  tool: string;
  externalId: string;
  claimable?: boolean;
}) {
  if (!claimable) {
    return (
      <span className="text-xs text-[var(--text-muted)]">
        다른 구성원의 기록 (본인만 연결 가능)
      </span>
    );
  }
  const [state, action, pending] = useActionState<MeState, FormData>(
    claimUnmapped,
    {},
  );
  if (state.ok) {
    return <span className="text-xs text-[var(--series-4)]">연결됨</span>;
  }
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (
          !window.confirm(
            `${tool} · ${externalId} 기록을 내 계정으로 연결할까요? 이 매핑은 관리자만 되돌릴 수 있습니다.`,
          )
        ) {
          e.preventDefault();
        }
      }}
      className="inline-flex items-center gap-2"
    >
      <input type="hidden" name="tool" value={tool} />
      <input type="hidden" name="externalId" value={externalId} />
      <button type="submit" disabled={pending} className={`${ghostBtn} px-3 py-1 text-xs`}>
        {pending ? "연결 중…" : "내 기록입니다"}
      </button>
      {state.ok === false && state.message && (
        <span className="text-xs text-[var(--series-6)]">{state.message}</span>
      )}
    </form>
  );
}

// ---- danger: reissue token --------------------------------------------------

export function RegenTokenButton() {
  const [state, action, pending] = useActionState<MeState, FormData>(
    regenerateToken,
    {},
  );
  return (
    <div>
      <form
        action={action}
        onSubmit={(e) => {
          if (
            !window.confirm(
              "토큰을 재발급하면 기존 업로더·설치 스크립트 설정이 즉시 무효화됩니다. 계속할까요?",
            )
          ) {
            e.preventDefault();
          }
        }}
      >
        <button
          type="submit"
          disabled={pending}
          className="rounded-md border border-[var(--series-6)]/50 px-4 py-2 text-sm font-medium text-[var(--series-6)] disabled:opacity-50"
        >
          {pending ? "재발급 중…" : "토큰 재발급"}
        </button>
      </form>
      {state.ok && state.token && <TokenReveal token={state.token} />}
      {state.ok && state.message && (
        <p className="mt-2 text-xs text-[var(--text-secondary)]">{state.message}</p>
      )}
    </div>
  );
}

// ---- cookie-session logout --------------------------------------------------

export function LogoutButton() {
  return (
    <form action={logout}>
      <button type="submit" className={`${ghostBtn} px-3 py-1.5 text-xs`}>
        로그아웃
      </button>
    </form>
  );
}
