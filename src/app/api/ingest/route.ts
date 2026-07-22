import { NextRequest, NextResponse } from "next/server";
import { connectDb, Member } from "@/lib/db";
import { ingestPayloadSchema } from "@/lib/types";
import {
  registerIdentities,
  upsertHourlyRows,
  upsertUsageRows,
} from "@/lib/usage";

// Universal ingestion endpoint: uploader CLI, manual entry, any future tool
// without a central API. Auth: per-member bearer token (members.ingestToken).
export async function POST(req: NextRequest) {
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

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  const parsed = ingestPayloadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid payload", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  // Rows always belong to the authenticated member: externalId is forced to
  // their email (any caller-supplied value is ignored) so one member cannot
  // write or overwrite usage attributed to another.
  // v1.1 uploaders still in the wild send plan-limit snapshots as
  // tool:"claude_limits" usage rows; those percentages must never enter usage
  // totals (limits now live in their own collection via /api/limits), so drop
  // them here.
  const rows = parsed.data.rows
    .filter((row) => row.tool !== "claude_limits")
    .map((row) => ({
      ...row,
      externalId: member.email,
    }));
  if (rows.length === 0) {
    return NextResponse.json({ ok: true, upserted: 0, skipped: 0 });
  }
  await registerIdentities(
    [...new Set(rows.map((r) => r.tool))].map((tool) => ({
      memberId: String(member._id),
      tool,
      externalId: member.email,
    })),
  );
  const { upserted, skipped } = await upsertUsageRows(rows);

  // Optional hour-grained rows (heatmap only) — same member-forced externalId.
  let hourlyUpserted = 0;
  if (parsed.data.hourly?.length) {
    const hourly = parsed.data.hourly.map((row) => ({
      ...row,
      externalId: member.email,
    }));
    ({ upserted: hourlyUpserted } = await upsertHourlyRows(hourly));
  }
  return NextResponse.json({ ok: true, upserted, skipped, hourlyUpserted });
}
