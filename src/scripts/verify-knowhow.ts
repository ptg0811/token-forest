import { validatePostInput, isValidEmoji, REACTION_EMOJIS } from "../lib/knowhow";

function assert(cond: boolean, msg: string) {
  if (!cond) { console.error("FAIL:", msg); process.exit(1); }
  console.log("ok:", msg);
}

assert(REACTION_EMOJIS.length === 5, "이모지 셋 5종");
assert(isValidEmoji("👍") && !isValidEmoji("😡"), "셋 안/밖 판별");

const ok = validatePostInput({ title: " 제목 ", bodyMarkdown: "본문", link: "", tags: [" a ", ""] });
assert(ok.ok && ok.value.title === "제목" && ok.value.link === null && ok.value.tags.length === 1, "정상 입력 트림·정제");

const linkOnly = validatePostInput({ title: "t", bodyMarkdown: "", link: "https://x.io", tags: [] });
assert(linkOnly.ok && linkOnly.value.bodyMarkdown === "", "링크만도 통과");

assert(!validatePostInput({ title: "", bodyMarkdown: "b", link: "", tags: [] }).ok, "빈 제목 거부");
assert(!validatePostInput({ title: "t", bodyMarkdown: "", link: "", tags: [] }).ok, "본문·링크 둘 다 없음 거부");
assert(!validatePostInput({ title: "t", bodyMarkdown: "", link: "ftp://x", tags: [] }).ok, "비 http(s) 링크 거부");

console.log("ALL PASS");
