// Parser for Codex CLI session rollouts (~/.codex/sessions/**/rollout-*.jsonl).
//
// Token usage arrives as CUMULATIVE snapshots:
//   { type:"event_msg", timestamp, payload:{ type:"token_count",
//     info:{ total_token_usage:{ input_tokens, cached_input_tokens, output_tokens } } } }
// The active model is the most recent `turn_context.model` line. We diff the
// running total so repeated/streaming snapshots add nothing and a reset (total
// drops) rebaselines. `input_tokens` INCLUDES cached, so non-cache input =
// input_tokens − cached_input_tokens. Codex exposes no cache-write metric.
//
// Sibling of claude-code.mjs — same { tool, aggregate } contract.

import { createReadStream } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { createInterface } from "node:readline";
import { kstDate, kstHour } from "../lib/kst.mjs";

export const tool = "codex";

function num(v) {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

// Fold ONE rollout file's parsed JSON lines into a flat list of delta events:
//   { date, hour, model, inputTokens, cacheReadTokens, outputTokens, cacheCreationTokens }
// One event per counted (non-zero) cumulative delta. Pure — no I/O.
export function foldSession(lines) {
  let model = "";
  let started = false;
  const prev = { input: 0, cached: 0, output: 0 };
  const events = [];

  for (const entry of lines) {
    if (entry?.type === "turn_context" && typeof entry.model === "string") {
      model = entry.model;
      continue;
    }
    if (entry?.type !== "event_msg" || entry?.payload?.type !== "token_count") continue;
    const info = entry.payload.info?.total_token_usage;
    const ts = entry.timestamp;
    if (!info || !ts) continue;
    const parsed = new Date(ts);
    if (Number.isNaN(parsed.getTime())) continue;

    const totInput = num(info.input_tokens);
    const totCached = num(info.cached_input_tokens);
    const totOutput = num(info.output_tokens);

    // Reset detection is PER-FIELD and independent: a field dropping below its
    // own baseline rebaselines only that field to 0. Fields are coerced to 0
    // when absent (see `num`), so a snapshot that simply omits one field (e.g.
    // no cached_input_tokens) must not force a full-total rebaseline — that
    // would re-count everything already attributed and double-count.
    const baseInput = !started || totInput < prev.input ? 0 : prev.input;
    const baseCached = !started || totCached < prev.cached ? 0 : prev.cached;
    const baseOutput = !started || totOutput < prev.output ? 0 : prev.output;
    started = true;

    const dInput = totInput - baseInput;
    const dCached = totCached - baseCached;
    const dOutput = totOutput - baseOutput;
    prev.input = totInput;
    prev.cached = totCached;
    prev.output = totOutput;

    if (dInput === 0 && dCached === 0 && dOutput === 0) continue;

    events.push({
      date: kstDate(ts),
      hour: kstHour(ts),
      model,
      inputTokens: Math.max(0, dInput - dCached), // input_tokens includes cached
      cacheReadTokens: dCached,
      outputTokens: dOutput,
      cacheCreationTokens: 0,
    });
  }
  return events;
}

// Merge per-file event lists (each = foldSession output for one rollout) into
// daily rows and an hourly mirror. sessions = number of files with activity on
// a given day, attached to that day's FIRST row only (consumers SUM sessions).
export function assembleRows(fileEvents, machineId = "") {
  const days = new Map();   // `${date}|${model}` -> acc
  const hours = new Map();  // `${hour}|${model}` -> acc
  const sessionsByDay = new Map(); // date -> count of files active that day

  fileEvents.forEach((events) => {
    const daysTouched = new Set();
    for (const e of events) {
      daysTouched.add(e.date);
      const dk = `${e.date}|${e.model}`;
      let d = days.get(dk);
      if (!d) {
        d = { date: e.date, model: e.model, inputTokens: 0, outputTokens: 0,
              cacheReadTokens: 0, cacheCreationTokens: 0, requests: 0 };
        days.set(dk, d);
      }
      d.inputTokens += e.inputTokens;
      d.outputTokens += e.outputTokens;
      d.cacheReadTokens += e.cacheReadTokens;
      d.cacheCreationTokens += e.cacheCreationTokens;
      d.requests += 1;

      const hk = `${e.hour}|${e.model}`;
      let h = hours.get(hk);
      if (!h) {
        h = { hour: e.hour, model: e.model, inputTokens: 0, outputTokens: 0,
              cacheReadTokens: 0, cacheCreationTokens: 0, requests: 0 };
        hours.set(hk, h);
      }
      h.inputTokens += e.inputTokens;
      h.outputTokens += e.outputTokens;
      h.cacheReadTokens += e.cacheReadTokens;
      h.cacheCreationTokens += e.cacheCreationTokens;
      h.requests += 1;
    }
    for (const date of daysTouched) {
      sessionsByDay.set(date, (sessionsByDay.get(date) ?? 0) + 1);
    }
  });

  const rows = [...days.values()]
    .sort((a, b) =>
      a.date === b.date ? a.model.localeCompare(b.model) : a.date.localeCompare(b.date))
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
          ? sessionsByDay.get(acc.date) ?? 0
          : null,
      source: "uploader",
    }));

  const hourlyRows = [...hours.values()]
    .sort((a, b) =>
      a.hour === b.hour ? a.model.localeCompare(b.model) : a.hour.localeCompare(b.hour))
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

  return { rows, hourlyRows };
}

function sessionsRoot() {
  return path.join(homedir(), ".codex", "sessions");
}

async function* rolloutFiles(dir) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return; // missing ~/.codex/sessions → nothing to scan
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* rolloutFiles(full);
    } else if (entry.isFile() && entry.name.startsWith("rollout-") && entry.name.endsWith(".jsonl")) {
      yield full;
    }
  }
}

// Same { rows, hourlyRows, stats } contract as claude-code.mjs.
export async function aggregate({ sinceDate, machineId = "" } = {}) {
  const stats = { files: 0, linesRead: 0, malformed: 0, events: 0 };
  const sinceMs = sinceDate ? Date.parse(`${sinceDate}T00:00:00Z`) : 0;
  const fileEvents = [];

  for await (const file of rolloutFiles(sessionsRoot())) {
    if (sinceMs) {
      try {
        if ((await stat(file)).mtimeMs < sinceMs) continue;
      } catch {
        continue;
      }
    }
    stats.files++;
    const lines = [];
    const rl = createInterface({
      input: createReadStream(file, { encoding: "utf8" }),
      crlfDelay: Infinity,
    });
    for await (const line of rl) {
      if (!line) continue;
      stats.linesRead++;
      try {
        lines.push(JSON.parse(line));
      } catch {
        stats.malformed++;
      }
    }
    const events = foldSession(lines).filter((e) => !sinceDate || e.date >= sinceDate);
    stats.events += events.length;
    if (events.length) fileEvents.push(events);
  }

  const { rows, hourlyRows } = assembleRows(fileEvents, machineId);
  return { rows, hourlyRows, stats };
}
