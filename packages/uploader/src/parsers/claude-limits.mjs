// Snapshot Claude plan rate-limit windows for the local Claude account.
//
// Claude Code stores an OAuth access token in ~/.claude/.credentials.json under
// `claudeAiOauth.accessToken`. The same token authorizes two *unofficial* OAuth
// endpoints that Claude's own clients poll:
//   - /api/oauth/profile — who the account is (email) and its plan tier.
//   - /api/oauth/usage   — how close each rate-limit window is to its limit.
// We read the token, ask both endpoints, and turn every usage window into a
// plan-limit snapshot tagged with the account it belongs to (a member may own
// several Claude accounts, so the account email is what distinguishes them).
//
// Neither endpoint is a documented public API — their shapes can change or
// vanish. Callers MUST treat every failure here as non-fatal (see cli.mjs): a
// missing file, a 404/429, or a network error should warn, never abort the run.
//
// The access token is a secret: it is never logged, never placed in an error
// message or in a snapshot's `raw`, and never leaves the machine. The one
// on-disk write is oauth-refresh.mjs renewing the credentials file itself —
// its natural home, same place Claude Code writes it.

import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { refreshIfExpiring } from "../oauth-refresh.mjs";

// Unofficial endpoints Claude's clients use for account/plan/rate-limit meters.
const PROFILE_ENDPOINT = "https://api.anthropic.com/api/oauth/profile";
const USAGE_ENDPOINT = "https://api.anthropic.com/api/oauth/usage";

function credentialsPath(configDir) {
  return path.join(configDir ?? path.join(homedir(), ".claude"), ".credentials.json");
}

// Read the OAuth credentials object. Throws with a token-free message on any
// problem. Returns { token, subscriptionType, rateLimitTier } — the plan fields
// are best-effort (null when absent); only the token is required.
async function readCredentials(configDir) {
  let raw;
  try {
    raw = await readFile(credentialsPath(configDir), "utf8");
  } catch {
    throw new Error(`no Claude credentials file in ${configDir ?? "~/.claude"}`);
  }
  let json;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new Error("Claude credentials file is not valid JSON");
  }
  const oauth = json?.claudeAiOauth;
  const token = oauth?.accessToken;
  if (typeof token !== "string" || token.length === 0) {
    throw new Error("no OAuth access token in Claude credentials");
  }
  return {
    token,
    subscriptionType:
      typeof oauth.subscriptionType === "string" ? oauth.subscriptionType : null,
    rateLimitTier:
      typeof oauth.rateLimitTier === "string" ? oauth.rateLimitTier : null,
  };
}

// GET an OAuth endpoint. Returns parsed JSON; throws a token-free error on a
// non-2xx status or a non-JSON body. The token rides only in the header.
async function fetchJson(url, token, label) {
  let res;
  try {
    res = await fetch(url, {
      headers: {
        authorization: `Bearer ${token}`,
        // Some deployments gate the OAuth surface behind this beta flag; it is
        // harmless when unneeded, so we always send it.
        "anthropic-beta": "oauth-2025-04-20",
        accept: "application/json",
      },
    });
  } catch (err) {
    throw new Error(`${label} endpoint unreachable (${err.code ?? "network error"})`);
  }
  if (!res.ok) {
    // Deliberately drop the body — it cannot help a user and might echo input.
    throw new Error(`${label} endpoint returned HTTP ${res.status}`);
  }
  try {
    return await res.json();
  } catch {
    throw new Error(`${label} endpoint returned a non-JSON body`);
  }
}

// Defensive scrub: drop any key that looks like a credential before we persist
// `raw`. The observed response carries no secrets, but the endpoint is
// unofficial and could add them without notice.
function stripSecrets(value) {
  if (Array.isArray(value)) return value.map(stripSecrets);
  if (value && typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (/token|secret|bearer|authorization|api[_-]?key|credential|password/i.test(k)) {
        continue;
      }
      out[k] = stripSecrets(v);
    }
    return out;
  }
  return value;
}

// A rate-limit window is any top-level object exposing a numeric `utilization`.
// Confirmed against the live endpoint, `utilization` is already a percentage
// (e.g. 77 == 77% consumed), NOT a 0..1 fraction — so it maps straight to the
// integer percent with no scaling. Inactive windows come back as null and are
// skipped.
function isWindow(value) {
  return (
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    typeof value.utilization === "number" &&
    Number.isFinite(value.utilization)
  );
}

// Fetch the account's profile + rate-limit windows and map each window to a
// plan-limit snapshot for /api/limits. The snapshots carry the descriptive
// account email; the server attributes them to the authenticated member.
//
// Throws on any failure — the caller is responsible for downgrading that to a
// warning so it never fails the run.
export async function snapshot({ today, configDir } = {}) {
  const date = today ?? new Date().toISOString().slice(0, 10);
  const dir = configDir ?? path.join(homedir(), ".claude");
  // Idle profiles (kept only for limit tracking) never get their token
  // refreshed by Claude Code itself — renew it here or the snapshot dies
  // ~8h after the last login. Best-effort: a failed refresh falls through
  // to the existing token, which then fails with the usual warning.
  try {
    await refreshIfExpiring(dir);
  } catch {
    /* fall through to whatever token is on disk */
  }
  const { token, subscriptionType, rateLimitTier } = await readCredentials(configDir);

  const profile = await fetchJson(PROFILE_ENDPOINT, token, "profile");
  const accountEmail = profile?.account?.email;
  if (typeof accountEmail !== "string" || accountEmail.length === 0) {
    throw new Error("profile response had no account.email");
  }
  // One email can hold several plans (e.g. a personal Max subscription AND a
  // Team premium seat). Each login context reports one organization — carry it
  // so snapshots from different plans of the same account stay distinct.
  const organization =
    typeof profile?.organization?.name === "string"
      ? profile.organization.name
      : "";
  // rate_limit_tier lives on the profile's organization; fall back to the value
  // cached in the credentials file if the profile shape drops it.
  const tier =
    (typeof profile?.organization?.rate_limit_tier === "string"
      ? profile.organization.rate_limit_tier
      : null) ?? rateLimitTier;

  const usage = await fetchJson(USAGE_ENDPOINT, token, "usage");

  const snapshots = [];
  if (usage && typeof usage === "object") {
    for (const [window, value] of Object.entries(usage)) {
      if (!isWindow(value)) continue;
      snapshots.push({
        date,
        accountEmail,
        organization,
        window,
        utilizationPct: Math.max(0, Math.round(value.utilization)),
        subscriptionType,
        rateLimitTier: tier,
        resetsAt: typeof value.resets_at === "string" ? value.resets_at : null,
        raw: stripSecrets(value),
      });
    }
  }

  if (snapshots.length === 0) {
    throw new Error("usage response contained no rate-limit windows");
  }
  return snapshots;
}

// Snapshot every configured Claude config dir. One account may be logged in
// from several dirs (or a dir may be logged out) — failures are collected per
// dir, and duplicate logins (same email AND same organization from two dirs)
// keep the first hit. The same email under different organizations is two
// distinct plans (e.g. personal Max + Team premium seat) and both are kept.
// Returns { snapshots, warnings }. Throws only if EVERY dir failed.
export async function snapshotAll({ today, configDirs } = {}) {
  const dirs = configDirs?.length ? configDirs : [null];
  const snapshots = [];
  const warnings = [];
  const seenLogins = new Set();
  for (const dir of dirs) {
    try {
      const snaps = await snapshot({ today, configDir: dir });
      const login = `${snaps[0]?.accountEmail ?? ""}|${snaps[0]?.organization ?? ""}`;
      if (login !== "|" && seenLogins.has(login)) continue; // same login twice
      seenLogins.add(login);
      snapshots.push(...snaps);
    } catch (err) {
      warnings.push(`${dir ?? "~/.claude"}: ${err.message}`);
    }
  }
  if (snapshots.length === 0) {
    throw new Error(warnings.join("; ") || "no Claude accounts found");
  }
  return { snapshots, warnings };
}
