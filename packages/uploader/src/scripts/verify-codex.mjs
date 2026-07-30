// Unit tests for the codex parser's pure core (foldSession). Run with node.
import { foldSession, assembleRows } from "../parsers/codex.mjs";

let pass = 0, fail = 0;
function check(label, cond) {
  if (cond) { pass++; } else { fail++; console.error(`FAIL: ${label}`); }
}
function eq(label, a, b) { check(`${label} (got ${JSON.stringify(a)})`, JSON.stringify(a) === JSON.stringify(b)); }

// helper: build a token_count line with cumulative totals
const tc = (ts, input, cached, output) => ({
  type: "event_msg",
  timestamp: ts,
  payload: { type: "token_count", info: {
    total_token_usage: { input_tokens: input, cached_input_tokens: cached, output_tokens: output },
  } },
});
const ctx = (model) => ({ type: "turn_context", payload: { model } });

// 1. Two cumulative snapshots, same model/day: diffs are attributed, input excludes cached.
{
  const ev = foldSession([
    ctx("gpt-5.5"),
    tc("2026-06-26T02:00:00Z", 100, 0, 10),
    tc("2026-06-26T02:05:00Z", 250, 50, 30),
  ]);
  eq("two snapshots -> 2 events", ev.length, 2);
  eq("e1 input", ev[0].inputTokens, 100);
  eq("e1 cacheRead", ev[0].cacheReadTokens, 0);
  eq("e1 output", ev[0].outputTokens, 10);
  eq("e1 model", ev[0].model, "gpt-5.5");
  eq("e1 date", ev[0].date, "2026-06-26");
  // delta in=150, cached=50 -> input=100, cacheRead=50, output=20
  eq("e2 input (excl cached)", ev[1].inputTokens, 100);
  eq("e2 cacheRead", ev[1].cacheReadTokens, 50);
  eq("e2 output", ev[1].outputTokens, 20);
}

// 2. Repeated identical snapshot adds nothing.
{
  const ev = foldSession([
    ctx("gpt-5.5"),
    tc("2026-06-26T02:00:00Z", 100, 0, 10),
    tc("2026-06-26T02:00:01Z", 100, 0, 10),
  ]);
  eq("repeated snapshot -> 1 event", ev.length, 1);
}

// 3. Reset (total drops) starts a fresh baseline and counts the full new total.
{
  const ev = foldSession([
    ctx("gpt-5.5"),
    tc("2026-06-26T02:00:00Z", 200, 0, 20),
    tc("2026-06-26T03:00:00Z", 50, 0, 5), // new session/compaction reset
  ]);
  eq("reset -> 2 events", ev.length, 2);
  eq("reset e2 input full", ev[1].inputTokens, 50);
}

// 4. Model switch via turn_context attributes the later delta to the new model.
{
  const ev = foldSession([
    ctx("gpt-5.5"),
    tc("2026-06-26T02:00:00Z", 100, 0, 10),
    ctx("gpt-5.3-codex"),
    tc("2026-06-26T02:05:00Z", 180, 0, 25),
  ]);
  eq("e2 model switched", ev[1].model, "gpt-5.3-codex");
}

// 5. KST day boundary: 15:00Z + 9h crosses to next KST day.
{
  const ev = foldSession([
    ctx("gpt-5.5"),
    tc("2026-06-26T15:00:00Z", 100, 0, 10),
  ]);
  eq("KST boundary date", ev[0].date, "2026-06-27");
  eq("KST hour", ev[0].hour, "2026-06-27T00");
}

// 6. Malformed timestamp is skipped without crashing.
{
  const ev = foldSession([
    ctx("gpt-5.5"),
    tc("not-a-date", 100, 0, 10),
    tc("2026-06-26T02:05:00Z", 200, 0, 20),
  ]);
  eq("malformed timestamp skipped -> 1 event", ev.length, 1);
  eq("malformed timestamp: surviving event input", ev[0].inputTokens, 200);
}

// 7. Partial-field drop (a field missing from a snapshot) must not force a
// full-total rebaseline of the other fields, which would double-count them.
{
  const ev = foldSession([
    ctx("gpt-5.5"),
    tc("2026-06-26T02:00:00Z", 100, 50, 10),
    {
      type: "event_msg",
      timestamp: "2026-06-26T02:05:00Z",
      payload: { type: "token_count", info: {
        total_token_usage: { input_tokens: 150, output_tokens: 15 }, // cached_input_tokens omitted
      } },
    },
  ]);
  eq("partial-field drop -> 2 events", ev.length, 2);
  // cached drops 50 -> 0 (missing), so only `cached` rebaselines to 0; input/output
  // keep their real baselines (100/10). dInput=50, dCached=0, dOutput=5.
  eq("partial-field drop: outputTokens delta not double-counted", ev[1].outputTokens, 5);
  eq("partial-field drop: inputTokens not re-counting full total", ev[1].inputTokens, 50);
  eq("partial-field drop: cacheReadTokens", ev[1].cacheReadTokens, 0);
}

// assembleRows: merge per-file event lists into daily rows + hourly mirror.
{
  const fileA = [
    { date: "2026-06-26", hour: "2026-06-26T02", model: "gpt-5.5",
      inputTokens: 100, cacheReadTokens: 0, outputTokens: 10, cacheCreationTokens: 0 },
    { date: "2026-06-26", hour: "2026-06-26T02", model: "gpt-5.5",
      inputTokens: 50, cacheReadTokens: 20, outputTokens: 5, cacheCreationTokens: 0 },
  ];
  const fileB = [
    { date: "2026-06-26", hour: "2026-06-26T09", model: "gpt-5.5",
      inputTokens: 30, cacheReadTokens: 0, outputTokens: 3, cacheCreationTokens: 0 },
  ];
  const { rows, hourlyRows } = assembleRows([fileA, fileB], "test-host");

  eq("one daily row (same date|model)", rows.length, 1);
  eq("row tool", rows[0].tool, "codex");
  eq("row input summed", rows[0].inputTokens, 180);
  eq("row cacheRead summed", rows[0].cacheReadTokens, 20);
  eq("row output summed", rows[0].outputTokens, 18);
  eq("row requests = events", rows[0].requests, 3);
  eq("row machineId", rows[0].machineId, "test-host");
  eq("row source", rows[0].source, "uploader");
  // two files active that day -> sessions = 2, on the (only/first) row
  eq("sessions = distinct files that day", rows[0].sessions, 2);
  // hourly mirror keeps the two hours distinct
  eq("two hourly rows", hourlyRows.length, 2);
}

console.log(fail === 0 ? `ALL PASS (${pass})` : `FAILED ${fail}/${pass + fail}`);
process.exit(fail === 0 ? 0 : 1);
