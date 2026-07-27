// Stable pseudonymous device identity: a random UUID persisted OUTSIDE the
// uploader/ folder so a reinstall keeps it. Hostname is NEVER used or sent.
import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

const ID_PATH = path.join(homedir(), ".token-forest", "device-id");

export function deviceId() {
  try {
    const existing = readFileSync(ID_PATH, "utf8").trim();
    if (existing) return existing;
  } catch {
    // not created yet
  }
  const id = randomUUID();
  try {
    mkdirSync(path.dirname(ID_PATH), { recursive: true });
    // Exclusive create so concurrent runs (SessionEnd + hourly launchd) can't
    // clobber each other; the loser re-reads the winner's id below.
    writeFileSync(ID_PATH, id + "\n", { mode: 0o600, flag: "wx" });
    return id;
  } catch (err) {
    if (err && err.code === "EEXIST") {
      try {
        const won = readFileSync(ID_PATH, "utf8").trim();
        if (won) return won;
      } catch {
        // fall through to ephemeral
      }
    }
    console.error(`warn: could not persist device-id (${err.message}); using ephemeral id`);
    return id;
  }
}
