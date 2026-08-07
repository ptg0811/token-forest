# Changelog

Notable changes to token-forest. Follows [Keep a Changelog](https://keepachangelog.com)
and [Semantic Versioning](https://semver.org). Policy: [VERSIONING.md](./VERSIONING.md).

## [1.0.0] — 2026-08-08

First stable release. Deployed at `app.carbonlink.world`, in daily team use. Baseline
that consolidates all work shipped under the untracked `0.1.0`.

### 수집
- 팀 AI 툴 사용량 수집: Cursor·OpenAI·Copilot 서버 폴러 + Claude Code·Codex 로컬 업로더.
- Codex CLI 토큰 수집·성장 반영, `/me` 연결 체크리스트 행, openai/codex 중복집계 가드.
- KST 집계 타이밍, machineId 익명화.

### 나무 성장 (GP)
- 성장 엔진: 활동일·스트릭·툴 다양성 + 효율 보너스(볼륨 중립).
- 효율 보너스를 캐시히트율에서 **컨텍스트 수율**(`output/cacheCreation`) 밴드로 교체 — 밀도 기반, 전 기간 소급 재계산.

### 노하우 공유 (`/knowhow`)
- 인앱 작성(글/링크, 본인 편집·삭제) + 인제스트 API(`POST /api/knowhow`, Claude 생성 글 주입).
- 리액션(고정 이모지), react-markdown + GFM 표 렌더, 인라인 접기/펼치기, 글별 공유 딥링크.

### 운영
- 소유자 renewearth 이관, Coolify 배포.

[1.0.0]: https://github.com/renewearth/token-forest/releases/tag/v1.0.0
