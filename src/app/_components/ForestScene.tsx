// src/app/_components/ForestScene.tsx
import Link from "next/link";
import { connectDb, Member } from "@/lib/db";
import { getGrowthDays } from "@/lib/queries";
import { computeGrowth } from "@/lib/growth";
import { todayKst, teamEpoch } from "@/lib/date";
import { EmptyState } from "@/app/_components/ui";
import { timeBand, hash32, treeLayout, pickAnimal, type TimeBand } from "@/lib/forest-scene";

// 팀 숲 장면: 단일 지평선, id 해시 배치(등수 신호 금지), 밤낮 밴드, 습성 동물.
// GP·스테이지·스트릭만 노출 — 토큰 볼륨 절대 금지 (안티게이밍 가드레일).
const STAGE_SIZE: Record<string, number> = {
  dormant: 22, germinated: 26, seedling: 34, sapling: 40, young: 46, mature: 52, ancient: 56,
};

const BAND_BG: Record<TimeBand, string> = {
  dawn: "linear-gradient(#f3e2d9 0%, #ecefdc 55%, #d9e2c4 100%)",
  day: "linear-gradient(#dcebf2 0%, #e8efdc 55%, #d5dfc0 100%)",
  dusk: "linear-gradient(#f2d3ae 0%, #e6e3c4 55%, #d5dfc0 100%)",
  night: "linear-gradient(#101c33 0%, #1c2b45 50%, #22392e 100%)",
};
const BAND_HILL: Record<TimeBand, string> = {
  dawn: "#cbd6a9", day: "#c9d6ae", dusk: "#c2cd9e", night: "#24402f",
};

export default async function ForestScene({ band }: { band?: TimeBand }) {
  await connectDb();
  const members = await Member.find({}, { name: 1, onboardedAt: 1 }).lean();
  if (members.length === 0) return <EmptyState message="등록된 구성원이 없습니다." />;
  const today = todayKst();
  const trees = await Promise.all(
    members.map(async (m) => {
      const onboarded = m.onboardedAt
        ? new Date(m.onboardedAt).toISOString().slice(0, 10)
        : null;
      const days = await getGrowthDays(String(m._id), onboarded ?? "1970-01-01");
      return { id: String(m._id), name: m.name, g: computeGrowth(days, teamEpoch(), today) };
    }),
  );

  const kstHour = (new Date().getUTCHours() + 9) % 24;
  const b = band ?? timeBand(kstHour);
  const night = b === "night";
  const animal = pickAnimal(hash32(`${today}-${kstHour}`), b);
  const pos = new Map(treeLayout(trees.map((t) => t.id)).map((p) => [p.id, p]));

  const tagCls = night
    ? "mt-0.5 inline-block whitespace-nowrap rounded-lg bg-[#0e1a12cc] px-1.5 text-[10px] text-[#cfe6d5]"
    : "mt-0.5 inline-block whitespace-nowrap rounded-lg bg-[#ffffffcc] px-1.5 text-[10px] text-[#26302a]";

  return (
    <section
      aria-label="팀 숲"
      className="fs-scene relative h-64 overflow-hidden rounded-xl border border-[var(--border)]"
      style={{ background: BAND_BG[b] }}
    >
      <div className="absolute left-7 top-3 text-2xl">{night ? "🌙" : "☀️"}</div>
      {!night && (
        <>
          <div className="absolute top-4 text-xl opacity-80" style={{ animation: "fs-drift 48s linear infinite" }}>☁️</div>
          <div className="absolute top-11 text-sm opacity-50" style={{ animation: "fs-drift 75s linear -30s infinite" }}>☁️</div>
          <div className="absolute top-16 text-xs opacity-30" style={{ animation: "fs-drift 100s linear -60s infinite" }}>☁️</div>
          <div className="absolute left-[44%] top-12 text-sm" style={{ animation: "fs-leaf-y 11s linear infinite" }}>
            <span className="inline-block" style={{ animation: "fs-leaf-x 11s ease-in-out infinite" }}>🍃</span>
          </div>
          <div className="absolute left-[70%] top-10 text-xs" style={{ animation: "fs-leaf-y 14s linear -6s infinite" }}>
            <span className="inline-block" style={{ animation: "fs-leaf-x 14s ease-in-out -6s infinite" }}>🍃</span>
          </div>
        </>
      )}
      {night && (
        <>
          <div className="absolute left-[30%] top-24 text-[9px]" style={{ animation: "fs-blink 2.4s infinite" }}>✨</div>
          <div className="absolute left-[56%] top-20 text-[9px]" style={{ animation: "fs-blink 3.1s -1s infinite" }}>✨</div>
          <div className="absolute left-[74%] top-28 text-[9px]" style={{ animation: "fs-blink 2.8s -2s infinite" }}>✨</div>
        </>
      )}
      <div
        className="absolute inset-x-0 bottom-0 h-16"
        style={{ background: BAND_HILL[b], borderRadius: "100% 100% 0 0 / 38px" }}
      />
      {trees.map((t) => {
        const p = pos.get(t.id)!;
        return (
          <Link
            key={t.id}
            href={`/members/${t.id}`}
            aria-label={`${t.name} — ${t.g.stageLabel}, ${t.g.gp} GP`}
            className="absolute bottom-9 -translate-x-1/2 text-center"
            style={{ left: `${p.xPct}%` }}
          >
            <span className="block transition-transform hover:scale-110">
              <span className="block" style={{ animation: `fs-gust 16s ease-in-out ${p.gustDelay}s infinite`, transformOrigin: "50% 100%" }}>
                <span
                  className="block"
                  style={{
                    fontSize: STAGE_SIZE[t.g.stage] ?? 26,
                    animation: `fs-sway-${"abc"[p.swayVariant]} ${p.swayDur}s ease-in-out ${p.swayDelay}s infinite`,
                    transformOrigin: "50% 92%",
                  }}
                >
                  {t.g.stageEmoji}
                </span>
              </span>
              <span className={tagCls}>
                {t.name} Lv{t.g.level}
                {t.g.streakDays >= 3 ? ` 🔥${t.g.streakDays}` : ""}
              </span>
            </span>
          </Link>
        );
      })}
      {animal === "🦉" ? (
        <div className="absolute bottom-8 right-10 text-lg" style={{ animation: "fs-owl 12s ease-in-out infinite" }}>🦉</div>
      ) : (
        <div
          className="absolute bottom-6"
          style={{ animation: `${animal === "🦌" ? "fs-amble-x 44s" : "fs-dash-x 32s"} linear infinite` }}
        >
          <span className="inline-block" style={{ animation: "fs-dash-face 32s linear infinite" }}>
            <span
              className="inline-block text-lg"
              style={{
                animation: animal === "🦌" ? undefined : "fs-dash-hop 32s linear infinite",
                ["--fs-hop" as string]: animal === "🐇" ? "-10px" : "-6px",
              }}
            >
              {animal}
            </span>
          </span>
        </div>
      )}
    </section>
  );
}
