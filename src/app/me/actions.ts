"use server";

import crypto from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { connectDb, Digest, Member } from "@/lib/db";
import { getViewer, requireMember, SESSION_COOKIE } from "@/lib/auth";
import { encryptSecret } from "@/lib/crypto";
import { autoClaimEmailIdentities, registerIdentities } from "@/lib/usage";
import { sendConnectorRequest, sendDigest } from "@/lib/slack";

// Shared shape for every self-service action. `token` is set only by the two
// flows that mint a fresh ingest token (registration, reissue) and is shown
// to the member exactly once.
export type MeState = {
  ok?: boolean;
  message?: string;
  token?: string;
  errors?: Record<string, string>;
};

const YEAR_SECONDS = 60 * 60 * 24 * 365;

function newIngestToken(): string {
  return `tmk_${crypto.randomBytes(24).toString("hex")}`;
}

// httpOnly session cookie mirroring the ingest-token fallback in auth.ts.
async function setSessionCookie(token: string): Promise<void> {
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: YEAR_SECONDS,
  });
}

// Anonymous → member: paste the ingest token once, we verify it maps to a real
// member and keep it in an httpOnly cookie. No requireMember here — this IS the
// path that establishes a session.
export async function login(_prev: MeState, formData: FormData): Promise<MeState> {
  const token = String(formData.get("token") ?? "").trim();
  if (!token) return { ok: false, message: "토큰을 입력하세요." };
  await connectDb();
  const member = await Member.findOne({ ingestToken: token }).lean();
  if (!member) {
    return { ok: false, message: "유효하지 않은 토큰입니다. 다시 확인하세요." };
  }
  await setSessionCookie(token);
  redirect("/me");
}

// Unknown (tailnet email, no member yet) → member. The email is taken from the
// verified tailnet identity, NEVER from the form, so nobody can register under
// someone else's address.
export async function registerMember(
  _prev: MeState,
  formData: FormData,
): Promise<MeState> {
  const viewer = await getViewer();
  if (viewer.status !== "unknown") {
    return {
      ok: false,
      message: "신원을 확인할 수 없거나 이미 등록되어 있습니다. 새로고침하세요.",
    };
  }
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { ok: false, errors: { name: "이름을 입력하세요." } };

  const email = viewer.email; // from tailnet identity — never client-supplied
  await connectDb();
  if (await Member.findOne({ email }).lean()) {
    return { ok: false, message: "이미 등록된 이메일입니다. 새로고침하세요." };
  }
  const ingestToken = newIngestToken();
  await Member.create({ name, email, ingestToken });
  // Link any pre-existing usage for this email. Best-effort: a failure here
  // must not lose the one-time token display — the next sync retries anyway.
  try {
    await autoClaimEmailIdentities();
  } catch (err) {
    console.warn("auto-claim on register failed (registration OK):", err);
  }
  revalidatePath("/me");
  return {
    ok: true,
    token: ingestToken,
    message: `${name}님, 등록이 완료됐습니다.`,
  };
}

// Store a member's GitHub PAT (encrypted) + copilot identity mapping. Scoped to
// the caller's own member document via requireMember.
export async function saveCopilot(
  _prev: MeState,
  formData: FormData,
): Promise<MeState> {
  const me = await requireMember();
  const username = String(formData.get("username") ?? "").trim();
  const pat = String(formData.get("pat") ?? "").trim();
  const errors: Record<string, string> = {};
  if (!username) errors.username = "GitHub 사용자명을 입력하세요.";
  if (!pat) errors.pat = "PAT를 입력하세요.";
  if (Object.keys(errors).length > 0) return { ok: false, errors };

  await connectDb();
  await Member.updateOne(
    { _id: me.id },
    { $set: { githubTokenEnc: encryptSecret(pat) } },
  );
  await registerIdentities([{ memberId: me.id, tool: "copilot", externalId: username }]);
  revalidatePath("/me");
  return { ok: true, message: `GitHub Copilot(@${username}) 연결을 저장했습니다.` };
}

// Self-claim an unmapped (tool, externalId) usage record. Maps ONLY to the
// caller's own memberId. registerIdentities uses $setOnInsert, so an id already
// claimed by another member is left untouched (no hijacking).
export async function claimUnmapped(
  _prev: MeState,
  formData: FormData,
): Promise<MeState> {
  const me = await requireMember();
  const tool = String(formData.get("tool") ?? "").trim();
  const externalId = String(formData.get("externalId") ?? "").trim();
  if (!tool || !externalId) return { ok: false, message: "잘못된 요청입니다." };

  await registerIdentities([{ memberId: me.id, tool, externalId }]);
  revalidatePath("/me");
  revalidatePath("/");
  revalidatePath("/members");
  return { ok: true, message: `${tool} · ${externalId} 기록을 내 계정에 연결했습니다.` };
}

// Reissue the caller's ingest token. Any existing uploader config is invalidated.
// If the caller is on a cookie session, roll the cookie to the new token so they
// stay signed in.
export async function regenerateToken(): Promise<MeState> {
  const me = await requireMember();
  const ingestToken = newIngestToken();
  await connectDb();
  await Member.updateOne({ _id: me.id }, { $set: { ingestToken } });

  const jar = await cookies();
  if (jar.get(SESSION_COOKIE)) await setSessionCookie(ingestToken);

  revalidatePath("/me");
  return {
    ok: true,
    token: ingestToken,
    message: "새 토큰을 발급했습니다. 기존 업로더 설정은 더 이상 동작하지 않습니다.",
  };
}

// Cookie-session logout. Tailnet-identified members have no cookie to clear.
export async function logout(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/me");
}

// Wizard step 1: persist which tools the member uses. Free strings — custom
// tools ("opencode") ride along. Does NOT stamp onboardedAt; that happens in
// completeOnboarding so a member can leave mid-wizard and resume.
export async function saveToolPrefs(
  _prev: MeState,
  formData: FormData,
): Promise<MeState> {
  const me = await requireMember();
  const raw = String(formData.get("tools") ?? "");
  const tools = raw
    .split(",")
    .map((s) => s.trim().toLowerCase().slice(0, 40))
    .filter(Boolean)
    .slice(0, 12);
  await connectDb();
  await Member.updateOne({ _id: me.id }, { $set: { toolPrefs: tools } });
  revalidatePath("/me");
  return { ok: true };
}

// Wizard finish (or explicit skip-through). Checklist takes over afterwards.
export async function completeOnboarding(): Promise<MeState> {
  const me = await requireMember();
  await connectDb();
  await Member.updateOne({ _id: me.id }, { $set: { onboardedAt: new Date() } });
  revalidatePath("/me");
  return { ok: true, message: "온보딩이 완료됐습니다." };
}

// ---- daily digest self-approval ----------------------------------------------
// All three actions target the caller's OWN document only ({date, memberId})
// and mutate atomically via findOneAndUpdate with a draft-only filter: if a
// concurrent share/skip already resolved the draft, the filter misses and we
// report "already handled" instead of clobbering (trust contract: a resolved
// digest is immutable).

const DIGEST_MAX_CONTENT = 4000;

function digestDate(formData: FormData): string | null {
  const date = String(formData.get("date") ?? "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
}

function digestContent(formData: FormData): string | null {
  const content = String(formData.get("content") ?? "").trim();
  return content.length >= 1 && content.length <= DIGEST_MAX_CONTENT
    ? content
    : null;
}

const DIGEST_ALREADY_HANDLED: MeState = {
  ok: false,
  message: "이미 처리된 다이제스트입니다.",
};

// Save an edited draft without sharing. The member's version is now canonical:
// editedByMember blocks any further uploader overwrite.
export async function saveDigestDraft(
  _prev: MeState,
  formData: FormData,
): Promise<MeState> {
  const me = await requireMember();
  const date = digestDate(formData);
  if (!date) return { ok: false, message: "잘못된 요청입니다." };
  const content = digestContent(formData);
  if (!content) {
    return {
      ok: false,
      message: `내용은 1~${DIGEST_MAX_CONTENT}자여야 합니다.`,
    };
  }
  await connectDb();
  const doc = await Digest.findOneAndUpdate(
    { date, memberId: me.id, status: "draft" },
    { $set: { content, editedByMember: true } },
  );
  if (!doc) return DIGEST_ALREADY_HANDLED;
  revalidatePath("/me");
  return { ok: true, message: "초안을 저장했습니다." };
}

// Share the digest with the team: persist the (possibly edited) content, flip
// to shared, then announce on Slack. The DB write is the source of truth — a
// Slack failure never rolls the share back, it just warns the member.
export async function shareDigest(
  _prev: MeState,
  formData: FormData,
): Promise<MeState> {
  const me = await requireMember();
  const date = digestDate(formData);
  if (!date) return { ok: false, message: "잘못된 요청입니다." };
  const content = digestContent(formData);
  if (!content) {
    return {
      ok: false,
      message: `내용은 1~${DIGEST_MAX_CONTENT}자여야 합니다.`,
    };
  }
  await connectDb();
  const doc = await Digest.findOneAndUpdate(
    { date, memberId: me.id, status: "draft" },
    {
      $set: {
        content,
        status: "shared",
        sharedAt: new Date(),
        editedByMember: true,
      },
    },
  );
  if (!doc) return DIGEST_ALREADY_HANDLED;
  revalidatePath("/me");
  revalidatePath("/team");
  try {
    await sendDigest(me.name, date, content);
  } catch (err) {
    console.warn("digest slack send failed (share persisted):", err);
    return {
      ok: true,
      message: "공유됐지만 Slack 발송은 실패했습니다. 관리자에게 알려주세요.",
    };
  }
  return { ok: true, message: "팀에 공유했습니다." };
}

// Skip today's draft — it stays private forever. editedByMember guards the
// resolved document against any future uploader write.
export async function skipDigest(
  _prev: MeState,
  formData: FormData,
): Promise<MeState> {
  const me = await requireMember();
  const date = digestDate(formData);
  if (!date) return { ok: false, message: "잘못된 요청입니다." };
  await connectDb();
  const doc = await Digest.findOneAndUpdate(
    { date, memberId: me.id, status: "draft" },
    { $set: { status: "skipped", editedByMember: true } },
  );
  if (!doc) return DIGEST_ALREADY_HANDLED;
  revalidatePath("/me");
  return { ok: true, message: "이번 다이제스트를 건너뛰었습니다." };
}

// "기타 도구" path: forward the request to the admin Slack channel.
export async function requestConnector(
  _prev: MeState,
  formData: FormData,
): Promise<MeState> {
  const me = await requireMember();
  const tool = String(formData.get("tool") ?? "").trim().slice(0, 40);
  if (!tool) return { ok: false, message: "도구 이름을 입력하세요." };
  try {
    await sendConnectorRequest(tool, me.name, me.email);
  } catch (err) {
    console.warn("connector request failed:", err);
    return { ok: false, message: "요청 전송에 실패했습니다. 관리자에게 직접 알려주세요." };
  }
  return { ok: true, message: `"${tool}" 커넥터 추가 요청을 보냈습니다.` };
}
