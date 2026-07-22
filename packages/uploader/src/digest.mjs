// Build yesterday's work-digest DRAFT locally and POST it to the server.
//
// Trust contract (see docs/superpowers/specs/2026-07-19-daily-digest-design.md):
// the draft is private to the member until they explicitly share it from /me.
// What leaves this machine is TOPIC-LEVEL material only — session titles
// (`ai-title` records), git commit subjects, and touched file paths. The
// uploader NEVER reads or transmits conversation content (user/assistant
// records): transcript files are scanned line-by-line and only lines that are
// `ai-title` records are ever parsed. A secret-pattern scrub additionally
// drops any suspicious line from both the summary and the raw materials.
//
// The summary itself is generated with the member's own Claude account via
// `claude -p` (Haiku, once per day at most — a server-side existence check
// prevents duplicate LLM calls across machines). If that fails for any reason
// the raw material bullets are uploaded as the draft instead.
//
// Everything here is best-effort: buildAndSendDigest never throws — it returns
// { uploaded: true } | { skipped: reason } | { failed: message } and the
// caller downgrades failures to a single warning line.

import { execFile } from "node:child_process";
import { statSync } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const CLAUDE_MODEL = "claude-haiku-4-5-20251001";
// Generous: `claude -p` cold-starts a whole session before answering.
const CLAUDE_TIMEOUT_MS = 120_000;
const GIT_TIMEOUT_MS = 10_000;

// Server-side digestPayloadSchema caps — respected here so a large day still
// produces a valid payload instead of a 400.
const MAX_CONTENT_CHARS = 4000;
const MAX_MATERIALS_CHARS = 8000;
const MAX_REPOS = 20;
const MAX_COMMITS_PER_REPO = 20;
const MAX_FILES_PER_REPO = 100;
const MAX_FILE_PATH_CHARS = 500;
const MAX_REPO_NAME_CHARS = 200;

const PROMPT =
  "아래는 내가 어제 한 작업의 재료(세션 제목·git 커밋 제목)다. " +
  "재료가 적어도 추가 정보를 요구하지 말고 있는 것만으로 정리하라. " +
  "커밋 제목들을 뭉뚱그리지 말고 작업 묶음(기능·이슈 단위)별로 나눠서 " +
  "각각 무엇을 했고 어떤 결과가 나왔는지 쓰라. 코드·시크릿·토큰·URL·" +
  "파일 경로 원문은 인용하지 마라. 마크다운(**굵게** 등)은 쓰지 마라 — " +
  "표시 환경이 마크다운을 렌더링하지 않는다. 정확히 다음 형식으로만 " +
  "출력하라(다른 말 금지):\n" +
  "[프로젝트별 작업]\n" +
  "■ {프로젝트/리포명}\n" +
  "- {작업 묶음}: 한 일과 결과를 1문장으로 (프로젝트당 2~6개 불릿, " +
  "재료가 1건뿐이면 1개)\n" +
  "(재료에 등장하는 프로젝트마다 위 블록 반복, 최대 8개)\n" +
  "🚧 막힌 것: 재료에서 리뷰 대기·차단 흔적이 보이면 후보를 적고, " +
  "없으면 '(없음 — 있으면 직접 적어주세요)'";

const NO_BLOCKERS = "🚧 막힌 것: (없음 — 있으면 직접 적어주세요)";

// Secret-looking tokens: API keys (sk-), token-forest ingest tokens (tmk_),
// GitHub tokens, AWS access key ids, long hex (SHAs double as this, so commit
// hashes never leak either), and long base64 blobs. A match removes the WHOLE
// line — better to lose a bullet than to ship a secret.
const SECRET_LINE_RE =
  /\b(sk-[A-Za-z0-9-]{8,}|tmk_[a-f0-9]{8,}|ghp_[A-Za-z0-9]{8,}|github_pat_[A-Za-z0-9_]{8,}|AKIA[A-Z0-9]{12,}|[A-Fa-f0-9]{40,}|[A-Za-z0-9+/=]{60,})\b/;

// Drop every line containing a secret-looking token.
export function scrub(text) {
  return String(text)
    .split("\n")
    .filter((line) => !SECRET_LINE_RE.test(line))
    .join("\n");
}

function localYmd(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function isDir(p) {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
}

// Decode a Claude projects/ directory name back to a filesystem path.
// The encoding maps both "/" and literal "-" to "-" ("-home-caleb-token-forest"
// could be /home/caleb/token-forest or /home/caleb/token/meter), so we resolve
// the ambiguity by EXISTENCE: try segment joins depth-first, preferring "/"
// (the common case), and return the first candidate that is a real directory.
// Returns null when nothing on disk matches (deleted project, other machine).
export function resolveProjectPath(encoded) {
  if (!encoded.startsWith("-")) return null;
  const segs = encoded.slice(1).split("-");
  // Consecutive hyphens (empty segments) make the walk degenerate — treat as
  // unresolvable rather than probing malformed paths.
  if (segs.length === 0 || segs.includes("")) return null;
  let budget = 1000; // bound the walk; encoded names are short in practice
  const walk = (cur, i) => {
    if (budget-- <= 0) return null;
    if (i === segs.length) return isDir(cur) ? cur : null;
    // Start a new path component (naive "/" decode — preferred order).
    if (cur === "" || isDir(cur)) {
      const hit = walk(`${cur}/${segs[i]}`, i + 1);
      if (hit) return hit;
    }
    // Or the hyphen was literal, extending the current component.
    if (cur !== "" && !cur.endsWith("/")) {
      const hit = walk(`${cur}-${segs[i]}`, i + 1);
      if (hit) return hit;
    }
    return null;
  };
  return walk("", 0);
}

// Last ai-title record of a transcript file. Only lines that look like
// ai-title records are ever JSON.parsed — conversation records (user/
// assistant) are never inspected, per the trust contract.
async function lastAiTitle(file) {
  let raw;
  try {
    raw = await readFile(file, "utf8");
  } catch {
    return null;
  }
  const lines = raw.split("\n");
  for (let i = lines.length - 1; i >= 0; i--) {
    if (!lines[i].includes('"ai-title"')) continue;
    try {
      const rec = JSON.parse(lines[i]);
      if (rec?.type === "ai-title" && typeof rec.aiTitle === "string" && rec.aiTitle.trim()) {
        return rec.aiTitle.trim();
      }
    } catch {
      // malformed line — keep scanning upward
    }
  }
  return null;
}

// Scan each config dir's projects/ for transcript files modified inside
// [start, end) (yesterday, local time) and collect the latest session title
// per file plus the decoded project directory. Returns
// [{ encoded, resolved, display, titles: string[] }] — resolved is null when
// no matching directory exists on disk (then git is skipped for it).
export async function collectMaterials({ configDirs, start, end }) {
  const byEncoded = new Map();
  for (const dir of configDirs ?? []) {
    let entries;
    try {
      entries = await readdir(path.join(dir, "projects"), { withFileTypes: true });
    } catch {
      continue; // no projects dir in this profile
    }
    for (const ent of entries) {
      if (!ent.isDirectory()) continue;
      const projDir = path.join(dir, "projects", ent.name);
      let files;
      try {
        files = await readdir(projDir);
      } catch {
        continue;
      }
      let touched = false;
      const titles = [];
      for (const f of files) {
        if (!f.endsWith(".jsonl")) continue;
        const fp = path.join(projDir, f);
        let st;
        try {
          st = await stat(fp);
        } catch {
          continue;
        }
        if (st.mtimeMs < start.getTime() || st.mtimeMs >= end.getTime()) continue;
        touched = true;
        const title = await lastAiTitle(fp);
        if (title) titles.push(title);
      }
      if (!touched) continue;
      const cur = byEncoded.get(ent.name) ?? { encoded: ent.name, titles: new Set() };
      for (const t of titles) cur.titles.add(t);
      byEncoded.set(ent.name, cur);
    }
  }
  return [...byEncoded.values()].map((p) => {
    const resolved = resolveProjectPath(p.encoded);
    return {
      encoded: p.encoded,
      resolved,
      display: resolved ? path.basename(resolved) : p.encoded.replace(/^-+/, ""),
      titles: [...p.titles],
    };
  });
}

function git(args, cwd) {
  return new Promise((resolve, reject) => {
    execFile(
      "git",
      ["-C", cwd, ...args],
      { timeout: GIT_TIMEOUT_MS, maxBuffer: 10 * 1024 * 1024 },
      (err, stdout) => (err ? reject(err) : resolve(stdout)),
    );
  });
}

// `--pretty=format:%s --name-only` prints, per commit, the subject line then
// the touched paths, with a blank line between commits. Best-effort parse:
// first line of each blank-separated chunk is the subject, the rest are files.
function parseGitLog(out) {
  const subjects = [];
  const files = new Set();
  for (const chunk of String(out).split(/\n\s*\n/)) {
    const lines = chunk.split("\n").filter((l) => l.trim() !== "");
    if (lines.length === 0) continue;
    subjects.push(lines[0].trim());
    for (const f of lines.slice(1)) files.add(f.trim().slice(0, MAX_FILE_PATH_CHARS));
  }
  return { subjects, files: [...files] };
}

// Yesterday's own commits per repo. Repos are deduped by `git rev-parse
// --show-toplevel` so several project dirs inside one repo (or worktree
// checkouts listed separately) count once. Submodules are enumerated and
// queued as repos of their own — a superproject log never shows their
// commits, which silently hid whole codebases. Author filter is the repo's
// effective `git config user.email`; a repo without one is skipped rather
// than reporting teammates' commits. Every git failure skips that repo only.
export async function collectGitActivity({ repoDirs, sinceLocal, untilLocal }) {
  const seenTops = new Set();
  const repos = [];
  const queue = [...(repoDirs ?? [])];
  while (queue.length > 0) {
    const dir = queue.shift();
    let top;
    try {
      top = (await git(["rev-parse", "--show-toplevel"], dir)).trim();
    } catch {
      continue; // not a git repo
    }
    if (!top) continue;
    // Dedupe by the COMMON git dir, not the working-tree path: a linked
    // worktree is a different toplevel over the same repository, and
    // counting it separately would duplicate every branch's commits.
    let key = top;
    try {
      key =
        (await git(
          ["rev-parse", "--path-format=absolute", "--git-common-dir"],
          top,
        )).trim() || top;
    } catch {
      /* old git — fall back to toplevel */
    }
    if (seenTops.has(key)) continue;
    seenTops.add(key);
    // Queue nested repos one level down (a child dir with its own .git) —
    // repos created inside a project but never registered as submodules are
    // otherwise invisible.
    try {
      const entries = await readdir(top, { withFileTypes: true });
      for (const e of entries) {
        if (!e.isDirectory() || e.name === ".git" || e.name === "node_modules") continue;
        const child = path.join(top, e.name);
        try {
          statSync(path.join(child, ".git")); // dir or gitfile — both count
          queue.push(child);
        } catch {
          /* not a repo */
        }
      }
    } catch {
      /* unreadable dir */
    }
    // Queue this repo's submodules. Paths come from .gitmodules directly —
    // `submodule foreach` aborts wholesale on a single malformed entry (e.g.
    // a path with no url), which would silently drop ALL submodules. Nested
    // submodules recurse naturally: each queued path reads its own
    // .gitmodules on its turn.
    try {
      const out = await git(
        ["config", "--file", ".gitmodules", "--get-regexp", String.raw`^submodule\..*\.path$`],
        top,
      );
      for (const line of out.split("\n")) {
        const rel = line.trim().split(/\s+/).slice(1).join(" ");
        if (!rel) continue;
        const p = path.join(top, rel);
        if (!seenTops.has(p)) queue.push(p);
      }
    } catch {
      /* no .gitmodules — superproject alone */
    }
    let email = "";
    try {
      email = (await git(["config", "user.email"], top)).trim();
    } catch {
      /* no user.email anywhere */
    }
    if (!email) continue;
    let out = "";
    try {
      out = await git(
        [
          "log",
          // ALL local branches, not just HEAD — yesterday's work often sits
          // on feature branches (or linked worktrees) that aren't checked
          // out here. Remote-only refs stay excluded on purpose.
          "--branches",
          // Merge commits print no file list, so the NEXT subject would be
          // misparsed as a touched file; they carry no material value anyway.
          "--no-merges",
          `--author=${email}`,
          `--since=${sinceLocal}`,
          `--until=${untilLocal}`,
          "--pretty=format:%s",
          "--name-only",
          "-n",
          "200",
        ],
        top,
      );
    } catch {
      continue;
    }
    const { subjects, files } = parseGitLog(out);
    if (subjects.length === 0) continue;
    repos.push({
      repo: path.basename(top).slice(0, MAX_REPO_NAME_CHARS),
      subjects: subjects.slice(0, MAX_COMMITS_PER_REPO),
      files: files.slice(0, MAX_FILES_PER_REPO),
    });
    if (repos.length >= MAX_REPOS) break;
  }
  return repos;
}

// Structured fallback when the LLM is unavailable: group the raw material
// lines by project so the draft still reads as "[프로젝트별 작업]", one
// sub-bullet per material item (same nesting as the LLM format).
function fallbackContent(materialsText) {
  const byProject = new Map();
  for (const line of String(materialsText).split("\n")) {
    const m = line.match(/^- \[(?:세션|커밋)\] ([^:]+): (.+)$/);
    if (!m) continue;
    const items = byProject.get(m[1]) ?? [];
    if (items.length < 8) items.push(m[2]);
    byProject.set(m[1], items);
  }
  const blocks = [...byProject.entries()].map(
    ([proj, items]) => `■ ${proj}\n${items.map((i) => `- ${i}`).join("\n")}`,
  );
  const body = blocks.length ? blocks.join("\n") : materialsText;
  return `[프로젝트별 작업]\n${body}\n\n${NO_BLOCKERS}`;
}

// Deterministic tally appended under the summary — the LLM never counts.
function statsLine(materialsText) {
  const lines = String(materialsText).split("\n");
  const sessions = lines.filter((l) => l.startsWith("- [세션]")).length;
  const commits = lines.filter((l) => l.startsWith("- [커밋]")).length;
  const projects = new Set(
    lines.map((l) => l.match(/^- \[(?:세션|커밋)\] ([^:]+):/)?.[1]).filter(Boolean),
  );
  return `📊 산출물: 프로젝트 ${projects.size}개 · 세션 ${sessions}개 · 커밋 ${commits}건`;
}

// Summarize the materials with the member's own Claude account (`claude -p`,
// Haiku). On ANY failure — binary missing, auth, rate limit, timeout, empty
// output — fall back to structured material bullets. Returns
// { content, fallback }; content always ends with the deterministic 📊 line.
export async function generateSummary({ materialsText, bin = "claude" }) {
  let body = null;
  try {
    const stdout = await new Promise((resolve, reject) => {
      const child = execFile(
        bin,
        ["-p", "--model", CLAUDE_MODEL],
        {
          timeout: CLAUDE_TIMEOUT_MS,
          maxBuffer: 1024 * 1024,
          // Neutral cwd: run from the project dir and claude loads that
          // project's CLAUDE.md/memory — slow, wasteful, and the summary
          // needs none of it.
          cwd: tmpdir(),
          // Some hosts have broken IPv6 routing; harmless elsewhere.
          env: {
            ...process.env,
            NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ""} --dns-result-order=ipv4first`.trim(),
          },
        },
        (err, out) => (err ? reject(err) : resolve(out)),
      );
      child.stdin?.on("error", () => {}); // EPIPE when spawn fails
      child.stdin?.end(`${PROMPT}\n\n${materialsText}`);
    });
    const text = String(stdout).trim();
    if (text) body = text;
  } catch {
    /* fall through to material bullets */
  }
  const fallback = body === null;
  if (fallback) body = fallbackContent(materialsText);
  return { content: `${body}\n\n${statsLine(materialsText)}`, fallback };
}

// Merge touched-file lists from the server draft with this machine's, capped
// to the payload schema limits.
function mergeTouchedFiles(serverFiles, localRepos) {
  const byRepo = new Map();
  for (const r of serverFiles ?? []) {
    byRepo.set(r.repo, new Set(r.files ?? []));
  }
  for (const r of localRepos) {
    const set = byRepo.get(r.repo) ?? new Set();
    for (const f of r.files) set.add(f);
    byRepo.set(r.repo, set);
  }
  return [...byRepo.entries()]
    .slice(0, MAX_REPOS)
    .map(([repo, files]) => ({ repo, files: [...files].slice(0, MAX_FILES_PER_REPO) }));
}

// Build yesterday's digest draft and send it. Never throws.
// Returns { date, uploaded: true } (fresh) or { date, merged: true } (this
// machine's material folded into another machine's draft),
//         { date, skipped: "exists" | "no-activity" | "immutable" },
//      or { date, failed: message } (message is token-free).
export async function buildAndSendDigest({
  serverUrl,
  token,
  configDirs,
  machineId = "machine",
  extraRepoDirs = [],
  claudeBin = "claude",
  now = new Date(),
}) {
  const base = String(serverUrl ?? "").replace(/\/+$/, "");
  const yesterdayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  const date = localYmd(yesterdayStart);

  // 1. Server draft lookup. Resolved (edited/shared/skipped) days are
  // immutable; an unedited draft that already includes THIS machine means
  // nothing to do; an unedited draft from another machine is a merge target
  // (its materials come back so we can re-summarize the union).
  let serverDraft = null;
  try {
    const res = await fetch(`${base}/api/digest?date=${date}`, {
      headers: { authorization: `Bearer ${token}` },
    });
    if (!res.ok) return { date, failed: `digest check returned HTTP ${res.status}` };
    const json = await res.json();
    if (json?.exists) {
      if (!json.mergeable) return { date, skipped: "immutable" };
      if ((json.machines ?? []).includes(machineId)) return { date, skipped: "exists" };
      serverDraft = json;
    }
  } catch (err) {
    return { date, failed: `digest check unreachable (${err?.code ?? err?.message ?? "error"})` };
  }

  // 2. Materials: session titles from transcripts modified since yesterday
  // 00:00 up to NOW — not just until midnight, so a session that ran past
  // midnight (its file's mtime is already "today") still contributes. With
  // the hourly cron this window adds at most a few minutes of today; on a
  // machine that was off overnight it may pull in this morning's work, which
  // the member can trim while reviewing. Same window for git commits.
  let projects = [];
  try {
    projects = await collectMaterials({ configDirs, start: yesterdayStart, end: now });
  } catch {
    projects = [];
  }
  // Repos are discovered from transcripts AND from the configured
  // digestRepos list — work done outside Claude Code (Cursor, plain
  // terminal) has no transcript, so commits there would otherwise be missed.
  let gitRepos = [];
  try {
    gitRepos = await collectGitActivity({
      repoDirs: [
        ...projects.map((p) => p.resolved).filter(Boolean),
        ...(extraRepoDirs ?? []),
      ],
      sinceLocal: `${localYmd(yesterdayStart)}T00:00:00`,
      untilLocal: now.toISOString(),
    });
  } catch {
    gitRepos = [];
  }

  const lines = [];
  for (const p of projects) for (const t of p.titles) lines.push(`- [세션] ${p.display}: ${t}`);
  for (const r of gitRepos) for (const s of r.subjects) lines.push(`- [커밋] ${r.repo}: ${s}`);
  if (lines.length === 0) return { date, skipped: "no-activity" };

  // 3. Scrub BEFORE the LLM sees the materials, and again on its output.
  const localMaterials = scrub(`[기기: ${machineId}]\n${lines.join("\n")}`);
  if (!localMaterials.replace(/^\[기기:.*$/m, "").trim()) {
    return { date, skipped: "no-activity" }; // all lines scrubbed
  }
  const materials = (
    serverDraft ? `${serverDraft.materials}\n\n${localMaterials}` : localMaterials
  ).slice(0, MAX_MATERIALS_CHARS);

  const { content: rawContent } = await generateSummary({
    materialsText: materials,
    bin: claudeBin,
  });
  let content = scrub(rawContent).trim().slice(0, MAX_CONTENT_CHARS);
  if (!content) content = NO_BLOCKERS; // scrub emptied the summary — still a valid draft

  const touchedFiles = mergeTouchedFiles(serverDraft?.touchedFiles, gitRepos);
  const machines = [...new Set([...(serverDraft?.machines ?? []), machineId])].slice(0, 8);

  // 4. Upload the draft. The server only ever creates/refreshes an UNEDITED
  // draft — an edited/shared/skipped day comes back as { skipped: true }.
  try {
    const res = await fetch(`${base}/api/digest`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ date, content, materials, touchedFiles, machines }),
    });
    if (!res.ok) return { date, failed: `digest upload failed (HTTP ${res.status})` };
    let json;
    try {
      json = await res.json();
    } catch {
      json = {};
    }
    if (json?.skipped) return { date, skipped: "immutable" };
    return serverDraft ? { date, merged: true } : { date, uploaded: true };
  } catch (err) {
    return { date, failed: `digest upload unreachable (${err?.code ?? err?.message ?? "error"})` };
  }
}
