import { timeBand, hash32, treeLayout, pickAnimal } from "../lib/forest-scene";

function assert(cond: boolean, msg: string) {
  if (!cond) { console.error("FAIL:", msg); process.exit(1); }
  console.log("ok:", msg);
}

// 시간밴드 경계 (KST hour)
assert(timeBand(4) === "night", "04시 밤");
assert(timeBand(5) === "dawn", "05시 새벽");
assert(timeBand(7) === "dawn", "07시 새벽");
assert(timeBand(8) === "day", "08시 낮");
assert(timeBand(16) === "day", "16시 낮");
assert(timeBand(17) === "dusk", "17시 노을");
assert(timeBand(19) === "dusk", "19시 노을");
assert(timeBand(20) === "night", "20시 밤");
assert(timeBand(23) === "night", "23시 밤");

// 배치: 결정성 + 입력 순서 무관 + GP 무상관(gp를 아예 안 받음 — 시그니처가 ids만)
const ids = ["m-aaa", "m-bbb", "m-ccc", "m-ddd", "m-eee"];
const l1 = treeLayout(ids);
const l2 = treeLayout([...ids].reverse());
assert(JSON.stringify(l1) === JSON.stringify(l2), "입력 순서 무관 — 같은 출력");
assert(JSON.stringify(treeLayout(ids)) === JSON.stringify(l1), "결정적 — 같은 입력 같은 출력");
assert(l1.length === 5 && new Set(l1.map((p) => p.id)).size === 5, "전원 배치");
assert(l1.every((p) => p.xPct >= 5 && p.xPct <= 95), `x 5~95% 범위 (got ${l1.map((p) => p.xPct)})`);
assert(l1.every((p) => p.swayDur >= 3.6 && p.swayDur <= 6.0), "sway 주기 3.6~6.0초");
assert(new Set(l1.map((p) => p.swayDur)).size >= 3, "주기 분산(전부 동일 아님)");
// x 좌표는 id 해시로만 결정 — 정렬 후 인접 간격이 슬롯 기반인지
const xs = l1.map((p) => p.xPct).sort((a, b) => a - b);
assert(xs.every((x, i) => i === 0 || x - xs[i - 1] > 3), "나무 겹침 없음(간격 >3%)");

// 동물: 시드 결정성 + 밴드별 후보군
assert(pickAnimal(7, "day") === pickAnimal(7, "day"), "같은 시드 같은 동물");
assert(["🐿️", "🐇"].includes(pickAnimal(0, "day")) && ["🐿️", "🐇"].includes(pickAnimal(1, "dawn")), "낮·새벽 = 🐿️/🐇");
assert(["🦌", "🦉"].includes(pickAnimal(0, "night")) && ["🦌", "🦉"].includes(pickAnimal(1, "night")), "밤 = 🦌/🦉");
assert(["🐿️", "🐇"].includes(pickAnimal(2, "dusk")), "노을 = 낮 후보군");

console.log("ALL PASS");
