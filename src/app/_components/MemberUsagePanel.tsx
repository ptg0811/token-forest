import {
  getMemberBreakdown,
  getMemberDailyTrend,
  getMemberTools,
} from "@/lib/queries";
import { formatNumber, rangeForDays, toolLabel, type NumStyle } from "@/app/_lib/ui";
import { TrendArea } from "@/app/_components/charts";
import { Card, EmptyState, StatTile, ToolChip } from "@/app/_components/ui";

// One member's usage data view: stat tiles, tool chips, daily trends, and the
// per-tool/model breakdown. Shared by the member detail page (viewing others)
// and /me (viewing yourself) so both render the same picture of the same
// queries. Private extras (limits, efficiency coaching) stay in the callers.
export async function MemberUsagePanel({
  memberId,
  days,
  numStyle,
}: {
  memberId: string;
  days: number;
  numStyle: NumStyle;
}) {
  const range = rangeForDays(days);
  const [breakdown, trend, tools] = await Promise.all([
    getMemberBreakdown(memberId, range),
    getMemberDailyTrend(memberId, range),
    getMemberTools(memberId),
  ]);

  const totalTokens = breakdown.reduce((s, r) => s + r.tokens, 0);
  const totalRequests = breakdown.reduce((s, r) => s + r.requests, 0);
  const hasTokens = trend.some((t) => t.tokens > 0);
  const hasRequests = trend.some((t) => t.requests > 0);

  return (
    <div>
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatTile label="총 토큰" value={totalTokens} sub="선택 기간" numStyle={numStyle} />
        <StatTile label="총 요청" value={totalRequests} sub="선택 기간" numStyle={numStyle} />
        <StatTile label="사용 도구" value={tools.length} sub="전체 기간" />
      </div>

      {tools.length > 0 && (
        <div className="mb-6 flex flex-wrap gap-1.5">
          {tools.map((t) => (
            <ToolChip key={t} tool={t} />
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card title="일별 토큰 추이" hint="input+output">
          {hasTokens ? (
            <TrendArea data={trend} dataKey="tokens" unit="토큰" />
          ) : (
            <EmptyState message="이 기간에 토큰 사용 기록이 없습니다." />
          )}
        </Card>
        <Card title="일별 요청 추이" hint="requests">
          {hasRequests ? (
            <TrendArea data={trend} dataKey="requests" unit="요청" color="var(--series-2)" />
          ) : (
            <EmptyState message="이 기간에 요청 기록이 없습니다." />
          )}
        </Card>
      </div>

      <Card title="도구·모델별 상세" className="mt-4">
        {breakdown.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="text-left text-xs text-[var(--text-muted)]">
                  <th className="pb-2 font-medium">도구</th>
                  <th className="pb-2 font-medium">모델</th>
                  <th className="pb-2 text-right font-medium">입력</th>
                  <th className="pb-2 text-right font-medium">출력</th>
                  <th className="pb-2 text-right font-medium">총 토큰</th>
                  <th className="pb-2 text-right font-medium">요청</th>
                </tr>
              </thead>
              <tbody>
                {breakdown.map((r) => (
                  <tr
                    key={`${r.tool}:${r.model}`}
                    className="border-t border-black/5 dark:border-white/5"
                  >
                    <td className="py-2">{toolLabel(r.tool)}</td>
                    <td className="py-2 font-mono text-xs text-[var(--text-secondary)]">
                      {r.model || "—"}
                    </td>
                    <td className="py-2 text-right tabular-nums">
                      {r.input ? formatNumber(r.input) : "—"}
                    </td>
                    <td className="py-2 text-right tabular-nums">
                      {r.output ? formatNumber(r.output) : "—"}
                    </td>
                    <td className="py-2 text-right tabular-nums font-medium">
                      {r.tokens ? formatNumber(r.tokens) : "—"}
                    </td>
                    <td className="py-2 text-right tabular-nums">
                      {r.requests ? formatNumber(r.requests) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState message="이 기간에 사용 상세 기록이 없습니다." />
        )}
      </Card>
    </div>
  );
}
