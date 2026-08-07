import { connectDb, Post, Reaction } from "@/lib/db";
import { recordSyncRun } from "@/lib/usage";

// Notion 블록 → 마크다운 (순수, DB·네트워크 미의존). 지원 외 블록은 스킵.
// 미디어(image/embed/video/file)는 원본 링크 한 줄로 대체.
type RichText = { plain_text?: string };
export type NotionBlock = { type: string; [key: string]: unknown };

function richText(node: unknown): string {
  const rt = (node as { rich_text?: RichText[] } | undefined)?.rich_text ?? [];
  return rt.map((t) => t.plain_text ?? "").join("");
}

export function blocksToMarkdown(blocks: NotionBlock[], notionUrl: string): string {
  const media = `[미디어: Notion에서 보기](${notionUrl})`;
  const lines: string[] = [];
  for (const b of blocks) {
    const payload = b[b.type];
    switch (b.type) {
      case "heading_1": lines.push(`# ${richText(payload)}`); break;
      case "heading_2": lines.push(`## ${richText(payload)}`); break;
      case "heading_3": lines.push(`### ${richText(payload)}`); break;
      case "paragraph": lines.push(richText(payload)); break;
      case "bulleted_list_item": lines.push(`- ${richText(payload)}`); break;
      case "numbered_list_item": lines.push(`1. ${richText(payload)}`); break;
      case "quote": lines.push(`> ${richText(payload)}`); break;
      case "to_do": {
        const done = (payload as { checked?: boolean } | undefined)?.checked;
        lines.push(`- [${done ? "x" : " "}] ${richText(payload)}`);
        break;
      }
      case "code": {
        const lang = (payload as { language?: string } | undefined)?.language ?? "";
        lines.push(`\`\`\`${lang}\n${richText(payload)}\n\`\`\``);
        break;
      }
      case "image":
      case "embed":
      case "video":
      case "file":
        lines.push(media);
        break;
      default:
        break; // 미지원 스킵
    }
  }
  return lines.join("\n\n");
}

const NOTION_VERSION = "2022-06-28";

export function notionEnabled(): boolean {
  return Boolean(process.env.NOTION_TOKEN && process.env.NOTION_POSTS_DB);
}

async function notionFetch(path: string, init: RequestInit = {}): Promise<any> {
  const res = await fetch(`https://api.notion.com/v1${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${process.env.NOTION_TOKEN}`,
      "Notion-Version": NOTION_VERSION,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Notion API ${res.status} ${res.statusText} — ${body}`);
  }
  return res.json();
}

// 프로퍼티 헬퍼: title/multi_select/people/rich_text에서 값 추출.
function titleOf(props: Record<string, any>): string {
  const p = Object.values(props).find((v: any) => v?.type === "title") as any;
  return (p?.title ?? []).map((t: any) => t.plain_text ?? "").join("") || "(제목 없음)";
}
function tagsOf(props: Record<string, any>): string[] {
  const name = process.env.NOTION_TAGS_PROP;
  const p = name ? props[name] : undefined;
  if (p?.type === "multi_select") return (p.multi_select ?? []).map((o: any) => o.name);
  return [];
}
function authorOf(props: Record<string, any>): string {
  const name = process.env.NOTION_AUTHOR_PROP;
  const p = name ? props[name] : undefined;
  if (p?.type === "people") return (p.people ?? []).map((u: any) => u.name ?? "").filter(Boolean).join(", ");
  if (p?.type === "rich_text") return (p.rich_text ?? []).map((t: any) => t.plain_text ?? "").join("");
  return "";
}

async function fetchBlocks(pageId: string): Promise<NotionBlock[]> {
  const blocks: NotionBlock[] = [];
  let cursor: string | undefined;
  do {
    const qs = cursor ? `?start_cursor=${cursor}&page_size=100` : "?page_size=100";
    const json = await notionFetch(`/blocks/${pageId}/children${qs}`, { method: "GET" });
    blocks.push(...(json.results ?? []));
    cursor = json.has_more ? json.next_cursor : undefined;
  } while (cursor);
  return blocks;
}

// 로컬 notion 글의 최신 notionEditedAt(증분 커서). 없으면 null(전체 실행).
async function latestNotionEdited(): Promise<Date | null> {
  const row = await Post.findOne({ source: "notion" }).sort({ notionEditedAt: -1 }).lean();
  return (row?.notionEditedAt as Date | undefined) ?? null;
}

async function queryDatabase(since: Date | null): Promise<any[]> {
  const pages: any[] = [];
  let cursor: string | undefined;
  do {
    const body: Record<string, unknown> = {
      page_size: 100,
      sorts: [{ timestamp: "last_edited_time", direction: "descending" }],
      ...(cursor ? { start_cursor: cursor } : {}),
      ...(since
        ? { filter: { timestamp: "last_edited_time", last_edited_time: { after: since.toISOString() } } }
        : {}),
    };
    const json = await notionFetch(`/databases/${process.env.NOTION_POSTS_DB}/query`, {
      method: "POST",
      body: JSON.stringify(body),
    });
    pages.push(...(json.results ?? []));
    cursor = json.has_more ? json.next_cursor : undefined;
  } while (cursor);
  return pages;
}

// 라이브 페이지 id 전체(블록 페치 없이 저렴). prune 대조용.
async function queryAllPageIds(): Promise<Set<string>> {
  const ids = new Set<string>();
  let cursor: string | undefined;
  do {
    const body: Record<string, unknown> = { page_size: 100, ...(cursor ? { start_cursor: cursor } : {}) };
    const json = await notionFetch(`/databases/${process.env.NOTION_POSTS_DB}/query`, { method: "POST", body: JSON.stringify(body) });
    for (const p of json.results ?? []) ids.add(p.id);
    cursor = json.has_more ? json.next_cursor : undefined;
  } while (cursor);
  return ids;
}

// Notion DB → Post 미러. env 미설정이면 no-op. 실패는 recordSyncRun에 기록하고 삼킨다.
// 콘텐츠는 증분(변경 페이지만 블록 페치), prune은 매 실행 라이브 id 전체와 대조.
export async function syncNotionPosts(): Promise<"ok" | "error" | "skipped"> {
  if (!notionEnabled()) return "skipped";
  try {
    await connectDb();
    const since = await latestNotionEdited();
    // 분 절삭 경계 보정: since-60s (upsert 멱등이라 재감지 무해).
    const bound = since ? new Date(since.getTime() - 60_000) : null;
    const pages = await queryDatabase(bound);
    for (const page of pages) {
      try {
        const blocks = await fetchBlocks(page.id);
        const notionUrl: string = page.url ?? "";
        const editedAt = new Date(page.last_edited_time);
        await Post.findOneAndUpdate(
          { source: "notion", notionId: page.id },
          {
            $set: {
              source: "notion",
              notionId: page.id,
              title: titleOf(page.properties ?? {}),
              bodyMarkdown: blocksToMarkdown(blocks, notionUrl),
              link: null,
              tags: tagsOf(page.properties ?? {}),
              author: authorOf(page.properties ?? {}),
              notionUrl,
              notionCreatedAt: new Date(page.created_time),
              notionEditedAt: editedAt,
              activityAt: editedAt,
              syncedAt: new Date(),
            },
          },
          { upsert: true },
        );
      } catch (err) {
        console.warn(`notion page ${page.id} 변환 실패, 스킵 — ${(err as Error).message}`);
      }
    }
    // prune: 라이브 id 전체와 대조 — 사라진 notion 글 + 리액션 삭제 (매 실행).
    const liveIds = await queryAllPageIds();
    const stale = await Post.find({ source: "notion", notionId: { $nin: [...liveIds] } }, { _id: 1 }).lean();
    const staleIds = stale.map((p) => p._id);
    if (staleIds.length) {
      await Reaction.deleteMany({ postId: { $in: staleIds } });
      await Post.deleteMany({ _id: { $in: staleIds } });
    }
    await recordSyncRun("notion", "ok", { message: `${pages.length} changed, ${liveIds.size} live` });
    return "ok";
  } catch (err) {
    await recordSyncRun("notion", "error", { message: (err as Error).message });
    console.error(`notion 동기화 실패 — ${(err as Error).message}`);
    return "error";
  }
}
