import { cookies, headers } from "next/headers";
import { connectDb, Member } from "@/lib/db";

// Who is looking at the dashboard?
// Primary: `tailscale serve` injects the requester's tailnet identity as the
// Tailscale-User-Login header (their login email) — zero-friction on the
// 10-person internal tailnet. Fallback: a member pastes their ingest token
// once and we keep it in an httpOnly cookie (SESSION_COOKIE).
//
// - "member":    recognized (headers/cookie matched a member document)
// - "unknown":   we know an identity (tailnet email) but no member exists yet
//                → the /me page offers self-registration for that email
// - "anonymous": no identity signal at all (e.g. direct localhost access)

export const SESSION_COOKIE = "tm_token";

export type Viewer =
  | {
      status: "member";
      member: { id: string; name: string; email: string; ingestToken: string | null };
    }
  | { status: "unknown"; email: string }
  | { status: "anonymous" };

export async function getViewer(): Promise<Viewer> {
  // Read the dynamic request APIs (headers/cookies) BEFORE touching the DB:
  // they bail static prerendering out to dynamic rendering. Connecting first
  // would throw during `next build` inside Docker, where no DB exists.

  // Identity headers are only proof of identity when the app is actually
  // fronted by `tailscale serve` — a direct connection (misconfigured port
  // publish, local process) could forge them. Deployments must opt in
  // explicitly; docker-compose sets this for the tailscale-fronted setup.
  // Note: on a shared host, shell users can still hit the loopback port
  // directly — acceptable here because they already have direct DB access.
  const trustHeaders = process.env.TOKEN_FOREST_TRUST_TAILSCALE_HEADERS === "1";
  const h = await headers();
  const cookieToken = (await cookies()).get(SESSION_COOKIE)?.value;
  const tailscaleLogin = trustHeaders
    ? h.get("tailscale-user-login")?.trim().toLowerCase()
    : undefined;
  if (tailscaleLogin && tailscaleLogin.includes("@")) {
    await connectDb();
    const member = await Member.findOne({ email: tailscaleLogin }).lean();
    if (member) {
      return {
        status: "member",
        member: {
          id: String(member._id),
          name: member.name,
          email: member.email,
          ingestToken: member.ingestToken ?? null,
        },
      };
    }
    return { status: "unknown", email: tailscaleLogin };
  }

  if (cookieToken) {
    await connectDb();
    const member = await Member.findOne({ ingestToken: cookieToken }).lean();
    if (member) {
      return {
        status: "member",
        member: {
          id: String(member._id),
          name: member.name,
          email: member.email,
          ingestToken: member.ingestToken ?? null,
        },
      };
    }
  }

  return { status: "anonymous" };
}

// Server actions must scope every mutation to the authenticated member.
// Throws when nobody is signed in — callers surface the error to the UI.
export async function requireMember() {
  const viewer = await getViewer();
  if (viewer.status !== "member") {
    throw new Error("로그인이 필요합니다 (내 사용량 페이지에서 등록/로그인하세요)");
  }
  return viewer.member;
}
