import { isEmailId, canClaim } from "@/lib/claim";

let pass = 0;
let fail = 0;
function check(label: string, cond: boolean) {
  if (cond) {
    pass++;
  } else {
    fail++;
    console.error(`FAIL: ${label}`);
  }
}

// isEmailId
check("isEmailId a@b true", isEmailId("a@b") === true);
check("isEmailId company email true", isEmailId("seonghyeonkim@renewearth-lab.com") === true);
check("isEmailId openai id false", isEmailId("user-IGeRPIPM0PRCMzlIu9O9mKGq") === false);
check("isEmailId github handle false", isEmailId("octocat") === false);
check("isEmailId trailing @ false", isEmailId("foo@") === false);

// canClaim: email must match viewer exactly (case-insensitive)
check(
  "coworker email blocked",
  canClaim("seonghyeonkim@renewearth-lab.com", "cpo@renewearth-lab.com") === false,
);
check(
  "own email allowed",
  canClaim("cpo@renewearth-lab.com", "cpo@renewearth-lab.com") === true,
);
check(
  "own email case-insensitive allowed",
  canClaim("CPO@Renewearth-Lab.com", "cpo@renewearth-lab.com") === true,
);
check(
  "other personal email blocked (strict)",
  canClaim("someone@gmail.com", "cpo@renewearth-lab.com") === false,
);

// canClaim: non-email ids always allowed
check("openai id allowed", canClaim("user-IGeRPIPM0PRCMzlIu9O9mKGq", "cpo@renewearth-lab.com") === true);
check("github handle allowed", canClaim("octocat", "cpo@renewearth-lab.com") === true);

// canClaim: empty viewer email — email blocked, non-email still allowed
check("email with empty viewer blocked", canClaim("a@b.com", "") === false);
check("non-email with empty viewer allowed", canClaim("octocat", "") === true);

console.log(`PASS=${pass} FAIL=${fail}`);
process.exit(fail === 0 ? 0 : 1);
