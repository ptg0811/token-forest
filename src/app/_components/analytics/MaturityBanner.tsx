import { STAGE_LABELS, type MaturityResult, type Axis } from "@/lib/maturity";

const AXIS_LABEL: Record<Axis, string> = {
  habit: "습관화", efficiency: "효율", skill: "숙련", breadth: "확장",
};

export default function MaturityBanner({ result }: { result: MaturityResult }) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-gradient-to-br from-[color-mix(in_srgb,var(--accent)_12%,var(--surface-1))] to-[var(--surface-1)] p-5">
      <div className="flex items-baseline justify-between">
        <h2 className="text-lg font-semibold text-[var(--text-primary)]">
          AI 사용 성숙도 — {result.overall}단계 {STAGE_LABELS[result.overall - 1]}
        </h2>
        <span className="text-xs text-[var(--text-muted)]">최근 28일 · 팀 단위</span>
      </div>
      <div className="mt-3 flex gap-1">
        {STAGE_LABELS.map((label, i) => {
          const n = i + 1;
          const on = n <= result.overall;
          const cur = n === result.overall;
          return (
            <div
              key={label}
              className={`flex-1 rounded-md py-1 text-center text-[10px] ${on ? "bg-[var(--accent)] text-white" : "bg-[var(--surface-2)] text-[var(--text-muted)]"} ${cur ? "outline outline-2 outline-[var(--accent-strong)]" : ""}`}
            >
              {n} {label}
            </div>
          );
        })}
      </div>
      <p className="mt-2 text-xs text-[var(--text-secondary)]">
        병목: <strong>{AXIS_LABEL[result.bottleneck]}</strong> · {result.nextCondition}
      </p>
      <p className="mt-1 text-[11px] text-[var(--text-muted)]">
        ※ 도구 <strong>사용</strong> 성숙도이며 배포 성과(DORA delivery)가 아닙니다.
      </p>
      <details className="mt-2 text-[11px] text-[var(--text-muted)]">
        <summary className="cursor-pointer select-none">이 단계란?</summary>
        <div className="mt-2 space-y-1">
          <p>업계 AI 채택 성숙도 모델(인식→도입→정착→체화→전환)을 팀 텔레메트리에 매핑했습니다. 종합 단계는 4축(습관·효율·숙련·확장) 중 <strong>가장 낮은 축</strong>이 정합니다 — &ldquo;가장 약한 기둥이 전체를 제약한다&rdquo;는 성숙도 정설입니다.</p>
          <p>단일 점수가 아니라 병목을 가리키는 단계입니다(SPACE: 생산성은 단일 지표로 환원 불가). 문턱값은 소표본 기준 v1이며 데이터가 쌓이면 조정합니다.</p>
          <p>근거: Stack Overflow 2025 개발자 조사(84% AI 사용) · Google DORA 2025 리포트 · AI adoption maturity 프레임워크.</p>
          <p className="font-medium text-[var(--text-primary)]">측정 한계</p>
          <ul className="list-disc space-y-1 pl-4">
            <li>&ldquo;창의성&rdquo; 자체는 측정할 수 없습니다 — 도구·모델 다양성과 신기능 채택 속도라는 범위의 넓이만 프록시로 봅니다.</li>
            <li>Copilot 등 토큰을 보고하지 않는 도구는 토큰 기반 지표에서 자동 제외됩니다(requests만 집계).</li>
            <li>세션 수는 Claude Code 업로더만 기록합니다 — 세션 깊이는 Claude Code 한정 지표입니다.</li>
            <li>캐시 적중률은 불필요한 재호출로도 부풀릴 수 있어 완전히 방어되지 않는 알려진 한계입니다.</li>
            <li>중앙값 차트의 음영(IQR)은 개인 특정 방지를 위해 활성 인원이 8명 이상인 주에만 표시됩니다.</li>
          </ul>
        </div>
      </details>
    </div>
  );
}
