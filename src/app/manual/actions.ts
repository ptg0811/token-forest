"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getAllMembers, getMember } from "@/lib/queries";
import { registerIdentities, upsertUsageRows } from "@/lib/usage";
import type { UsageRow } from "@/lib/types";

// ---- single row -------------------------------------------------------------

const optionalInt = z
  .string()
  .trim()
  .transform((v) => (v === "" ? null : Number(v)))
  .refine((v) => v === null || (Number.isInteger(v) && v >= 0), "0 이상의 정수여야 합니다");

const singleRowSchema = z
  .object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "날짜는 YYYY-MM-DD 형식이어야 합니다"),
    memberId: z
      .string()
      .regex(/^[0-9a-fA-F]{24}$/, "구성원을 선택하세요"),
    tool: z.string().trim().min(1, "도구를 입력하세요"),
    model: z.string().trim().optional().default(""),
    inputTokens: optionalInt,
    outputTokens: optionalInt,
    requests: optionalInt,
  })
  .refine(
    (r) => r.inputTokens !== null || r.outputTokens !== null || r.requests !== null,
    { message: "토큰 또는 요청 값 중 하나 이상을 입력하세요", path: ["inputTokens"] },
  );

export type SingleState = {
  ok?: boolean;
  message?: string;
  errors?: Record<string, string>;
};

// Registers the (tool, email) identity mapping so the row links to its member,
// then upserts the manual row (source "manual", externalId = member email).
async function commitRows(
  entries: Array<{ memberId: string; email: string; row: UsageRow }>,
): Promise<void> {
  await registerIdentities(
    entries.map((e) => ({
      memberId: e.memberId,
      tool: e.row.tool,
      externalId: e.email,
    })),
  );
  await upsertUsageRows(entries.map((e) => e.row));
}

export async function addUsageRow(
  _prev: SingleState,
  formData: FormData,
): Promise<SingleState> {
  const parsed = singleRowSchema.safeParse({
    date: formData.get("date"),
    memberId: formData.get("memberId"),
    tool: formData.get("tool"),
    model: formData.get("model") ?? "",
    inputTokens: formData.get("inputTokens") ?? "",
    outputTokens: formData.get("outputTokens") ?? "",
    requests: formData.get("requests") ?? "",
  });
  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "form");
      errors[key] ??= issue.message;
    }
    return { ok: false, errors };
  }
  const member = await getMember(parsed.data.memberId);
  if (!member) {
    return { ok: false, errors: { memberId: "구성원을 찾을 수 없습니다" } };
  }
  const d = parsed.data;
  const row: UsageRow = {
    date: d.date,
    tool: d.tool,
    model: d.model ?? "",
    externalId: member.email,
    inputTokens: d.inputTokens,
    outputTokens: d.outputTokens,
    requests: d.requests,
    source: "manual",
  };
  await commitRows([{ memberId: member.id, email: member.email, row }]);
  revalidatePath("/");
  revalidatePath("/members");
  revalidatePath(`/members/${member.id}`);
  return {
    ok: true,
    message: `${member.name} · ${d.tool} · ${d.date} 기록을 저장했습니다.`,
  };
}

// ---- CSV import -------------------------------------------------------------

// columns: date,member_email,tool,model,input_tokens,output_tokens,requests
const CSV_COLUMNS = [
  "date",
  "member_email",
  "tool",
  "model",
  "input_tokens",
  "output_tokens",
  "requests",
] as const;

export type ParsedCsvRow = {
  line: number;
  raw: string[];
  date: string;
  memberEmail: string;
  tool: string;
  model: string;
  inputTokens: number | null;
  outputTokens: number | null;
  requests: number | null;
  memberId: string | null;
  error: string | null;
};

export type CsvState = {
  ok?: boolean;
  message?: string;
  rows?: ParsedCsvRow[];
  validCount?: number;
  errorCount?: number;
  committed?: boolean;
};

const csvCellSchema = {
  int(v: string): { value: number | null; error?: string } {
    const t = v.trim();
    if (t === "") return { value: null };
    const n = Number(t);
    if (!Number.isInteger(n) || n < 0) return { value: null, error: `잘못된 숫자: "${t}"` };
    return { value: n };
  },
};

async function parseCsv(text: string): Promise<ParsedCsvRow[]> {
  const emailToMember = new Map(
    (await getAllMembers()).map((m) => [m.email.toLowerCase(), m]),
  );
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  if (lines.length === 0) return [];
  // Skip a header row if present.
  const start = lines[0].toLowerCase().startsWith("date,") ? 1 : 0;

  const out: ParsedCsvRow[] = [];
  for (let i = start; i < lines.length; i++) {
    const cells = lines[i].split(",").map((c) => c.trim());
    const [date = "", memberEmail = "", tool = "", model = "", inRaw = "", outRaw = "", reqRaw = ""] =
      cells;
    let error: string | null = null;

    if (cells.length < 3) error = `열이 부족합니다 (필요: ${CSV_COLUMNS.length}개)`;
    if (!error && !/^\d{4}-\d{2}-\d{2}$/.test(date)) error = `날짜 형식 오류: "${date}"`;

    const input = csvCellSchema.int(inRaw);
    const output = csvCellSchema.int(outRaw);
    const req = csvCellSchema.int(reqRaw);
    if (!error) error = input.error ?? output.error ?? req.error ?? null;

    const member = emailToMember.get(memberEmail.toLowerCase()) ?? null;
    if (!error && !member) error = `미등록 구성원 이메일: "${memberEmail}"`;
    if (!error && !tool) error = "도구가 비어 있습니다";
    if (
      !error &&
      input.value === null &&
      output.value === null &&
      req.value === null
    ) {
      error = "토큰/요청 값이 모두 비어 있습니다";
    }

    out.push({
      line: i + 1,
      raw: cells,
      date,
      memberEmail,
      tool,
      model,
      inputTokens: input.value,
      outputTokens: output.value,
      requests: req.value,
      memberId: member?.id ?? null,
      error,
    });
  }
  return out;
}

export async function previewCsv(_prev: CsvState, formData: FormData): Promise<CsvState> {
  const text = String(formData.get("csv") ?? "");
  const rows = await parseCsv(text);
  if (rows.length === 0) {
    return { ok: false, message: "가져올 데이터가 없습니다." };
  }
  const errorCount = rows.filter((r) => r.error).length;
  return {
    ok: true,
    rows,
    validCount: rows.length - errorCount,
    errorCount,
    committed: false,
  };
}

export async function commitCsv(_prev: CsvState, formData: FormData): Promise<CsvState> {
  const text = String(formData.get("csv") ?? "");
  const rows = await parseCsv(text);
  const valid = rows.filter((r) => !r.error && r.memberId !== null);
  if (valid.length === 0) {
    return {
      ok: false,
      message: "유효한 행이 없습니다. 오류를 수정한 뒤 다시 시도하세요.",
      rows,
      validCount: 0,
      errorCount: rows.filter((r) => r.error).length,
    };
  }
  const entries = valid.map((r) => ({
    memberId: r.memberId!,
    email: r.memberEmail,
    row: {
      date: r.date,
      tool: r.tool,
      model: r.model ?? "",
      externalId: r.memberEmail,
      inputTokens: r.inputTokens,
      outputTokens: r.outputTokens,
      requests: r.requests,
      source: "manual",
    } satisfies UsageRow,
  }));
  await commitRows(entries);
  revalidatePath("/");
  revalidatePath("/members");
  return {
    ok: true,
    committed: true,
    message: `${valid.length}개 행을 저장했습니다.${
      rows.length - valid.length > 0 ? ` (오류 ${rows.length - valid.length}개는 건너뜀)` : ""
    }`,
    rows,
    validCount: valid.length,
    errorCount: rows.length - valid.length,
  };
}
