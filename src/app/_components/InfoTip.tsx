"use client";
import { useId, useState } from "react";
import type { MetricInfo } from "@/lib/metric-info";

// 접근성 툴팁 — hover + 키보드 focus, aria-describedby 연결.
export function InfoTip({ info }: { info: MetricInfo }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const arrow = info.trend === "up" ? "↑ 목표" : info.trend === "down" ? "↓ 목표" : "방향 없음";
  return (
    <span className="relative inline-flex">
      <button
        type="button"
        aria-label={`${info.label} 설명`}
        aria-describedby={open ? id : undefined}
        className="ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full border border-[var(--border)] text-[10px] text-[var(--text-muted)] focus:outline focus:outline-2 focus:outline-[var(--accent)]"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
      >
        i
      </button>
      {open && (
        <span
          id={id}
          role="tooltip"
          className="absolute left-1/2 top-5 z-10 w-56 -translate-x-1/2 rounded-lg border border-[var(--border)] bg-[var(--surface-1)] p-2 text-[11px] leading-relaxed text-[var(--text-secondary)] shadow-lg"
        >
          <span className="block font-semibold text-[var(--text-primary)]">{info.label} <span className="font-normal text-[var(--text-muted)]">· {arrow}</span></span>
          <span className="mt-1 block">{info.meaning}</span>
          <span className="mt-1 block text-[var(--text-muted)]">{info.target}</span>
        </span>
      )}
    </span>
  );
}
