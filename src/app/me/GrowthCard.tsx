import { connectDb, Member } from "@/lib/db";
import { getGrowthDays } from "@/lib/queries";
import { computeGrowth } from "@/lib/growth";
import { todayUtc } from "@/lib/date";
import { Card } from "@/app/_components/ui";

// 내 나무 카드: 스테이지·GP 게이지·스트릭·다음 마일스톤.
// growth 엔진 규칙(토큰량은 성장에 미기여)에 따라 볼륨 수치는 표시하지 않는다.
export default async function GrowthCard({ memberId }: { memberId: string }) {
  await connectDb();
  const member = await Member.findById(memberId).lean();
  if (!member) return null;
  const onboarded = member.onboardedAt
    ? new Date(member.onboardedAt).toISOString().slice(0, 10)
    : null;
  const days = await getGrowthDays(memberId, onboarded ?? "1970-01-01");
  const g = computeGrowth(days, onboarded, todayUtc());

  const total = g.gp + (g.toNextStage ?? 0);
  const pct =
    g.toNextStage == null
      ? 100
      : total === 0
        ? 0
        : Math.min(100, Math.round((g.gp / total) * 100));
  const fire =
    g.streakDays >= 3 ? `🔥${g.streakDays}` : g.idleDays >= 3 ? `💤${g.idleDays}` : null;

  return (
    <Card title="내 나무">
      <div className="flex items-center gap-4">
        <div className="text-5xl leading-none">{g.stageEmoji}</div>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <h2 className="text-lg font-semibold text-[var(--text-primary)]">
              {g.stageLabel}
            </h2>
            <span className="text-sm text-[var(--text-secondary)]">Lv{g.level}</span>
            {fire && <span className="text-sm">{fire}</span>}
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-[var(--surface-2)]">
            <div
              className="h-full rounded-full bg-[var(--accent)]"
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="mt-1 text-xs text-[var(--text-muted)]">
            {g.gp} GP
            {g.toNextStage != null && ` · 다음 단계까지 ${g.toNextStage}`}
          </div>
        </div>
      </div>
      {g.nextMilestone && (
        <p className="mt-3 rounded-lg bg-[var(--surface-2)] px-3 py-2 text-sm text-[var(--accent-strong)]">
          다음 마일스톤: {g.nextMilestone.label}까지 {g.nextMilestone.remaining}
        </p>
      )}
      <p className="mt-2 text-xs text-[var(--text-secondary)]">
        활동 {g.activeDays}일 · 최고 🔥{g.bestStreak} · 오늘 효율 +{g.efficiencyBonusToday}
      </p>
    </Card>
  );
}
