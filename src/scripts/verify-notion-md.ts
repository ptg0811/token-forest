import { blocksToMarkdown } from "../lib/notion";

function assert(cond: boolean, msg: string) {
  if (!cond) { console.error("FAIL:", msg); process.exit(1); }
  console.log("ok:", msg);
}
const rt = (s: string) => [{ plain_text: s }];
const URL = "https://notion.so/page";

const blocks = [
  { type: "heading_1", heading_1: { rich_text: rt("제목") } },
  { type: "paragraph", paragraph: { rich_text: rt("문단 하나.") } },
  { type: "bulleted_list_item", bulleted_list_item: { rich_text: rt("항목 A") } },
  { type: "numbered_list_item", numbered_list_item: { rich_text: rt("항목 1") } },
  { type: "to_do", to_do: { rich_text: rt("할일"), checked: false } },
  { type: "to_do", to_do: { rich_text: rt("완료"), checked: true } },
  { type: "quote", quote: { rich_text: rt("인용문") } },
  { type: "code", code: { rich_text: rt("const x = 1"), language: "ts" } },
  { type: "image", image: {} },
  { type: "unsupported_thing", unsupported_thing: {} },
];

const md = blocksToMarkdown(blocks, URL);
const expected = [
  "# 제목",
  "문단 하나.",
  "- 항목 A",
  "1. 항목 1",
  "- [ ] 할일",
  "- [x] 완료",
  "> 인용문",
  "```ts\nconst x = 1\n```",
  `[미디어: Notion에서 보기](${URL})`,
].join("\n\n");
assert(md === expected, `blocksToMarkdown 변환 일치\n--- got ---\n${md}\n--- want ---\n${expected}`);

assert(blocksToMarkdown([], URL) === "", "빈 블록 → 빈 문자열");
console.log("ALL PASS");
