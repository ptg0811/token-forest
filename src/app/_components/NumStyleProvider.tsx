"use client";

import { createContext, useContext } from "react";
import { useRouter } from "next/navigation";
import { NUM_STYLE_COOKIE, type NumStyle } from "@/app/_lib/ui";

// Client half of the number-style preference. The layout (server) reads the
// tm_numfmt cookie and passes it as `initial`, so SSR and hydration agree;
// the toggle rewrites the cookie and refreshes so server components re-render
// with the new style too.
const NumStyleContext = createContext<NumStyle>("kr");

export function useNumStyle(): NumStyle {
  return useContext(NumStyleContext);
}

export function NumStyleProvider({
  initial,
  children,
}: {
  initial: NumStyle;
  children: React.ReactNode;
}) {
  return (
    <NumStyleContext.Provider value={initial}>{children}</NumStyleContext.Provider>
  );
}

function persistStyle(next: NumStyle) {
  document.cookie = `${NUM_STYLE_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
}

export function NumStyleToggle() {
  const router = useRouter();
  const style = useNumStyle();

  function setStyle(next: NumStyle) {
    if (next === style) return;
    persistStyle(next);
    router.refresh();
  }

  const options: Array<{ value: NumStyle; label: string }> = [
    { value: "kr", label: "만/억" },
    { value: "west", label: "K/M" },
  ];
  return (
    <div
      className="inline-flex rounded-lg border border-black/10 p-0.5 text-xs dark:border-white/10"
      title="숫자 축약 표기 (예: 5,487만 ↔ 54.9M)"
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => setStyle(o.value)}
          className={`rounded-md px-2 py-1 transition-colors ${
            style === o.value
              ? "bg-black/5 font-medium text-[var(--text-primary)] dark:bg-white/10"
              : "text-[var(--text-muted)] hover:bg-black/5 dark:hover:bg-white/5"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
