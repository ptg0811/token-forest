// Parser for Claude Code session transcripts (~/.claude/projects/**/*.jsonl).
//
// Each line is a JSON entry. Assistant turns carry token usage:
//   entry.type === "assistant"
//   entry.message.usage = {
//     input_tokens, output_tokens,
//     cache_read_input_tokens, cache_creation_input_tokens
//   }
//   entry.message.model, entry.message.id
//   entry.requestId, entry.timestamp (ISO), entry.sessionId
//
// Retries emit the same message.id under a fresh requestId, so a *fresh* line
// is a new billable request; true duplicates (identical message.id+requestId)
// are collapsed. Synthetic entries (model "<synthetic>", null usage) are noise.
//
// This module is deliberately self-contained: adding a codex parser later means
// dropping a sibling file that exports the same { tool, aggregate } shape.

import { createReadStream } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { createInterface } from "node:readline";
import { kstDate, kstHour } from "../lib/kst.mjs";

export const tool = "claude_code";

const SYNTHETIC_MODEL = "<synthetic>";

function projectsRoot() {
  return path.join(homedir(), ".claude", "projects");
}

// Recursively yield every *.jsonl path under ~/.claude/projects.
async function* jsonlFiles(dir) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return; // missing/unreadable dir → nothing to scan
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* jsonlFiles(full);
    } else if (entry.isFile() && entry.name.endsWith(".jsonl")) {
      yield full;
    }
  }
}

function num(v) {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

// Aggregate every transcript into daily rows keyed by (KST date, model).
// `sinceDate` is an inclusive "YYYY-MM-DD" lower bound; days before it are
// skipped. Returns { rows, stats }.
export async function aggregate({ sinceDate, machineId = "" } = {}) {
  // key `${date}|${model}` -> accumulator
  const days = new Map();
  // key `${hour}|${model}` -> accumulator (hour = "YYYY-MM-DDTHH", UTC). Same
  // counted entries as `days`, bucketed by hour for the additive usage_hourly
  // mirror. No sessions dimension — hourly rows carry token counts only.
  const hours = new Map();
  // dedup set of `${message.id}|${requestId}`
  const seen = new Set();
  // per-day distinct sessionIds
  const sessionsByDay = new Map();

  const stats = {
    files: 0,
    linesRead: 0,
    malformed: 0,
    assistantEntries: 0,
    synthetic: 0,
    duplicates: 0,
    counted: 0,
  };

  // Session files are append-only, so a file untouched since before the window
  // cannot contain in-window lines — skip it without parsing.
  const sinceMs = sinceDate ? Date.parse(`${sinceDate}T00:00:00Z`) : 0;

  for await (const file of jsonlFiles(projectsRoot())) {
    if (sinceMs) {
      try {
        if ((await stat(file)).mtimeMs < sinceMs) continue;
      } catch {
        continue;
      }
    }
    stats.files++;
    const rl = createInterface({
      input: createReadStream(file, { encoding: "utf8" }),
      crlfDelay: Infinity,
    });
    for await (const line of rl) {
      if (!line) continue;
      stats.linesRead++;
      let entry;
      try {
        entry = JSON.parse(line);
      } catch {
        stats.malformed++;
        continue; // skip malformed lines silently
      }

      const message = entry?.message;
      const usage = message?.usage;
      if (entry?.type !== "assistant" || !usage) continue;
      stats.assistantEntries++;

      const model = message.model ?? "";
      if (model === SYNTHETIC_MODEL) {
        stats.synthetic++;
        continue;
      }

      const dedupKey = `${message.id ?? ""}|${entry.requestId ?? ""}`;
      if (seen.has(dedupKey)) {
        stats.duplicates++;
        continue;
      }
      seen.add(dedupKey);

      const ts = entry.timestamp;
      if (!ts) continue;
      const parsed = new Date(ts);
      if (Number.isNaN(parsed.getTime())) continue;
      const date = kstDate(ts); // KST YYYY-MM-DD
      if (sinceDate && date < sinceDate) continue;
      const hour = kstHour(ts); // KST YYYY-MM-DDTHH

      stats.counted++;

      const inputTokens = num(usage.input_tokens);
      const outputTokens = num(usage.output_tokens);
      const cacheReadTokens = num(usage.cache_read_input_tokens);
      const cacheCreationTokens = num(usage.cache_creation_input_tokens);

      const key = `${date}|${model}`;
      let acc = days.get(key);
      if (!acc) {
        acc = {
          date,
          model,
          inputTokens: 0,
          outputTokens: 0,
          cacheReadTokens: 0,
          cacheCreationTokens: 0,
          requests: 0,
        };
        days.set(key, acc);
      }
      acc.inputTokens += inputTokens;
      acc.outputTokens += outputTokens;
      acc.cacheReadTokens += cacheReadTokens;
      acc.cacheCreationTokens += cacheCreationTokens;
      acc.requests += 1;

      const hourKey = `${hour}|${model}`;
      let hacc = hours.get(hourKey);
      if (!hacc) {
        hacc = {
          hour,
          model,
          inputTokens: 0,
          outputTokens: 0,
          cacheReadTokens: 0,
          cacheCreationTokens: 0,
          requests: 0,
        };
        hours.set(hourKey, hacc);
      }
      hacc.inputTokens += inputTokens;
      hacc.outputTokens += outputTokens;
      hacc.cacheReadTokens += cacheReadTokens;
      hacc.cacheCreationTokens += cacheCreationTokens;
      hacc.requests += 1;

      if (entry.sessionId) {
        let set = sessionsByDay.get(date);
        if (!set) {
          set = new Set();
          sessionsByDay.set(date, set);
        }
        set.add(entry.sessionId);
      }
    }
  }

  // sessions is a per-day figure (distinct sessions active that day). Attach it
  // to only the FIRST model row of each day — consumers SUM sessions across
  // rows, and copying the day total onto every model row would multiply it by
  // the model count. (Same convention as the Anthropic org connector.)
  const rows = [...days.values()]
    .sort((a, b) =>
      a.date === b.date ? a.model.localeCompare(b.model) : a.date.localeCompare(b.date),
    )
    .map((acc, i, sorted) => ({
      date: acc.date,
      tool,
      model: acc.model,
      machineId,
      inputTokens: acc.inputTokens,
      outputTokens: acc.outputTokens,
      cacheReadTokens: acc.cacheReadTokens,
      cacheCreationTokens: acc.cacheCreationTokens,
      requests: acc.requests,
      sessions:
        i === 0 || sorted[i - 1].date !== acc.date
          ? sessionsByDay.get(acc.date)?.size ?? 0
          : null,
      source: "uploader",
    }));

  // Hour-grained mirror for usage_hourly (heatmap only). Same token counts as
  // `rows`, keyed by hour; no sessions (a per-day figure with no hourly analog).
  const hourlyRows = [...hours.values()]
    .sort((a, b) =>
      a.hour === b.hour ? a.model.localeCompare(b.model) : a.hour.localeCompare(b.hour),
    )
    .map((acc) => ({
      hour: acc.hour,
      tool,
      model: acc.model,
      machineId,
      inputTokens: acc.inputTokens,
      outputTokens: acc.outputTokens,
      cacheReadTokens: acc.cacheReadTokens,
      cacheCreationTokens: acc.cacheCreationTokens,
      requests: acc.requests,
      source: "uploader",
    }));

  return { rows, hourlyRows, stats };
}
