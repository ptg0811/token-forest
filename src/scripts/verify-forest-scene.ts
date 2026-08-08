import { timeBand, hash32, treeLayout, pickAnimal, ornamentsFor, vitalityView } from "../lib/forest-scene";

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

// --- 마일스톤 장식 매핑 ---
const ALL_MS = [
  "streak_3", "streak_7", "streak_14", "streak_30", "streak_60",
  "active_days_10", "active_days_30", "active_days_100", "active_days_200", "active_days_365",
  "efficiency_7", "efficiency_30",
  "tools_2", "tools_3", "tools_4",
];
const full = ornamentsFor(ALL_MS);
assert(full.length === 15, `전 마일스톤 언락 → 15개 (got ${full.length})`);
const zoneCount = (z: string) => full.filter((o) => o.zone === z).length;
assert(zoneCount("air") === 5, `air 5개 (got ${zoneCount("air")})`);
assert(zoneCount("ground") === 5, `ground 5개 (got ${zoneCount("ground")})`);
assert(zoneCount("aura") === 2, `aura 2개 (got ${zoneCount("aura")})`);
assert(zoneCount("flora") === 3, `flora 3개 (got ${zoneCount("flora")})`);

// 결정성 — 입력 순서 뒤집어도 동일 출력
assert(
  JSON.stringify(ornamentsFor([...ALL_MS].reverse())) === JSON.stringify(full),
  "장식 매핑 입력순서 무관 — 동일 출력",
);

// zone별 index 0..k-1 연속
for (const z of ["air", "ground", "aura", "flora"]) {
  const idxs = full.filter((o) => o.zone === z).map((o) => o.index);
  assert(
    JSON.stringify(idxs) === JSON.stringify(idxs.map((_, i) => i)),
    `${z} index 0..k-1 연속 (got ${idxs})`,
  );
}

// 매핑에 없는 키·빈 배열 → 빈 리스트, 예외 없음
assert(ornamentsFor([]).length === 0, "빈 입력 → 빈 리스트");
assert(ornamentsFor(["bogus_9", "streak_999"]).length === 0, "미지 키 무시");

// 부분 언락 — 낮은 티어만
const partial = ornamentsFor(["streak_3", "streak_7", "tools_2"]);
assert(partial.length === 3, "부분 언락 3개");
assert(partial.filter((o) => o.zone === "air").length === 2, "air 2개(부분)");
assert(partial.find((o) => o.key === "streak_3")!.emoji === "🌸", "streak_3 = 🌸");
assert(partial.find((o) => o.key === "streak_7")!.motion === "orbit-wide", "streak_7 motion = orbit-wide");

// 활력 뷰
assert(vitalityView("dozing").sleepEmoji === "💤", "dozing → 💤");
assert(vitalityView("dozing").swayClass === "fs-vital-dozing", "dozing → dozing 클래스");
assert(vitalityView("lively").sleepEmoji === null, "lively → 💤 없음");
assert(vitalityView("lively").swayClass === "fs-vital-lively", "lively → lively 클래스");
assert(vitalityView("neutral").sleepEmoji === null && vitalityView("neutral").swayClass === "", "neutral → 빈 클래스·null");

console.log("ALL PASS");
