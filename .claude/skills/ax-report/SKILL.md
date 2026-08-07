---
name: ax-report
description: token-forest에서 AX 리포트(컨텍스트 수율 팀 분석)를 일관된 판으로 작성해 /knowhow에 발행. 오너가 주기적으로 대화형 세션에서 호출.
---

# AX 리포트 발행

컨텍스트 수율 기반 팀 AI 사용패턴 분석 글을 매 회차 **같은 구조·같은 규칙**으로 찍어 `/knowhow`에 발행한다. 수치는 항상 스크립트에서만 가져오고(임의 계산 금지), 발행 전 사람 승인을 받는다.

## 절차

### 1. 최신 지표 확보
```bash
pnpm ax-metrics
```
출력의 `=== JSON ===` 블록 수치만 사용한다. 표·서술의 모든 숫자는 이 JSON에서 그대로 복사한다. 절대 손으로 재계산하지 않는다. 데이터 없음이면 중단하고 보고.

### 2. 회차 번호 결정
프로덕션 DB에서 "AX 리포트" 명의(`report@renewearth-lab.com`) 글 수를 세어 +1. (조회 스니펫은 5절.)

### 3. 초안 작성 — 구조 고정
제목: `AX 리포트 #<회차>: <이번 회차 핵심 한 줄>`
본문 마크다운 4부:
1. **① 진단** — 주간 수율 추세 표(gfm) + 팀 종합 + 최근7일 델타(개선/악화). "수율 = 산출 ÷ 끌어온 컨텍스트" 정의 한 줄.
2. **② 패턴** — 익명 고/저수율 서명 대조 표(세션당 요청·턴당 산출·턴당 컨텍스트·새 컨텍스트당 산출). "차이는 재능이 아니라 세션 위생."
3. **③ 실천** — 구체 습관 + 나쁜/좋은 예(세션 끊기·컨텍스트 최소화·결단 턴·명세→검증 쪼개기·꼬이면 재시작).
4. **④ 지표** — 성장엔진 효율보너스가 수율을 본다는 연결.

톤: 분석적·간결·1인칭 팀 보이스(RELAX 시리즈 결). 표는 gfm 파이프 표.

### 4. 익명 규칙 (엄수)
- **멤버 실명·식별 정보 절대 금지.** 수율 분포는 범위·배수로, 서명은 "고수율형/저수율형"으로만.
- 특정 개인을 지목·유추 가능하게 쓰지 않는다.

### 5. 발행 (사람 승인 후)
초안 전문을 사용자에게 보여주고 **승인받은 뒤** 주입. 명의=AX 리포트 멤버, `source:"ingest"`, `link:null`, `tags` 예: `["수율","사용패턴","AX"]`.

DB 직접 삽입 스니펫(회차 조회 + 발행):
```js
import { MongoClient } from '/home/caleb/token-forest/node_modules/.pnpm/mongodb@7.2.0/node_modules/mongodb/lib/index.js';
const c = new MongoClient('mongodb://127.0.0.1:27201/token-meter'); await c.connect();
const db = c.db('token-meter');
const sys = await db.collection('members').findOne({ email: 'report@renewearth-lab.com' });
const priorCount = await db.collection('posts').countDocuments({ authorMemberId: sys._id });
// 회차 = priorCount + 1
const now = new Date();
await db.collection('posts').insertOne({
  source: 'ingest', title: /* '#N: ...' */, bodyMarkdown: /* 승인된 본문 */,
  link: null, tags: ['수율','사용패턴','AX'], authorMemberId: sys._id,
  activityAt: now, createdAt: now, updatedAt: now, __v: 0,
});
await c.close();
```
(또는 AX 리포트 멤버에 ingestToken이 있으면 `POST /api/knowhow`.)

## 하지 말 것
- JSON에 없는 수치를 지어내거나 손으로 계산.
- 멤버 실명 노출.
- 사용자 승인 없이 발행.
- 회차·구조를 매번 바꾸기(일관성이 목적).
