import Link from "next/link";
import {
  formatCompact,
  RANGE_PRESETS,
  toolColor,
  toolLabel,
  type NumStyle,
} from "@/app/_lib/ui";

export function Card({
  title,
  hint,
  children,
  className = "",
}: {
  title?: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-xl border border-black/10 bg-[var(--surface-1)] p-4 dark:border-white/10 ${className}`}
    >
      {title && (
        <header className="mb-3 flex items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">{title}</h2>
          {hint && <span className="text-xs text-[var(--text-muted)]">{hint}</span>}
        </header>
      )}
      {children}
    </section>
  );
}

export function StatTile({
  label,
  value,
  sub,
  numStyle = "kr",
}: {
  label: string;
  value: string | number;
  sub?: string;
  numStyle?: NumStyle;
}) {
  return (
    <div className="rounded-xl border border-black/10 bg-[var(--surface-1)] p-4 dark:border-white/10">
      <div className="text-xs text-[var(--text-secondary)]">{label}</div>
      <div className="mt-1 text-3xl font-semibold tracking-tight text-[var(--text-primary)]">
        {typeof value === "number" ? formatCompact(value, numStyle) : value}
      </div>
      {sub && <div className="mt-1 text-xs text-[var(--text-muted)]">{sub}</div>}
    </div>
  );
}

// Period selector rendered as links so it works without client JS. `base` is
// the pathname to preserve (e.g. "/" or "/members/3").
export function RangeTabs({ days, base = "/" }: { days: number; base?: string }) {
  return (
    <div className="inline-flex rounded-lg border border-black/10 p-0.5 text-xs dark:border-white/10">
      {RANGE_PRESETS.map((p) => {
        const active = p.days === days;
        return (
          <Link
            key={p.days}
            href={`${base}?days=${p.days}`}
            className={`rounded-md px-3 py-1.5 transition-colors ${
              active
                ? "bg-[var(--series-1)] font-medium text-white"
                : "text-[var(--text-secondary)] hover:bg-black/5 dark:hover:bg-white/5"
            }`}
          >
            {p.label}
          </Link>
        );
      })}
    </div>
  );
}

export function ToolChip({ tool }: { tool: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-black/10 px-2 py-0.5 text-xs text-[var(--text-secondary)] dark:border-white/10">
      <span
        className="inline-block h-2 w-2 rounded-sm"
        style={{ background: toolColor(tool) }}
      />
      {toolLabel(tool)}
    </span>
  );
}

export function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex min-h-[160px] flex-col items-center justify-center rounded-lg border border-dashed border-black/15 p-6 text-center text-sm text-[var(--text-muted)] dark:border-white/15">
      {message}
    </div>
  );
}

export function PageHeader({
  title,
  children,
}: {
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
      <h1 className="text-xl font-semibold tracking-tight text-[var(--text-primary)]">
        {title}
      </h1>
      {children}
    </div>
  );
}
