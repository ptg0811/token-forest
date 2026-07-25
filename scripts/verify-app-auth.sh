#!/usr/bin/env bash
# app.carbonlink.world 인증 게이트 검증 — 전부 비로그인 상태 기준.
# [1] 대시보드는 302(로그인 리다이렉트)여야 하고, [2] 신원 헤더를 스푸핑해도
# 절대 200이 나오면 안 된다(인증 게이트가 헤더 포함 요청도 막는지 확인).
# 이 스크립트는 헤더 "덮어쓰기" 자체는 증명하지 않는다 — 그건 로그인한 브라우저에서
# devtools로 스푸핑 헤더를 붙여 fetch해도 본인 신원이 나오는지 별도 확인이 필요하다.
set -u
BASE="${1:-https://app.carbonlink.world}"
pass=0; fail=0
check() { # label expected got
  if [ "$2" = "$3" ]; then echo "PASS [$1] $3"; pass=$((pass + 1)); else echo "FAIL [$1] expected=$2 got=$3"; fail=$((fail + 1)); fi
}

code=$(curl -s --max-time 10 -o /dev/null -w '%{http_code}' "$BASE/")
check "unauth / → login redirect" 302 "$code"

code=$(curl -s --max-time 10 -o /dev/null -w '%{http_code}' -H "X-Forwarded-Email: admin@evil.com" "$BASE/me")
check "spoofed identity header" 302 "$code"

code=$(curl -s --max-time 10 -o /dev/null -w '%{http_code}' "$BASE/oauth2/ping")
check "oauth2-proxy health" 200 "$code"

echo "---"
echo "PASS=$pass FAIL=$fail"
[ "$fail" -eq 0 ]
