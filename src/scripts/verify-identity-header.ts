import { trustIdentityHeaders, identityHeaderName, identityEmail } from "../lib/auth";

function assert(cond: boolean, msg: string) {
  if (!cond) { console.error("FAIL:", msg); process.exit(1); }
  console.log("ok:", msg);
}

const none = {} as unknown as NodeJS.ProcessEnv;
const legacy = { TOKEN_FOREST_TRUST_TAILSCALE_HEADERS: "1" } as unknown as NodeJS.ProcessEnv;
const generic = { TOKEN_FOREST_TRUST_IDENTITY_HEADERS: "1" } as unknown as NodeJS.ProcessEnv;
const custom = {
  TOKEN_FOREST_TRUST_IDENTITY_HEADERS: "1",
  TOKEN_FOREST_IDENTITY_HEADER: "X-Forwarded-Email", // 대문자로 줘도 소문자 비교
} as unknown as NodeJS.ProcessEnv;

// 트러스트 게이트
assert(!trustIdentityHeaders(none), "미설정 → 불신");
assert(trustIdentityHeaders(legacy), "레거시 별칭 인정");
assert(trustIdentityHeaders(generic), "신규 제네릭 인정");

// 헤더명
assert(identityHeaderName(none) === "tailscale-user-login", "기본 헤더명 = tailscale-user-login");
assert(identityHeaderName(custom) === "x-forwarded-email", "오버라이드 + 소문자화");

// 값 해석 — get 주입 (next/headers 불필요)
const H = (v: string | null) => (_n: string) => v;
assert(identityEmail(H("caleb@renewearth-lab.com"), none) === null, "불신 → 항상 null");
assert(identityEmail(H(" Caleb@RenewEarth-Lab.com "), generic) === "caleb@renewearth-lab.com", "trim + lowercase");
assert(identityEmail(H("not-an-email"), generic) === null, "@ 없음 → null");
assert(identityEmail(H(null), generic) === null, "헤더 없음 → null");

// 설정한 헤더명으로만 읽는지
const byName = (n: string) => (n === "x-forwarded-email" ? "a@b.co" : null);
assert(identityEmail(byName, custom) === "a@b.co", "설정 헤더명으로 읽음");
assert(identityEmail(byName, generic) === null, "기본 헤더명엔 값 없음 → null");

console.log("ALL PASS");
