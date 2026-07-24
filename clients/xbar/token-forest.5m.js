#!/usr/bin/env node
// token-forest — xbar/SwiftBar plugin. 5분마다 /api/me/summary 조회.
// 설정: 환경변수 TOKEN_FOREST_URL, TOKEN_FOREST_TOKEN (또는 아래 상수 편집).
const URL_BASE = process.env.TOKEN_FOREST_URL || "https://<your-ingest-host>";
const TOKEN = process.env.TOKEN_FOREST_TOKEN || "";
// 대시보드는 보통 사내 주소(Tailscale 등)로 따로 서빙된다 — 공개 수집 호스트에선
// /me 가 차단(403)되므로 링크 목적지만 분리한다. 미설정 시 URL_BASE 사용.
const DASHBOARD_URL = process.env.TOKEN_FOREST_DASHBOARD_URL || URL_BASE;

function line(text, opts = {}) {
  const parts = Object.entries(opts).map(([k, v]) => `${k}=${JSON.stringify(String(v))}`);
  console.log(parts.length ? `${text} | ${parts.join(" ")}` : text);
}

async function main() {
  if (!TOKEN) { line("🌰 —"); line("---"); line("토큰 미설정: TOKEN_FOREST_TOKEN"); return; }
  let s;
  try {
    const res = await fetch(`${URL_BASE}/api/me/summary`, {
      headers: { Authorization: `Bearer ${TOKEN}` },
    });
    if (!res.ok) { line("🌲 ⚠️"); line("---"); line(`HTTP ${res.status}`); return; }
    s = await res.json();
  } catch (e) {
    line("🌲 ⚠️"); line("---"); line(`오프라인: ${e.message}`); return;
  }
  const g = s.growth;
  const fire = g.streakDays >= 3 ? ` 🔥${g.streakDays}` : g.idleDays >= 3 ? ` 💤${g.idleDays}` : "";
  // 메뉴바 라인
  line(`${g.stageEmoji} Lv${g.level}${fire}`);
  line("---");
  line(`${g.stageLabel} · ${g.gp} GP${g.toNextStage != null ? ` (다음 ${g.toNextStage})` : ""}`);
  if (g.nextMilestone) line(`다음 ${g.nextMilestone.label}까지 ${g.nextMilestone.remaining}`, { color: "#3E8E5A" });
  line(`활동 ${g.activeDays}일 · 최고 🔥${g.bestStreak} · 효율 +${g.efficiencyBonusToday}`);
  line("---");
  for (const l of s.limits || []) {
    line(`${l.account} ${l.window}: ${l.utilizationPct}%${l.resetsAt ? ` · 리셋 ${String(l.resetsAt).slice(5, 10)}` : ""}`);
  }
  line("---");
  for (const m of s.machines || []) line(`${m.machineId} · ${m.lastActive}`);
  line("---");
  line("숲 열기", { href: `${DASHBOARD_URL}/me` });
}
main();
