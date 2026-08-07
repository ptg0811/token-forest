"use client";

import { useState } from "react";

// 글 딥링크(`/knowhow#<postId>`)를 클립보드에 복사. 링크로 들어오면 해당 글로
// 스크롤되고(article id + scroll-margin) PostBody가 자동 펼침한다.
export default function ShareButton({ postId }: { postId: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    const url = `${window.location.origin}/knowhow#${postId}`;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // 클립보드 권한 없거나 비-보안 컨텍스트: 프롬프트로 폴백.
      window.prompt("링크 복사:", url);
      return;
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <button onClick={copy} className="text-xs text-[var(--accent)]">
      {copied ? "복사됨 ✓" : "공유 링크 복사"}
    </button>
  );
}
