# token-forest

팀 구성원의 AI 툴(Cursor, Claude Code, Codex/OpenAI, Copilot, …) 토큰 사용량을
통합 형식으로 수집·추적하는 셀프호스트 대시보드. 목적은 **사용량·도입률 분석**이다.

> Self-hostable, Apache-2.0. 한 조직 = 한 배포(멀티테넌시 없음). 각자 자기 인프라에서
> 돌리며, 사용량 데이터는 자기 DB를 벗어나지 않는다.

## 아키텍처

```
[Cursor Admin API]  ┐
[Anthropic Admin]   ├─ 폴러 (in-process cron, 매 정시) ───────┐
[OpenAI Usage API]  │                                         ├─→ MongoDB ─→ 웹 대시보드
[GitHub per-user]   ┘                                         │        └──→ Slack 주간 리포트 (월 09:30 KST)
[로컬 업로더 CLI (Claude Code 개인 계정)] ─┐                  │
[수동 입력 폼 / CSV 임포트]              ─┴─ POST /api/ingest ┘
```

- 모든 유입 경로는 동일한 `UsageRow[]` 형식(`src/lib/types.ts`)으로
  `(date, tool, model, external_id)` 키에 **일일 총량을 멱등 upsert**한다.
- `tool`은 자유 문자열 — 신규 툴은 스키마 변경 없이 추가된다.
- 토큰이 없는 툴(Copilot)은 `requests`(premium request 수)로 활동량을 기록한다.
- 구성원 온보딩은 `/me`의 단계형 마법사가 안내(도구 선택 → 자동 연결 → 업로더 설치
  자동 감지). 완료 후엔 체크리스트로 전환, `/me?step=claude_code`로 단계 단독 재실행.
- 팀 분석(`/team`): 도입 확산(도입률·매트릭스·비활성) / 사용 패턴(효율·티어 믹스·
  히트맵 등) / 용량 계획(한도 피크 히스토리·도달 일수·좌석 활용) 3섹션.
  대시보드(`/`)는 상태 스캔용(타일·토큰 추이·리더보드·한도·신선도)으로 슬림하게 유지.

## 시작하기

```bash
pnpm install
cp .env.example .env   # MONGODB_URI·키 채우기 (없는 커넥터는 비워두면 비활성)
pnpm dev               # 대시보드 http://localhost:3100 (PORT env로 변경 가능)
```

### 포트

기본 개발 포트는 `3100`(`pnpm dev`, `PORT` env로 변경). Docker 배포는 `PORT`
env(예: 4700)로 서빙한다 — 아래 [배포](#배포-docker) 참고.

### 구성원 등록

```bash
pnpm member add --name "김OO" --email kim@example.com
# → ingest 토큰이 1회 출력됨 (업로더 CLI 사용자에게 전달)

# 툴별 ID 매핑 (커넥터가 주는 사용자 식별자 → 구성원)
pnpm member identity --email kim@example.com --tool cursor --external-id kim@example.com
pnpm member identity --email kim@example.com --tool openai --external-id user-abc123
pnpm member identity --email kim@example.com --tool copilot --external-id kim-github

# Copilot 개인 계정: "Plan: read" 권한 GitHub 토큰 등록
pnpm member github-token --email kim@example.com --token ghp_xxx
```

### 수동 동기화 / 리포트

```bash
pnpm sync                          # 전체 커넥터 증분 동기화
pnpm sync --tool cursor --since 2026-07-01   # 특정 툴 백필
pnpm report --dry-run              # 주간 슬랙 리포트 미리보기
```

## 구성원 온보딩 (셀프서비스)

구성원은 `app.<도메인>`으로 대시보드에 접속하면 신원인지 프록시(oauth2-proxy, Google
로그인)가 자동 식별하고, **`/me`(내 사용량)**에서 프로필 생성 → 연결 체크리스트를
스스로 완주한다. 관리자 개입 불필요:

1. 신원인지 프록시(oauth2-proxy)로 대시보드에 접속 → **회사 이메일로 로그인** →
   대시보드 접속 (프록시 구성은 아래 [배포](#배포-docker) 참고)
2. `/me`에서 프로필 생성(토큰 자동 발급)
3. 체크리스트 항목별 "연결": Claude Code는 표시된 한 줄 명령(`curl …/install.sh | bash -s -- 토큰`)을
   터미널에 붙여넣기(자동 예약·SessionEnd 훅까지 설정됨 — [설치 안내](/setup)), Copilot은
   GitHub PAT("Plan: read") 붙여넣기, 미매핑 기록은 "내 기록입니다" 클레임

> **VPN 없이 업로드 (권장 경로)**: 위 1번(신원인지 프록시)은 대시보드를 **브라우저로
> 볼 때만** 필요하다. 사용량 **업로드**는 공개 수집 엔드포인트로 이뤄지므로 VPN이
> 필요 없다 — 관리자가 `pnpm member add`로 발급한 설치 명령 한 줄
> (`curl https://<your-ingest-host>/install.sh | bash -s -- tmk_...`)을 받아 실행하면
> 끝이다. 상세는 아래 [배포](#배포-docker) 참고.

### 수집 커버리지 (Claude 계열은 Team 플랜 기준)

| 사용 형태 | 수집 | 경로 |
|---|---|---|
| Cursor 팀 / 회사 OpenAI 키 | ✅ 자동 | 서버 폴러 |
| Claude Code CLI·데스크톱 앱 (로컬 세션) | ✅ | 업로더 — 다중 기기 합산 지원(machineId) |
| 폰 Remote Control | ✅ | 세션이 도는 호스트 머신의 업로더 |
| Claude Code 웹 클라우드 세션 | ⚠️ | 로컬로 이어받은 세션만 |
| claude.ai 채팅·Cowork | ❌ 정밀 수집 불가 (Team 플랜 API 없음) | 간접: 한도 소진율 스냅샷(`claude_limits`) + 수동 입력 |
| Copilot 개인 계정 | ✅ | /me에서 PAT 등록 |

**중복 방지**: 같은 계정이 여러 경로로 잡혀도 소스 우선순위(poller > uploader > manual)로
한 경로만 집계된다. `claude_limits`는 %지표라 사용량 합계에서 항상 제외.

**개인 계정 제외 (수집 경계 = 프로필)**: 사용량 스캔·다이제스트 재료는
**기본 프로필(`~/.claude`)만** 대상이다. 개인 계정을 별도
`CLAUDE_CONFIG_DIR` 프로필로 쓰면 그 사용량·작업 기록은 회사 집계에 포함되지
않는다(제외가 기본값). 개인 플랜의 한도 게이지만 원하면 `claudeDirs`에 그
프로필을 추가한다 — 한도 추적과 사용량 수집은 독립. 단, 같은 프로필에서
`/login` 전환으로 계정을 오가면 세션 기록에 계정 구분이 없어 분리 불가 —
반드시 프로필을 나눠야 한다.

### 일일 다이제스트 — ⛔ 폐기 (2026-07-20)

실험적 기능으로 판단되어 종료했다. 현재 `/api/digest`는 **410 Gone**을 반환하고,
업로더는 초안을 만들지 않으며(`config.mjs`의 `digest: false`), `/me`·`/team`에서
노출이 제거됐다. 설치된 구 업로더는 재료 수집·`claude -p` 호출 **이전에** 서버를
먼저 확인하므로, 410을 받으면 즉시 중단한다 — 구성원 Claude 한도를 소모하지 않는다.

코드 자산(`packages/uploader/src/digest.mjs`, `src/app/me/DigestCard.tsx`,
다이제스트 쿼리·모델·Slack 전송)과 기존 `digests` 데이터는 **삭제하지 않고 보존**했다.
필요 시 되살릴 수 있다.

이로써 서버로 나가는 데이터는 다시 **토큰 수(및 한도 %)뿐**이다.

## 데이터 소스 (커넥터)

| tool | 소스 | 단위 | env |
|---|---|---|---|
| `cursor` | Admin API `daily-usage-data`(활동) + `filtered-usage-events`(모델별 토큰·비용) | 토큰+요청 | `CURSOR_API_KEY` |
| `claude_code` | Anthropic `usage_report/claude_code` (조직) **또는** 로컬 업로더 (개인) — 한도는 계정별(1:N), 여러 계정 동시 추적은 업로더 `--claude-dir` | 토큰+세션 | `ANTHROPIC_ADMIN_KEY` |
| `openai` | `organization/usage/completions` (user_id·model별; `OPENAI_EXCLUDE_PROJECTS`로 서비스 프로젝트 API 키 사용량 제외) | 토큰+요청 | `OPENAI_ADMIN_KEY` |
| `copilot` | 구성원별 GitHub `premium_request/usage` (월 단위 API → 동기화 시점마다 증분을 일 단위로 기록) | 요청만 | 구성원별 토큰 (DB 암호화 저장) |

> **주의**: 같은 사람이 Claude **조직** 계정(Anthropic 폴러)과 **개인** 업로더를 동시에 쓰면
> 같은 `(날짜, claude_code, 모델, 이메일)` 키에 서로 덮어쓴다. 한 사람당 한 경로만 사용할 것
> (조직 계정이면 업로더 불필요).

### 커넥터 추가하기 (OpenCode, Alibaba Cloud, …)

1. `src/connectors/<tool>.ts`에서 `Connector`(`src/connectors/types.ts`) 구현 —
   `fetchDaily(since)`가 일일 총량 `UsageRow[]` 반환
2. `src/connectors/index.ts` 레지스트리에 한 줄 등록

중앙 API가 없는 툴은 커넥터 대신 업로더 파서(`packages/uploader/src/parsers/`)나
수동 입력으로 커버한다.

## 성장형 메뉴바 (선택)

각 구성원은 macOS 메뉴바에서 자기 사용량을 **숲 성장** 게임으로 볼 수 있다. 서버가
크로스기기 집계에서 성장 포인트를 계산하므로 어느 기기에서 열어도 같은 나무다.

- 서버 엔드포인트: `GET /api/me/summary`(본인 `tmk_` 토큰 인증, 개인 데이터만).
- 성장 규칙: 온보딩 이후 **활동일·꾸준함(스트릭)·효율(캐시 적중·툴 다양성)**에만
  연동 — 토큰 소비량은 성장에 기여하지 않는다(과소비 유인 차단). 엔진은
  `src/lib/growth.ts`(순수 함수), 검증은 `src/scripts/verify-growth.ts`.

### 네이티브 앱 (macOS, 권장)

메뉴바 아이콘이 자기 스테이지 나무(+스트릭 🔥)를 보여주고, 클릭하면 밤낮·sway·동물이
있는 미니 장면과 GP 게이지, API 리밋 게이지, "숲 열기" 버튼이 뜬다.

**요구사항:** macOS 14+, 그리고 [uploader](#구성원-온보딩-셀프서비스)가 먼저 설치되어
있어야 한다 — 앱은 uploader가 만든 `~/.config/token-forest/config.json`을 그대로
재사용한다(추가 설정 없음).

**설치 (한 줄):**

```bash
curl -fsSL https://raw.githubusercontent.com/renewearth/token-forest/main/clients/macos/install.sh | bash
```

**미서명 앱 안내:** 이 앱은 Apple 개발자 서명이 없다(애드혹 서명만). 위 설치 스크립트는
`curl`로 받기 때문에 quarantine 속성이 붙지 않아 Gatekeeper 마찰 없이 바로 실행된다.
대신 브라우저로 릴리스의 `TokenForest.zip`을 직접 받아 설치한 경우 macOS가 실행을
막을 수 있다 — 이때는 **시스템 설정 → 개인정보 보호 및 보안**에서 "그래도 열기"를
눌러 실행을 허용한다.

**선택 설정:** 대시보드가 수집 서버와 다른 주소에 있다면 config.json에
`"dashboardUrl": "https://app.example.com"` 키를 추가한다(미설정 시 `serverUrl`로
폴백) — "숲 열기" 버튼이 이 주소를 연다.

### 경량 대안 (비macOS·xbar 사용자)

- 클라이언트: `clients/xbar/`(xbar/SwiftBar 플러그인, macOS/Linux 겸용). 설치는 그
  폴더 README 참고.

## 배포 (Docker)

```bash
cp .env.example .env   # 운영 키 입력
docker compose up -d --build
```

- compose가 **앱 + MongoDB**를 함께 띄운다. 앱은 compose 네트워크의
  `mongodb://mongo:27017/token-meter`에 붙고, 같은 DB가 호스트 루프백
  `127.0.0.1:27201`로도 공개돼 관리 CLI·백업이 접근한다. 앱 포트(4700)도
  루프백으로만 publish — 외부 노출은 항상 리버스프록시가 담당.
- **Coolify 배포**: 이 저장소를 Docker Compose 리소스로 등록하면 FQDN 지정·TLS
  (Let's Encrypt)·Traefik 라우팅이 자동이다. env는 Coolify UI에서 입력. Coolify는 compose
  리소스에서 서비스별로 Domains 필드를 따로 갖는다 — `https://app.carbonlink.world:4180`은
  반드시 **`dashboard-auth` 서비스의 Domains 필드**에 등록한다(공백 없이!). `token-forest`
  서비스에 붙이면 oauth2-proxy를 우회해 대시보드가 인증 없이 그대로 노출된다. env에는
  `OAUTH2_PROXY_CLIENT_ID`·`OAUTH2_PROXY_CLIENT_SECRET`·`OAUTH2_PROXY_COOKIE_SECRET`과
  `TOKEN_FOREST_IDENTITY_HEADER`·`TOKEN_FOREST_TRUST_IDENTITY_HEADERS`도 포함해야 한다.
- **대시보드 (`app.<도메인>`)**: oauth2-proxy(Google 로그인)가 앞단이다. compose의
  `dashboard-auth` 서비스가 인증 후 `X-Forwarded-Email`을 주입하고, 앱은
  `TOKEN_FOREST_IDENTITY_HEADER=x-forwarded-email` + `TOKEN_FOREST_TRUST_IDENTITY_HEADERS=1`로
  그 헤더를 신뢰한다. 다른 프록시(Authelia·Cloudflare Access·tailscale serve)도 이메일
  주입 헤더명만 맞추면 동작한다. **주의: 신뢰를 켜기 전에 프록시가 클라이언트가 보낸
  동명 헤더를 덮어쓰는지 확인할 것** — 그렇지 않으면 위조 가능하다. 검증:
  `scripts/verify-app-auth.sh`.
- 사용량 **수집 엔드포인트**는 공개 HTTPS로 노출할 수 있다 — 멤버가 VPN 없이
  업로드. 리버스프록시(Traefik 등)의 경로 화이트리스트로 `/api/ingest`·`/api/limits`·
  `/install.sh`·`/uploader.tgz`·`/api/me/summary` **5경로만** 통과시키고 나머지는
  차단한다(실제 인증은 앱의 `tmk_` 토큰이 담당). 화이트리스트는 **앱 내장
  미들웨어**(`src/middleware.ts`)가 수행한다 — env `INGEST_HOST=<공개 호스트>`만
  설정하면 그 호스트로 들어온 요청이 5경로 외 전부 403이 되고, 미설정 시 비활성.
  프록시 종류와 무관하게 동작한다. 검증:
  `HOST=<공개 호스트> bash scripts/verify-ingest-tunnel.sh`.
- cron(동기화·슬랙 리포트)은 서버 프로세스에 내장.
- 구성원 등록 등 관리 CLI는 호스트에서 `.env`의 URI로 실행하면 된다 (`pnpm member ...`).

### 기존 호스트 Mongo에서 이관

기존에 별도 MongoDB를 쓰고 있었다면 1회 이관:

```bash
mongodump --uri mongodb://127.0.0.1:<구포트>/token-meter --archive=/tmp/tf.dump
docker compose up -d mongo   # 호스트 포트(27201)가 비어 있는지 먼저 확인
mongorestore --uri mongodb://127.0.0.1:27201 --archive=/tmp/tf.dump
```

### 백업

별도 자동 백업이 없다면 주기적으로 mongodump를 권장:

```bash
mongodump --uri mongodb://127.0.0.1:27201/token-meter --archive=token-forest-$(date +%F).dump
```

`.env`의 `TOKEN_FOREST_SECRET`은 DB 백업과 **별도로** 안전하게 보관할 것 —
분실하면 구성원들의 암호화된 GitHub 토큰을 복호화할 수 없어 전원 재등록해야 한다.

## env

`.env.example` 참고. 필수: `TOKEN_FOREST_SECRET`(구성원 GitHub 토큰 암호화 키).
커넥터 키는 비워두면 해당 커넥터만 비활성화된다. `TOKEN_FOREST_DISABLE_CRON=1`로
내장 cron을 끌 수 있다(개발 시).
