export const dynamic = "force-dynamic";

import { getAllMembers, getKnownTools } from "@/lib/queries";
import { PageHeader } from "@/app/_components/ui";
import ManualForms from "./ManualForms";

export default async function ManualPage() {
  const [members, tools] = await Promise.all([getAllMembers(), getKnownTools()]);

  return (
    <div>
      <PageHeader title="수동 입력" />
      {members.length === 0 ? (
        <div className="rounded-lg border border-dashed border-black/15 p-6 text-sm text-[var(--text-muted)] dark:border-white/15">
          등록된 구성원이 없습니다. 먼저 구성원을 추가한 뒤(<code>pnpm member</code>) 수동 입력을
          사용하세요.
        </div>
      ) : (
        <ManualForms members={members} tools={tools} />
      )}
    </div>
  );
}
