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
    getUnmappedExternalIds(),
    dashboardUrl(),
  ]);

  const inviteMessage = [
    "① 방금 보낸 Tailscale 초대 메일을 수락하세요 — 앱 설치까지 자동으로 안내됩니다.",
    `② 연결되면 브라우저에서 ${origin}/me 를 여세요. 나머지는 화면이 단계별로 안내합니다.`,
  ].join("\n");

  return (
    <div>
      <PageHeader title="구성원" />

      <Card title="신규 구성원 초대" hint="관리자용 2단계" className="mb-4">
        <ol className="mb-3 list-decimal space-y-1 pl-5 text-sm text-[var(--text-secondary)]">
          <li>
            <a
              href="https://login.tailscale.com/admin/users"
              target="_blank"
              rel="noreferrer"
              className="text-[var(--series-1)] underline"
            >
              Tailscale 관리 콘솔 ↗
            </a>
            에서 회사 이메일로 초대를 발송합니다 (초대된 사용자는 승인 절차 없이 바로
            연결됩니다).
          </li>
          <li>아래 메시지를 복사해 Slack DM으로 보냅니다.</li>
        </ol>
        <CopyableText text={inviteMessage} />
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
