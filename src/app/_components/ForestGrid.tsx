import { connectDb, Member } from "@/lib/db";
import { getGrowthDays } from "@/lib/queries";
import { computeGrowth } from "@/lib/growth";
import { todayUtc } from "@/lib/date";
import { Card } from "@/app/_components/ui";

// 팀 숲: 멤버별 나무 그리드. 안티게이밍 가드레일 — GP·스테이지·스트릭만,
// 토큰 볼륨은 절대 표시하지 않는다 (성장 엔진 스펙).
export default async function ForestGrid() {
  await connectDb();
  const members = await Member.find({}, { name: 1, onboardedAt: 1 }).lean();
  const today = todayUtc();
  const trees = await Promise.all(
    members.map(async (m) => {
      const onboarded = m.onboardedAt
        ? new Date(m.onboardedAt).toISOString().slice(0, 10)
        : null;
      const days = await getGrowthDays(String(m._id), onboarded ?? "1970-01-01");
      return { id: String(m._id), name: m.name, g: computeGrowth(days, onboarded, today) };
    }),
  );
  // 성숙한 나무 먼저 — 숲의 스카이라인.
  trees.sort((a, b) => b.g.gp - a.g.gp);

  return (
    <Card title="팀 숲" hint="GP·스테이지·스트릭만 — 사용량 아님">
      {trees.length ? (
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6">
          {trees.map((t) => (
            <div
              key={t.id}
              className="flex flex-col items-center rounded-lg bg-[var(--surface-2)] px-2 py-3 text-center"
            >
              <div className="text-3xl leading-none">{t.g.stageEmoji}</div>
              <div className="mt-1 max-w-full truncate text-xs text-[var(--text-primary)]">
                {t.name}
              </div>
              <div className="text-[10px] text-[var(--text-muted)]">
                {`Lv${t.g.level}${t.g.streakDays >= 3 ? ` 🔥${t.g.streakDays}` : ""}`}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-[var(--text-muted)]">등록된 구성원이 없습니다.</p>
      )}
    </Card>
  );
}
