import { cookies, headers } from "next/headers";
import { connectDb, Member } from "@/lib/db";

// Who is looking at the dashboard?
// Primary: The fronting proxy injects the requester's email in the header
// named by TOKEN_FOREST_IDENTITY_HEADER (default: tailscale-user-login).
// This is zero-friction when the proxy (tailscale serve, oauth2-proxy, etc.)
// is trusted. Fallback: a member pastes their ingest token once and we keep
// it in an httpOnly cookie (SESSION_COOKIE).
//
// - "member":    recognized (headers/cookie matched a member document)
// - "unknown":   we know an identity email but no member exists yet
//                → the /me page offers self-registration for that email
// - "anonymous": no identity signal at all (e.g. direct localhost access)

export const SESSION_COOKIE = "tm_token";

// --- 설정형 신원 헤더 (순수 헬퍼 — 프록시 종류 불문) ---
// 대시보드 앞 프록시(oauth2-proxy · tailscale serve · Cloudflare Access …)가
// 요청자 이메일을 헤더로 주입한다. 어떤 헤더를 신뢰할지는 env가 정한다.
// 보안 전제: 신뢰를 켰다면 그 프록시가 클라이언트가 보낸 동명 헤더를
// 반드시 덮어써야 한다 — 아니면 위조 가능.

export function trustIdentityHeaders(env: NodeJS.ProcessEnv = process.env): boolean {
  return (
    env.TOKEN_FOREST_TRUST_IDENTITY_HEADERS === "1" ||
    env.TOKEN_FOREST_TRUST_TAILSCALE_HEADERS === "1" // legacy alias
  );
}

export function identityHeaderName(env: NodeJS.ProcessEnv = process.env): string {
  return (env.TOKEN_FOREST_IDENTITY_HEADER || "tailscale-user-login").toLowerCase();
}

// get: 헤더명 → 값 (next/headers의 h.get 등을 주입). 불신 상태면 항상 null.
export function identityEmail(
  get: (name: string) => string | null | undefined,
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  if (!trustIdentityHeaders(env)) return null;
  const email = get(identityHeaderName(env))?.trim().toLowerCase();
  return email && email.includes("@") ? email : null;
}

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

  // Trust gate (TOKEN_FOREST_TRUST_IDENTITY_HEADERS / legacy
  // TOKEN_FOREST_TRUST_TAILSCALE_HEADERS) and header name
  // (TOKEN_FOREST_IDENTITY_HEADER, default tailscale-user-login) are env-driven.
  // The fronting proxy must overwrite the header to prevent forgery.
  const h = await headers();
  const cookieToken = (await cookies()).get(SESSION_COOKIE)?.value;
  const login = identityEmail((n) => h.get(n));
  if (login) {
    await connectDb();
    const member = await Member.findOne({ email: login }).lean();
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
    return { status: "unknown", email: login };
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
