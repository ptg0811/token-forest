"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/", label: "대시보드" },
  { href: "/team", label: "팀 분석" },
  { href: "/me", label: "내 사용량" },
  { href: "/members", label: "구성원" },
  { href: "/manual", label: "수동 입력" },
  { href: "/setup", label: "설치 안내" },
];

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function Nav() {
  const pathname = usePathname();
  return (
    <nav className="flex gap-1 text-sm">
      {NAV.map((item) => {
        const active = isActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={
              active
                ? "rounded-md bg-[var(--accent)]/15 px-3 py-1.5 font-medium text-[var(--accent-strong)] ring-1 ring-inset ring-[var(--accent)]/30"
                : "rounded-md px-3 py-1.5 text-[var(--text-secondary)] transition-colors hover:bg-black/5 hover:text-[var(--text-primary)] dark:hover:bg-white/5"
            }
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
