import { NextRequest, NextResponse } from "next/server";
import { connectDb, Member } from "@/lib/db";
import { limitsPayloadSchema } from "@/lib/types";
import { upsertLimitSnapshots } from "@/lib/usage";

// Plan-limit snapshot ingestion: the uploader POSTs each Claude account's
// rate-limit windows here. Auth: per-member bearer token (members.ingestToken),
// mirroring /api/ingest. Snapshots are always attributed to the authenticated
// member — accountEmail is descriptive only, so one member cannot write limits
// for another.
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
  const parsed = limitsPayloadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid payload", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const { upserted } = await upsertLimitSnapshots(
    String(member._id),
    parsed.data.snapshots,
  );
  return NextResponse.json({ ok: true, upserted });
}
