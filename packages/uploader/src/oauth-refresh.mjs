// Refresh an expiring Claude OAuth access token in place.
//
// Why: a secondary CLAUDE_CONFIG_DIR profile (kept only so token-forest can
// track that plan's limits) is never used by Claude Code itself, so its
// access token expires (~8h) and limit snapshots die until a manual
// re-login. Claude Code refreshes its own token on use via the public OAuth
// client's token endpoint — we do the same for idle profiles.
//
// This is the ONE place the uploader WRITES inside a Claude config dir. The
// refresh token rotates on every exchange, so losing the write means the
// profile needs a manual re-login — hence the atomic tmp+rename and the
// mtime guard (if Claude Code touched the file while we were exchanging,
// its version wins and we discard ours). Like the usage endpoints in
// claude-limits.mjs this is an unofficial contract: any failure must warn,
// never abort the run. Token values are never logged.

import { readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

// Claude Code's public OAuth client (PKCE — the id is not a secret).
const CLIENT_ID = "9d1c250a-e61b-44d9-88ed-5944d1962f5e";
const TOKEN_ENDPOINT = "https://console.anthropic.com/v1/oauth/token";

// Refresh when the token has less than this long to live: hourly cron runs
// then keep the token perpetually valid instead of letting it lapse for up
// to an hour between runs.
const REFRESH_MARGIN_MS = 15 * 60 * 1000;

// Refresh the profile's access token if it is expired or about to expire.
// Returns "fresh" (nothing to do), "refreshed", or throws with a token-free
// message. Callers treat a throw exactly like any other credentials problem.
export async function refreshIfExpiring(configDir) {
  const file = path.join(configDir, ".credentials.json");
  const raw = await readFile(file, "utf8");
  const { mtimeMs } = await stat(file);
  const creds = JSON.parse(raw);
  const oauth = creds?.claudeAiOauth;
  if (typeof oauth?.refreshToken !== "string" || oauth.refreshToken.length === 0) {
    throw new Error("no OAuth refresh token in Claude credentials");
  }
  if (
    typeof oauth.expiresAt === "number" &&
    oauth.expiresAt - Date.now() > REFRESH_MARGIN_MS
  ) {
    return "fresh";
  }

  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "refresh_token",
      refresh_token: oauth.refreshToken,
      client_id: CLIENT_ID,
    }),
  });
  if (!res.ok) {
    throw new Error(`OAuth token refresh failed (HTTP ${res.status})`);
  }
  const body = await res.json();
  if (typeof body?.access_token !== "string") {
    throw new Error("OAuth token refresh returned no access token");
  }
  oauth.accessToken = body.access_token;
  if (typeof body.refresh_token === "string") oauth.refreshToken = body.refresh_token;
  if (typeof body.expires_in === "number") {
    oauth.expiresAt = Date.now() + body.expires_in * 1000;
  }

  // If Claude Code wrote the file while we were exchanging, its (newer)
  // credentials win — ours would clobber a live rotation. Our exchanged
  // token pair is simply dropped; the next run sees a fresh file.
  const after = await stat(file);
  if (after.mtimeMs !== mtimeMs) return "fresh";

  const tmp = path.join(configDir, `.credentials.json.tmp-${process.pid}`);
  try {
    await writeFile(tmp, JSON.stringify(creds), { mode: 0o600 });
    await rename(tmp, file);
  } catch (err) {
    await unlink(tmp).catch(() => {});
    throw new Error(
      `refreshed OAuth token could not be saved (${err?.code ?? "write error"}) — re-login may be needed`,
    );
  }
  return "refreshed";
}
