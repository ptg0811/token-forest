import { NextRequest, NextResponse } from "next/server";
import { connectDb, Member } from "@/lib/db";
import { computeGrowth } from "@/lib/growth";
import { getGrowthDays, getMyMachines, getLatestLimits } from "@/lib/queries";
import { isoDaysAgo, todayUtc } from "@/lib/date";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) {
    return NextResponse.json({ error: "missing bearer token" }, { status: 401 });
  }
  await connectDb();
  const member = await Member.findOne({ ingestToken: token }).lean();
  if (!member) {
    return NextResponse.json({ error: "invalid token" }, { status: 401 });
  }

  const id = String(member._id);
  const onboarded = member.onboardedAt
    ? new Date(member.onboardedAt).toISOString().slice(0, 10)
    : null;

  const [days, machines, limits] = await Promise.all([
    getGrowthDays(id, onboarded ?? "1970-01-01"),
    getMyMachines(member.email),
    getLatestLimits(id),
  ]);

  const growth = computeGrowth(days, onboarded, todayUtc());

  // 최근 7일 활동 툴 수.
  const since7 = isoDaysAgo(7);
  const recent = days.filter((d) => d.date >= since7);
  const tools7d = new Set(recent.flatMap((d) => d.tools)).size;

  return NextResponse.json({
    member: member.name,
    onboardedAt: onboarded,
    latestDate: days.length ? days[days.length - 1].date : null,
    machines: machines.map((m) => ({
      machineId: m.machineId,
      lastActive: m.lastDate,
    })),
    limits: limits.map((l) => ({
      account: l.organization || l.accountEmail,
      window: l.window,
      utilizationPct: l.utilizationPct,
      resetsAt: l.resetsAt,
    })),
    activeTools7d: tools7d,
    growth,
  });
}
