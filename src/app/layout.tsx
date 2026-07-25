import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import Image from "next/image";
import Banner from "@/app/_components/onboarding/Banner";
import Nav from "@/app/_components/Nav";
import {
  NumStyleProvider,
  NumStyleToggle,
} from "@/app/_components/NumStyleProvider";
import { getNumStyle } from "@/app/_lib/numfmt";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Tokenizer",
  description: "Tokenizer (Powered by RELAX) — 구성원별 AI 도구 토큰 사용량·도입률 분석",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const numStyle = await getNumStyle();
  return (
    <html
      lang="ko"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full">
        <NumStyleProvider initial={numStyle}>
          <header className="sticky top-0 z-10 border-b border-[var(--border)] bg-[var(--surface-1)]/90 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] backdrop-blur">
            <div className="mx-auto flex max-w-6xl items-center gap-6 px-6 py-3">
              <Link href="/" className="flex items-center gap-2.5" aria-label="Tokenizer — 홈">
                <Image
                  src="/tokenizer-emblem.png"
                  alt=""
                  width={32}
                  height={32}
                  className="h-8 w-8 rounded-md border border-[var(--border)] bg-[var(--surface-2)] object-contain p-0.5"
                  priority
                />
                <span className="flex flex-col leading-none">
                  <span className="text-[15px] font-bold uppercase tracking-[0.18em] text-[var(--text-primary)]">
                    Tokenizer
                  </span>
                  <span className="mt-0.5 text-[9px] font-medium uppercase tracking-[0.14em] text-[var(--signal)]/80">
                    Powered by RELAX
                  </span>
                </span>
              </Link>
              <Nav />
              <div className="ml-auto">
                <NumStyleToggle />
              </div>
            </div>
          </header>
          <div className="mx-auto max-w-6xl px-6">
            <Banner />
          </div>
          <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
        </NumStyleProvider>
      </body>
    </html>
  );
}
