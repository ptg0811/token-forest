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
