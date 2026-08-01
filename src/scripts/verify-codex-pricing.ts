import { rateFamily } from "@/lib/pricing";
import { toolLabel, toolSlot } from "@/app/_lib/ui";

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

// codex는 대시보드에서 고유 라벨·고유 색 슬롯을 가져야 한다(Copilot과 색 충돌 방지).
assert(toolLabel("codex") === "Codex", "toolLabel codex -> Codex");
assert(toolSlot("codex") !== toolSlot("copilot"), "codex slot != copilot slot");

console.log("ALL PASS");
