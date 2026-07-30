// Unit tests for the codex parser's pure core (foldSession). Run with node.
import { foldSession } from "../parsers/codex.mjs";

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
const ctx = (model) => ({ type: "turn_context", model });

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

console.log(fail === 0 ? `ALL PASS (${pass})` : `FAILED ${fail}/${pass + fail}`);
process.exit(fail === 0 ? 0 : 1);
