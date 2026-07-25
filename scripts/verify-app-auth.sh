#!/usr/bin/env bash
# app.carbonlink.world 인증 게이트 검증 — 전부 비로그인 상태 기준.
# [1] 대시보드는 302(로그인 리다이렉트)여야 하고, [2] 신원 헤더를 스푸핑해도
# 절대 200이 나오면 안 된다(oauth2-proxy가 헤더를 세션 값으로 덮어쓰는 전제 검증).
set -u
BASE="${1:-https://app.carbonlink.world}"
pass=0; fail=0
check() { # label expected got
  if [ "$2" = "$3" ]; then echo "PASS [$1] $3"; pass=$((pass + 1)); else echo "FAIL [$1] expected=$2 got=$3"; fail=$((fail + 1)); fi
}

code=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/")
check "unauth / → login redirect" 302 "$code"

code=$(curl -s -o /dev/null -w '%{http_code}' -H "X-Forwarded-Email: admin@evil.com" "$BASE/me")
check "spoofed identity header" 302 "$code"

code=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/oauth2/ping")
check "oauth2-proxy health" 200 "$code"

echo "---"
echo "PASS=$pass FAIL=$fail"
[ "$fail" -eq 0 ]
