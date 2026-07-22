// Config resolution and CLI argument parsing.
//
// Precedence for server/token: CLI flags > env vars > config file.
//   flags:  --server <url>   --token <tok>
//   env:    TOKEN_FOREST_URL  TOKEN_FOREST_TOKEN
//   file:   ~/.config/token-forest/config.json  { "serverUrl", "token" }

import { readFile } from "node:fs/promises";
import { homedir, hostname } from "node:os";
import path from "node:path";

const DEFAULT_SINCE_DAYS = 30;

export function configPath() {
  return path.join(homedir(), ".config", "token-forest", "config.json");
}

// Normalize an identifier into a safe machineId: lowercase, keep [a-z0-9._-],
// collapse anything else to "-", and cap at 64 chars (the server's limit).
function sanitizeMachineId(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

// Default machineId: the local short hostname (domain stripped) so a member's
// uploads from different machines add up instead of overwriting each other.
export function defaultMachineId() {
  const short = String(hostname() || "").split(".")[0];
  return sanitizeMachineId(short);
}

export function parseArgs(argv) {
  const flags = {
    server: null,
    token: null,
    since: null,
    machineId: null,
    limits: true,
    dryRun: false,
    help: false,
    claudeDirs: undefined,
    limitsOnly: false,
    digest: true,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case "--server":
      case "--url":
        flags.server = argv[++i] ?? null;
        break;
      case "--token":
        flags.token = argv[++i] ?? null;
        break;
      case "--since":
        flags.since = argv[++i] ?? null;
        break;
      case "--machine-id":
        flags.machineId = argv[++i] ?? null;
        break;
      case "--claude-dir": {
        const v = argv[++i];
        if (!v) throw new Error("--claude-dir requires a path");
        (flags.claudeDirs ??= []).push(v);
        break;
      }
      case "--limits-only":
        flags.limitsOnly = true;
        break;
      case "--no-limits":
        flags.limits = false;
        break;
      case "--no-digest":
        flags.digest = false;
        break;
      case "--dry-run":
        flags.dryRun = true;
        break;
      case "-h":
      case "--help":
        flags.help = true;
        break;
      default:
        if (arg.startsWith("--server=")) flags.server = arg.slice(9);
        else if (arg.startsWith("--token=")) flags.token = arg.slice(8);
        else if (arg.startsWith("--since=")) flags.since = arg.slice(8);
        else if (arg.startsWith("--machine-id=")) flags.machineId = arg.slice(13);
        else throw new Error(`unknown argument: ${arg}`);
    }
  }
  return flags;
}

async function readConfigFile() {
  try {
    const raw = await readFile(configPath(), "utf8");
    const json = JSON.parse(raw);
    return {
      serverUrl: typeof json.serverUrl === "string" ? json.serverUrl : null,
      token: typeof json.token === "string" ? json.token : null,
      claudeDirs: Array.isArray(json.claudeDirs)
        ? json.claudeDirs.filter((d) => typeof d === "string")
        : null,
      // Digest drafts are on by default; only an explicit `"digest": false`
      // opts a machine out (trust contract: the off switch must exist).
      digest: json.digest === false ? false : true,
      // Extra git repos to include in the digest — work done OUTSIDE Claude
      // Code (Cursor, plain terminal) leaves no transcript, so its commits
      // are invisible unless the repo is listed here.
      digestRepos: Array.isArray(json.digestRepos)
        ? json.digestRepos.filter((d) => typeof d === "string")
        : [],
    };
  } catch {
    return { serverUrl: null, token: null, claudeDirs: null, digest: true, digestRepos: [] };
  }
}

// Claude config dirs to snapshot limits from. A member juggling several Claude
// accounts/plans keeps one CLAUDE_CONFIG_DIR per login; listing them here
// tracks every login's limits at once. Precedence: flags > env > config file
// (the file form survives cron/hook runs, which get a minimal environment).
// Default: the standard ~/.claude only.
export function resolveClaudeDirs(flagDirs, fileDirs) {
  const fromEnv = (process.env.TOKEN_FOREST_CLAUDE_DIRS ?? "")
    .split(/[,:]/)
    .map((s) => s.trim())
    .filter(Boolean);
  const chosen = flagDirs?.length
    ? flagDirs
    : fromEnv.length
      ? fromEnv
      : (fileDirs ?? []);
  const dirs = chosen.map((d) =>
    d.startsWith("~") ? path.join(homedir(), d.slice(1)) : d,
  );
  const defaults = [path.join(homedir(), ".claude")];
  // Always include the default dir; extra dirs add logins, never replace.
  return [...new Set([...defaults, ...dirs])];
}

// Convert a "--since" value into an inclusive YYYY-MM-DD lower bound.
// Precedence: --since flag > TOKEN_FOREST_SINCE env > N days ago (UTC).
// The env form lets an admin set a team-wide tracking epoch (backfill start)
// without every member typing a flag.
export function resolveSince(sinceFlag, days = DEFAULT_SINCE_DAYS) {
  const explicit = sinceFlag ?? process.env.TOKEN_FOREST_SINCE ?? null;
  if (explicit) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(explicit)) {
      throw new Error(`since must be YYYY-MM-DD, got: ${explicit}`);
    }
    return explicit;
  }
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

// Merge flags, env, and config file into the effective settings.
export async function resolveConfig(flags) {
  const file = await readConfigFile();
  const serverUrl =
    flags.server ?? process.env.TOKEN_FOREST_URL ?? file.serverUrl ?? null;
  const token =
    flags.token ?? process.env.TOKEN_FOREST_TOKEN ?? file.token ?? null;
  const machineIdOverride =
    flags.machineId ?? process.env.TOKEN_FOREST_MACHINE_ID ?? null;
  return {
    serverUrl: serverUrl ? serverUrl.replace(/\/+$/, "") : null,
    token,
    since: resolveSince(flags.since),
    machineId: machineIdOverride
      ? sanitizeMachineId(machineIdOverride)
      : defaultMachineId(),
    limits: flags.limits !== false,
    claudeDirs: resolveClaudeDirs(flags.claudeDirs, file.claudeDirs),
    limitsOnly: Boolean(flags.limitsOnly),
    // Daily digest RETIRED 2026-07-20 — the server answers 410, so never build
    // drafts. digest.mjs and the flag/config plumbing are kept intact; to
    // revive, restore this to:
    //   flags.digest !== false && file.digest !== false
    // (and restore the /api/digest handlers from git history).
    digest: false,
    digestRepos: (file.digestRepos ?? []).map((d) =>
      d.startsWith("~") ? path.join(homedir(), d.slice(1)) : d,
    ),
  };
}
