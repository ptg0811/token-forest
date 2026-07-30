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
// Sibling of claude-code.mjs — same { tool, aggregate } contract (aggregate
// lands in a follow-up task; this file currently only exports the pure fold
// core, foldSession).

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

    const totInput = num(info.input_tokens);
    const totCached = num(info.cached_input_tokens);
    const totOutput = num(info.output_tokens);

    // Reset detection: any field below the running baseline → rebaseline to 0.
    if (!started || totInput < prev.input || totOutput < prev.output || totCached < prev.cached) {
      prev.input = 0; prev.cached = 0; prev.output = 0;
    }
    started = true;

    const dInput = Math.max(0, totInput - prev.input);
    const dCached = Math.max(0, totCached - prev.cached);
    const dOutput = Math.max(0, totOutput - prev.output);
    prev.input = totInput; prev.cached = totCached; prev.output = totOutput;

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
