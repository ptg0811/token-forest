import { rateFamily } from "@/lib/pricing";

function assert(cond: boolean, msg: string) {
  if (!cond) { console.error("FAIL:", msg); process.exit(1); }
  console.log("ok:", msg);
}

// codex 모델명은 gptCodex로.
assert(rateFamily("gpt-5.3-codex", "codex") === "gptCodex", "gpt-5.3-codex -> gptCodex");
assert(rateFamily("gpt-5.3-codex-high-fast", "codex") === "gptCodex", "codex-high-fast -> gptCodex");
// codex CLI가 gpt-5.5를 쓰면 gpt55.
assert(rateFamily("gpt-5.5", "codex") === "gpt55", "gpt-5.5 -> gpt55");
// 빈 모델(model breakdown 없음)인 codex 행은 sonnet이 아니라 gpt5로 fallback.
assert(rateFamily("", "codex") === "gpt5", "empty codex model -> gpt5 (not sonnet)");
// 다른 툴은 여전히 sonnet fallback (over-broaden 방지 가드).
assert(rateFamily("", "cursor") === "sonnet", "empty cursor model -> sonnet (unchanged)");

console.log("ALL PASS");
