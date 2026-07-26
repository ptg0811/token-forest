export const dynamic = "force-dynamic";

import Link from "next/link";
import { headers } from "next/headers";
import { getMemberList, getUnmappedExternalIds } from "@/lib/queries";
import { formatNumber, toolLabel } from "@/app/_lib/ui";
import { Card, EmptyState, PageHeader, ToolChip } from "@/app/_components/ui";
import { CopyableText } from "./InviteCard";

// The invite message points at this dashboard, derived from the request so a
// changed deployment address never leaves a stale URL in the copy.
async function dashboardUrl(): Promise<string> {
  const h = await headers();
  const host = h.get("host") ?? "localhost:3000";
  const proto =
    h.get("x-forwarded-proto") ??
    (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  return `${proto}://${host}`;
}

export default async function MembersPage() {
  const [members, unmapped, origin] = await Promise.all([
    getMemberList(),
    // Admin view: only the count/tools are shown, never the claim button, so
    // there is no viewer to scope claimability to — the flag goes unused here.
    getUnmappedExternalIds(""),
    dashboardUrl(),
  ]);

  const inviteMessage = [
    "🌲 token-forest에 초대합니다!",
    `① 브라우저에서 ${origin}/me 를 열고 회사 Google 계정으로 로그인하세요 — 신원이 자동으로 확인됩니다.`,
    "② 이름을 입력해 등록하면 설치 명령이 표시됩니다. 터미널에 붙여넣으면 업로더 설치 완료 (약 1분).",
  ].join("\n");

  return (
    <div>
      <PageHeader title="구성원" />

      <Card title="신규 구성원 초대" hint="관리자용" className="mb-4">
        <CopyableText text={inviteMessage} />
        <p className="mt-3 text-sm text-[var(--text-secondary)]">
          회사 Google Workspace 계정이 있는 구성원은 별도 초대 없이 바로 로그인할 수 있습니다
          (도메인 전체 허용). 위 메시지를 복사해 Slack DM으로 전달하세요.
        </p>
      </Card>

      <Card title="구성원별 사용량" hint="전체 기간 누적" className="mb-4">
        {members.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="text-left text-xs text-[var(--text-muted)]">
                  <th className="pb-2 font-medium">이름</th>
                  <th className="pb-2 text-right font-medium">토큰</th>
                  <th className="pb-2 text-right font-medium">요청</th>
                  <th className="pb-2 font-medium">사용 도구</th>
                  <th className="pb-2 text-right font-medium">최근 활동</th>
                </tr>
              </thead>
              <tbody>
                {members.map((m) => (
                  <tr key={m.id} className="border-t border-black/5 dark:border-white/5">
                    <td className="py-2.5">
                      <Link
                        href={`/members/${m.id}`}
                        className="font-medium text-[var(--series-1)] hover:underline"
                      >
                        {m.name}
                      </Link>
                      <div className="text-xs text-[var(--text-muted)]">{m.email}</div>
                    </td>
                    <td className="py-2.5 text-right tabular-nums">
                      {m.tokens ? formatNumber(m.tokens) : "—"}
                    </td>
                    <td className="py-2.5 text-right tabular-nums">
                      {m.requests ? formatNumber(m.requests) : "—"}
                    </td>
                    <td className="py-2.5">
                      <div className="flex flex-wrap gap-1">
                        {m.tools.length ? (
                          m.tools.map((t) => <ToolChip key={t} tool={t} />)
                        ) : (
                          <span className="text-xs text-[var(--text-muted)]">사용 기록 없음</span>
                        )}
                      </div>
                    </td>
                    <td className="py-2.5 text-right text-xs text-[var(--text-muted)]">
                      {m.lastActive ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState message="등록된 구성원이 없습니다." />
        )}
      </Card>

      {/* Claiming lives on /me (연결 관리) — here we only surface that unmapped
          records exist, instead of duplicating the table read-only. */}
      {unmapped.length > 0 && (
        <div className="rounded-lg border border-[var(--series-3)]/40 bg-[var(--series-3)]/5 px-4 py-3 text-xs text-[var(--text-secondary)]">
          구성원에 연결되지 않은 사용 기록이 <strong>{unmapped.length}건</strong> 있습니다
          ({[...new Set(unmapped.map((u) => toolLabel(u.tool)))].join(", ")}) — 내 것이라면{" "}
          <Link href="/me?tab=connect" className="text-[var(--series-1)] underline">
            내 사용량 → 연결 관리
          </Link>
          에서 클레임하세요.
        </div>
      )}
    </div>
  );
}
