import "@/scripts/env";
// AX 리포트용 컨텍스트 수율 지표 덤프 (결정론적, LLM 없음).
//
//   pnpm ax-metrics
//
// 에이전틱 툴(claude_code·codex) 기준. 수율 = output / (input + cacheRead).
// 새 컨텍스트당 산출 = output / cacheCreation. 사람이 읽는 표 + 하단 JSON 블록을
// 출력한다(세션이 수치를 그대로 복사해 전사 오류를 막는 용도). 멤버 이름은 절대
// 출력하지 않는다 — 수율 분포·서명은 익명.
import { connectDb, closeDb, UsageDaily } from "@/lib/db";
import { addDays, todayKst } from "@/lib/date";

const TOOLS = ["claude_code", "codex"];

type Row = {
  date: string;
  memberId: unknown;
  inputTokens: number | null;
  outputTokens: number | null;
  cacheReadTokens: number | null;
  cacheCreationTokens: number | null;
  requests: number | null;
  sessions: number | null;
};

type Agg = { in: number; out: number; cRd: number; cCr: number; req: number; ses: number };
const empty = (): Agg => ({ in: 0, out: 0, cRd: 0, cCr: 0, req: 0, ses: 0 });
function add(a: Agg, r: Row) {
  a.in += r.inputTokens ?? 0;
  a.out += r.outputTokens ?? 0;
  a.cRd += r.cacheReadTokens ?? 0;
  a.cCr += r.cacheCreationTokens ?? 0;
  a.req += r.requests ?? 0;
  a.ses += r.sessions ?? 0;
}
const yieldPct = (a: Agg) => (a.cRd + a.in > 0 ? (a.out / (a.cRd + a.in)) * 100 : 0);
const ctxPerReqK = (a: Agg) => (a.req ? a.cRd / a.req / 1000 : 0);
const outPerReq = (a: Agg) => (a.req ? a.out / a.req : 0);
const outPerCCr = (a: Agg) => (a.cCr ? (a.out / a.cCr) * 100 : 0);
const reqPerSes = (a: Agg) => (a.ses ? a.req / a.ses : 0);
const r1 = (n: number) => Math.round(n * 10) / 10;
const r2 = (n: number) => Math.round(n * 100) / 100;

// 주 시작(월요일) YYYY-MM-DD.
function weekStart(ds: string): string {
  const dt = new Date(`${ds}T00:00:00Z`);
  const day = dt.getUTCDay();
  dt.setUTCDate(dt.getUTCDate() - ((day + 6) % 7));
  return dt.toISOString().slice(0, 10);
}

async function main() {
  await connectDb();
  const rows = (await UsageDaily.find(
    { tool: { $in: TOOLS } },
    {
      date: 1,
      memberId: 1,
      inputTokens: 1,
      outputTokens: 1,
      cacheReadTokens: 1,
      cacheCreationTokens: 1,
      requests: 1,
      sessions: 1,
    },
  ).lean()) as unknown as Row[];

  if (rows.length === 0) {
    console.log("데이터 없음 (agentic usage rows 0).");
    await closeDb();
    return;
  }

  const today = todayKst();

  // 주간 추세 (최근 12주).
  const wk = new Map<string, Agg>();
  for (const r of rows) {
    const w = weekStart(r.date);
    if (!wk.has(w)) wk.set(w, empty());
    add(wk.get(w)!, r);
  }
  const weeks = [...wk.entries()].sort().slice(-12).map(([w, a]) => ({
    week: w,
    yieldPct: r2(yieldPct(a)),
    ctxPerReqK: Math.round(ctxPerReqK(a)),
    outPerReq: Math.round(outPerReq(a)),
  }));

  // 팀 종합.
  const team = empty();
  for (const r of rows) add(team, r);

  // 기간 델타: 최근 7일 vs 직전 7일.
  const d7 = addDays(today, -7);
  const d14 = addDays(today, -14);
  const recent = empty();
  const prior = empty();
  for (const r of rows) {
    if (r.date >= d7 && r.date <= today) add(recent, r);
    else if (r.date >= d14 && r.date < d7) add(prior, r);
  }

  // 멤버 집계 (익명).
  const per = new Map<string, Agg>();
  for (const r of rows) {
    const k = String(r.memberId);
    if (!per.has(k)) per.set(k, empty());
    add(per.get(k)!, r);
  }
  const members = [...per.values()].map((a) => ({
    yieldPct: yieldPct(a),
    reqPerSes: reqPerSes(a),
    outPerReq: outPerReq(a),
    ctxPerReqK: ctxPerReqK(a),
    outPerCCr: outPerCCr(a),
  }));
  members.sort((x, y) => x.yieldPct - y.yieldPct);
  const lo = members[0];
  const hi = members[members.length - 1];
  const dist = members.map((m) => r2(m.yieldPct));
  const sig = (m: (typeof members)[number]) => ({
    reqPerSession: Math.round(m.reqPerSes),
    outPerReq: Math.round(m.outPerReq),
    ctxPerReqK: Math.round(m.ctxPerReqK),
    outPerCCrPct: r1(m.outPerCCr),
  });

  const out = {
    asOf: today,
    dateRange: {
      from: rows.map((r) => r.date).sort()[0],
      to: rows.map((r) => r.date).sort().slice(-1)[0],
    },
    memberCount: per.size,
    weekly: weeks,
    team: {
      yieldPct: r2(yieldPct(team)),
      ctxPerReqK: Math.round(ctxPerReqK(team)),
      outPerReq: Math.round(outPerReq(team)),
    },
    delta7d: {
      recentYieldPct: r2(yieldPct(recent)),
      priorYieldPct: r2(yieldPct(prior)),
      recentCtxPerReqK: Math.round(ctxPerReqK(recent)),
      priorCtxPerReqK: Math.round(ctxPerReqK(prior)),
      direction:
        yieldPct(recent) > yieldPct(prior) ? "개선" : yieldPct(recent) < yieldPct(prior) ? "악화" : "동일",
    },
    yieldDistributionAnon: dist,
    spread: {
      min: dist[0],
      max: dist[dist.length - 1],
      multiple: dist[0] > 0 ? r1(dist[dist.length - 1] / dist[0]) : null,
    },
    lowSignatureAnon: sig(lo),
    highSignatureAnon: sig(hi),
  };

  // 사람이 읽는 요약.
  console.log(`AX 지표 · 기준일 ${out.asOf} · 데이터 ${out.dateRange.from}~${out.dateRange.to} · 멤버 ${out.memberCount}\n`);
  console.log("주간 팀 수율 추세");
  console.log("week        yield%  ctx/req  out/req");
  for (const w of weeks) {
    console.log(`${w.week}  ${String(w.yieldPct).padStart(6)}  ${String(w.ctxPerReqK).padStart(6)}k  ${String(w.outPerReq).padStart(6)}`);
  }
  console.log(`\n팀 종합: 수율 ${out.team.yieldPct}%  ctx/req ${out.team.ctxPerReqK}k  out/req ${out.team.outPerReq}`);
  console.log(`델타(최근7일 vs 직전7일): ${out.delta7d.recentYieldPct}% vs ${out.delta7d.priorYieldPct}% → ${out.delta7d.direction}`);
  console.log(`\n멤버 수율 분포(익명, 오름차순): ${dist.join(", ")}`);
  console.log(`스프레드: ${out.spread.min}% ~ ${out.spread.max}% (${out.spread.multiple}배)`);
  console.log(`\n저수율 서명: 세션당요청 ${out.lowSignatureAnon.reqPerSession} · 턴당산출 ${out.lowSignatureAnon.outPerReq} · 턴당컨텍스트 ${out.lowSignatureAnon.ctxPerReqK}k · 새컨텍스트당산출 ${out.lowSignatureAnon.outPerCCrPct}%`);
  console.log(`고수율 서명: 세션당요청 ${out.highSignatureAnon.reqPerSession} · 턴당산출 ${out.highSignatureAnon.outPerReq} · 턴당컨텍스트 ${out.highSignatureAnon.ctxPerReqK}k · 새컨텍스트당산출 ${out.highSignatureAnon.outPerCCrPct}%`);

  console.log("\n=== JSON ===");
  console.log(JSON.stringify(out, null, 2));

  await closeDb();
}

main().catch(async (err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
  await closeDb();
});
