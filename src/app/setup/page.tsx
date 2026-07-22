export const dynamic = "force-dynamic";

import type { Metadata } from "next";
import { Card, PageHeader } from "@/app/_components/ui";

export const metadata: Metadata = {
  title: "설치 안내 · Tokenizer",
  description: "개인 Claude Code 계정 사용량 업로더 설치 방법",
};

// Static walkthrough for non-developers: how to install the uploader, what it
// changes on their machine, how to remove it, and how to fix common problems.
// Mirrors the dashboard's card/token styling (see _components/ui).

const STEPS = [
  {
    n: "1",
    title: "Tailscale 초대 수락",
    body: "관리자에게 Tailscale 초대를 요청하세요(Slack). 초대 메일의 링크가 앱 설치와 로그인까지 자동으로 안내하며, 초대된 계정은 승인 절차 없이 바로 연결됩니다. 연결 후 이 대시보드가 열리면 성공입니다 — 이 페이지를 보고 있다면 이 단계는 이미 끝난 것입니다.",
  },
  {
    n: "2",
    title: "대시보드 접속",
    body: "브라우저에서 Tokenizer 대시보드를 엽니다. 접속이 되면 사내 네트워크 연결이 정상입니다.",
  },
  {
    n: "3",
    title: "/me 에서 내 명령 복사",
    body: "대시보드 우상단의 '내 명령'(/me) 페이지에서 나에게 발급된 설치 명령을 복사합니다. 명령에는 본인 전용 토큰이 들어 있으니 공유하지 마세요.",
  },
  {
    n: "4",
    title: "터미널에 붙여넣기",
    body: "macOS 는 터미널, Linux 는 셸을 열고 복사한 명령을 붙여넣어 실행합니다. 설치가 끝나면 한 번 자동 업로드되고 완료 안내가 표시됩니다. 이미 쓰고 있는 사람이 새 기기(맥미니 등)를 추가할 때도 같습니다 — /me 에 항상 표시되는 내 명령을 새 기기에서 한 번 더 실행하면 되고, 기기별 사용량은 자동 합산됩니다.",
  },
];

const CHANGES: { path: string; desc: string }[] = [
  {
    path: "~/.token-forest/uploader/",
    desc: "업로더 프로그램 본체(의존성 없는 Node 스크립트). 재설치 시 이 폴더만 지우고 다시 씁니다.",
  },
  {
    path: "~/.token-forest/run.sh",
    desc: "최근 3일치 사용량을 올리는 실행 래퍼. 훅·예약·수동 실행이 모두 이 파일을 호출합니다.",
  },
  {
    path: "~/.config/token-forest/config.json",
    desc: "서버 주소와 내 업로드 토큰(권한 0600). 다시 설치하면 덮어씁니다. 유지하려면 명령 끝에 --keep-config 를 붙이세요.",
  },
  {
    path: "~/.claude/settings.json",
    desc: "Claude Code 세션이 끝날 때 자동 업로드하도록 SessionEnd 훅 한 줄을 추가합니다. 기존 훅은 보존하며, 이미 있으면 중복 추가하지 않습니다.",
  },
  {
    path: "매시 정각 예약",
    desc: "macOS 는 ~/Library/LaunchAgents/com.token-forest.uploader.plist (launchd), Linux 는 crontab 에 '# token-forest-uploader' 표시가 붙은 한 줄을 등록합니다.",
  },
];

const REMOVE: { label: string; cmd: string }[] = [
  {
    label: "자동 예약 해제 (macOS)",
    cmd: "launchctl unload -w ~/Library/LaunchAgents/com.token-forest.uploader.plist\nrm ~/Library/LaunchAgents/com.token-forest.uploader.plist",
  },
  {
    label: "자동 예약 해제 (Linux)",
    cmd: "crontab -l | grep -v '# token-forest-uploader' | crontab -",
  },
  {
    label: "세션 종료 훅 제거",
    cmd: "~/.claude/settings.json 을 열어 command 에 '.token-forest/run.sh' 가 들어간 SessionEnd 항목을 지웁니다.",
  },
  {
    label: "프로그램·설정 삭제",
    cmd: "rm -rf ~/.token-forest ~/.config/token-forest",
  },
];

const TROUBLESHOOT: { q: string; a: React.ReactNode }[] = [
  {
    q: "\"Node.js 가 설치되어 있지 않습니다\" 라고 나와요",
    a: (
      <>
        업로더는 Node.js 18 이상이 필요합니다. macOS 는{" "}
        <code className="rounded bg-black/5 px-1 dark:bg-white/10">brew install node</code>,
        Linux 는 패키지 매니저(apt/dnf 등) 또는 <span className="whitespace-nowrap">nodejs.org</span>{" "}
        에서 설치한 뒤 명령을 다시 실행하세요.
      </>
    ),
  },
  {
    q: "훅이 잘 걸렸는지 확인하고 싶어요",
    a: (
      <>
        <code className="rounded bg-black/5 px-1 dark:bg-white/10">~/.claude/settings.json</code>{" "}
        의 <code className="rounded bg-black/5 px-1 dark:bg-white/10">hooks.SessionEnd</code> 에{" "}
        <code className="rounded bg-black/5 px-1 dark:bg-white/10">.token-forest/run.sh</code> 를
        호출하는 항목이 있으면 정상입니다. 직접 확인하려면{" "}
        <code className="rounded bg-black/5 px-1 dark:bg-white/10">~/.token-forest/run.sh</code> 를
        실행해 업로드 결과를 볼 수 있습니다.
      </>
    ),
  },
  {
    q: "업로드가 안 되는 것 같아요",
    a: (
      <>
        <code className="rounded bg-black/5 px-1 dark:bg-white/10">~/.token-forest/run.sh</code> 를
        터미널에서 직접 실행해 출력을 확인하세요. tailnet 연결과{" "}
        <code className="rounded bg-black/5 px-1 dark:bg-white/10">~/.config/token-forest/config.json</code>{" "}
        의 서버 주소·토큰이 올바른지 점검하면 됩니다. 여러 번 실행해도 서버가 중복을 합치므로 누적되지
        않습니다.
      </>
    ),
  },
  {
    q: "SSL 인증서 오류가 나요",
    a: (
      <>
        <strong>대시보드 서버 자체에서</strong> ts.net 주소를 열면 같은 서버의 다른
        서비스가 응답해 인증서 오류나 503이 날 수 있습니다 — 서버에서는{" "}
        <code className="rounded bg-black/5 px-1 dark:bg-white/10">http://localhost:4700</code> 을
        쓰세요. ts.net 주소는 <strong>다른 기기(노트북·맥미니)에서만</strong> 유효합니다. 다른
        기기에서도 인증서 오류가 나면 관리자가{" "}
        <span className="whitespace-nowrap">login.tailscale.com/admin/dns</span> 에서{" "}
        <strong>HTTPS Certificates</strong> 를 활성화해야 합니다 (첫 접속은 인증서 발급으로 몇 초
        걸릴 수 있습니다).
      </>
    ),
  },
  {
    q: "여러 기기(노트북·맥미니 등)를 쓰면 어떻게 되나요?",
    a: (
      <>
        각 기기에서 같은 설치 명령(/me 의 내 명령)을 한 번씩 실행하면 됩니다. 업로드는 기기별로
        저장되고 대시보드에서 <strong>자동 합산</strong>됩니다. 어떤 기기가 수집되고 있는지는{" "}
        <span className="whitespace-nowrap">/me 의 &lsquo;수집 중인 기기&rsquo;</span> 표에서
        기기 이름·마지막 수집일로 확인할 수 있습니다. 단, 표에는{" "}
        <strong>실제 사용 기록이 업로드된 기기만</strong> 나타납니다 — 설치만 하고 그 기기에서
        Claude Code 를 아직 쓰지 않았다면(예: 작업을 SSH 로 원격 서버에서 하는 경우) 표에 없는 것이
        정상이며, 그 기기에서 처음 사용한 뒤 자동으로 나타납니다. 참고로 설치 시 Claude Code 의
        세션 기록 보존기간을 자동 연장합니다(기본 30일 후 삭제 → 과거 사용량 소급 수집이 가능하도록).
      </>
    ),
  },
  {
    q: "설치하면 내 컴퓨터에 무엇이 생기나요?",
    a: (
      <ul className="space-y-2.5">
        {CHANGES.map((c) => (
          <li key={c.path} className="text-sm">
            <code className="rounded bg-black/5 px-1.5 py-0.5 font-mono text-[var(--text-primary)] dark:bg-white/10">
              {c.path}
            </code>
            <span className="mt-1 block text-[var(--text-secondary)]">{c.desc}</span>
          </li>
        ))}
      </ul>
    ),
  },
  {
    q: "Claude 계정을 여러 개 쓰는데 한도를 각각 볼 수 있나요?",
    a: (
      <>
        네. 계정을 번갈아 로그인해 쓰는 경우엔 자동으로 계정별로 나뉘어 기록됩니다(업로더가
        실행 시점에 로그인된 계정을 스냅샷). 여러 계정을 <strong>동시에</strong> 추적하려면
        계정별 CLAUDE_CONFIG_DIR 디렉터리를{" "}
        <code className="rounded bg-black/5 px-1 dark:bg-white/10">--claude-dir</code> 또는{" "}
        <code className="rounded bg-black/5 px-1 dark:bg-white/10">TOKEN_FOREST_CLAUDE_DIRS</code>
        로 지정하세요. 보조 프로필의 로그인 토큰은 업로더가 만료 전에{" "}
        <strong>자동으로 갱신</strong>하므로 한 번 로그인해 두면 재로그인이 필요 없습니다.
        게이지를 지금 갱신하려면{" "}
        <code className="rounded bg-black/5 px-1 dark:bg-white/10">
          ~/.token-forest/run.sh --limits-only
        </code>
        를 실행하면 됩니다.
      </>
    ),
  },
  {
    q: "개인 Claude 계정 사용량은 회사 집계에서 빼고 싶어요",
    a: (
      <>
        집계 경계는 <strong>프로필 단위</strong>입니다 — 사용량은{" "}
        <code className="rounded bg-black/5 px-1 dark:bg-white/10">~/.claude</code>(기본
        프로필)만 수집합니다. 개인 계정을 별도 프로필로 쓰면 자동으로 제외됩니다: 셸
        설정에{" "}
        <code className="rounded bg-black/5 px-1 dark:bg-white/10">
          alias claude-personal=&apos;CLAUDE_CONFIG_DIR=~/.claude-personal claude&apos;
        </code>{" "}
        를 추가하고 개인 작업은 <code className="rounded bg-black/5 px-1 dark:bg-white/10">claude-personal</code>{" "}
        로 실행하세요(최초 1회 로그인). 개인 플랜의 <strong>한도 게이지</strong>는 원할
        때만{" "}
        <code className="rounded bg-black/5 px-1 dark:bg-white/10">claudeDirs</code> 에
        그 프로필을 추가해 따로 켤 수 있습니다(사용량과 무관).{" "}
        <strong>
          주의: 같은 프로필에서 /login 으로 계정만 전환해 쓰면 세션 기록에 계정 구분이
          남지 않아 분리가 불가능합니다
        </strong>{" "}
        — 이 경우 모든 세션이 합산되고, 한도 스냅샷도 실행 시점에 로그인된 계정이
        찍힙니다.
      </>
    ),
  },
  {
    q: "설치 단계를 처음부터 다시 안내받고 싶어요",
    a: (
      <>
        내 사용량(<code className="rounded bg-black/5 px-1 dark:bg-white/10">/me</code>)에서
        온보딩 마법사가 다시 안내합니다. Claude Code 단계만 다시 열려면{" "}
        <code className="rounded bg-black/5 px-1 dark:bg-white/10">/me?step=claude_code</code>{" "}
        로 접속하세요. 설치가 감지되면 자동으로 완료 처리됩니다.
      </>
    ),
  },
  {
    q: "완전히 제거하려면?",
    a: (
      <ul className="space-y-3">
        {REMOVE.map((r) => (
          <li key={r.label}>
            <div className="text-sm font-medium text-[var(--text-primary)]">{r.label}</div>
            <pre className="mt-1 overflow-x-auto rounded-md border border-black/10 bg-black/[0.03] p-2.5 text-xs text-[var(--text-secondary)] dark:border-white/10 dark:bg-white/[0.04]">
              {r.cmd}
            </pre>
          </li>
        ))}
      </ul>
    ),
  },
];

export default function SetupPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="설치 안내" />

      <p className="max-w-2xl text-sm text-[var(--text-secondary)]">
        개인 Claude Code 계정의 토큰 사용량을 대시보드로 보내는 업로더를 설치합니다. 개발 지식 없이도
        아래 순서대로 명령 한 줄을 붙여넣으면 됩니다.
      </p>

      <Card title="설치 순서">
        <ol className="space-y-3">
          {STEPS.map((s) => (
            <li key={s.n} className="flex gap-3">
              <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--series-1)] text-xs font-semibold text-white">
                {s.n}
              </span>
              <div>
                <div className="text-sm font-medium text-[var(--text-primary)]">{s.title}</div>
                <div className="mt-0.5 text-sm text-[var(--text-secondary)]">{s.body}</div>
              </div>
            </li>
          ))}
        </ol>
      </Card>

      <Card title="자주 묻는 질문" hint="항목을 눌러 펼쳐 보세요">
        <div className="divide-y divide-black/5 dark:divide-white/5">
          {TROUBLESHOOT.map((t) => (
            <details key={t.q} className="group py-1">
              <summary className="flex cursor-pointer list-none items-center gap-2 rounded-md px-2 py-2.5 text-sm font-medium text-[var(--text-primary)] hover:bg-black/[0.03] dark:hover:bg-white/[0.04] [&::-webkit-details-marker]:hidden">
                <span className="text-xs text-[var(--text-muted)] transition-transform group-open:rotate-90">
                  ▶
                </span>
                {t.q}
              </summary>
              <div className="px-2 pt-1 pb-3 pl-7 text-sm text-[var(--text-secondary)]">{t.a}</div>
            </details>
          ))}
        </div>
      </Card>
    </div>
  );
}
