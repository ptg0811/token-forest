#!/usr/bin/env bash
# 공개 수집 터널 검증(읽기 전용): 노출 경로만 열리고 대시보드는 막혔는지 확인.
# 사용법: HOST=ingest.example.com bash scripts/verify-ingest-tunnel.sh
set -euo pipefail
HOST="${HOST:?set HOST=ingest.example.com}"
base="https://${HOST}"
fail=0

code() { curl -s -o /dev/null -w '%{http_code}' "$@"; }

echo "[1] /install.sh 는 200 이고 origin 이 공개 호스트로 주입되는가"
body="$(curl -sS "${base}/install.sh")"
echo "$body" | grep -q "${HOST}" \
  && echo "    OK: origin 에 ${HOST} 포함" \
  || { echo "    FAIL: install.sh 본문에 ${HOST} 없음"; fail=1; }

echo "[2] 대시보드 경로는 오리진에 닿지 않아야 한다(비200)"
for p in / /team /me; do
  c="$(code "${base}${p}")"
  if [ "$c" = "200" ]; then echo "    FAIL: ${p} → 200 (누출!)"; fail=1; else echo "    OK: ${p} → ${c}"; fi
done

echo "[3] /api/ingest 는 토큰 없이 401 (경로는 열려있고 인증은 앱이 담당)"
c="$(code -X POST "${base}/api/ingest")"
[ "$c" = "401" ] && echo "    OK: 401" || echo "    WARN: ${c} (401 기대)"

echo "[4] /api/me/summary 는 토큰 없이 401 (메뉴바 클라이언트 경로)"
c="$(code "${base}/api/me/summary")"
[ "$c" = "401" ] && echo "    OK: 401" || { echo "    FAIL: ${c} (401 기대 — 403이면 화이트리스트 누락)"; fail=1; }

echo "[5] /uploader.tgz 는 200 (installer 다운로드 경로)"
c="$(code "${base}/uploader.tgz")"
[ "$c" = "200" ] && echo "    OK: 200" || { echo "    FAIL: ${c} (200 기대)"; fail=1; }

[ "$fail" = "0" ] && echo "PASS" || { echo "FAILED"; exit 1; }
