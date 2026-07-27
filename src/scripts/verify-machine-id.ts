import { isOpaqueMachineId, anonymizeMachineId, deviceLabels } from "@/lib/machine-id";

let pass = 0, fail = 0;
function check(label: string, cond: boolean) {
  if (cond) pass++;
  else { fail++; console.error(`FAIL: ${label}`); }
}

const UUID = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";

// isOpaqueMachineId
check("uuid opaque", isOpaqueMachineId(UUID) === true);
check("dev_ opaque", isOpaqueMachineId("dev_abc123def456") === true);
check("hostname not opaque", isOpaqueMachineId("gildong-macbook") === false);
check("empty not opaque", isOpaqueMachineId("") === false);
check("dev_ + hostname NOT opaque", isOpaqueMachineId("dev_actual-hostname") === false);

// anonymizeMachineId
check("empty stays empty", anonymizeMachineId("") === "");
check("uuid unchanged", anonymizeMachineId(UUID) === UUID);
check("dev_ unchanged", anonymizeMachineId("dev_abc123def456") === "dev_abc123def456");
const h = anonymizeMachineId("gildong-macbook");
check("hostname -> dev_ token", /^dev_[0-9a-f]{12}$/.test(h));
check("deterministic", anonymizeMachineId("gildong-macbook") === h);
check("idempotent", anonymizeMachineId(h) === h);
check("distinct hosts distinct tokens", anonymizeMachineId("a-mac") !== anonymizeMachineId("b-mac"));
const dh = anonymizeMachineId("dev_myhost");
check("dev_hostname gets hashed", /^dev_[0-9a-f]{12}$/.test(dh) && dh !== "dev_myhost");

// deviceLabels
const m = deviceLabels([UUID, "dev_abc123def456", ""]);
check("labels non-empty as 기기 N", m.get(UUID)!.startsWith("기기 ") && m.get("dev_abc123def456")!.startsWith("기기 "));
check("empty labelled fallback", m.get("") === "(기기명 없음)");
check("stable: two non-empty get 기기 1 and 기기 2", new Set([m.get(UUID), m.get("dev_abc123def456")]).size === 2);

console.log(`PASS=${pass} FAIL=${fail}`);
process.exit(fail === 0 ? 0 : 1);
