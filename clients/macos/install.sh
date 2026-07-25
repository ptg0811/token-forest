#!/usr/bin/env bash
# TokenForest 메뉴바 앱 설치 — curl 다운로드라 quarantine 미부착 (Gatekeeper 마찰 없음).
set -euo pipefail
REPO="ptg0811/token-forest"
URL=$(curl -fsSL "https://api.github.com/repos/$REPO/releases/latest" \
  | grep -o '"browser_download_url": *"[^"]*TokenForest\.zip"' | head -1 | cut -d'"' -f4)
if [ -z "$URL" ]; then
  echo "릴리스에서 TokenForest.zip 을 찾지 못했습니다." >&2
  exit 1
fi
TMP=$(mktemp -d)
curl -fsSL "$URL" -o "$TMP/TokenForest.zip"
ditto -xk "$TMP/TokenForest.zip" "$TMP"
rm -rf /Applications/TokenForest.app
ditto "$TMP/TokenForest.app" /Applications/TokenForest.app
open /Applications/TokenForest.app
echo "설치 완료 — 메뉴바에서 나무를 확인하세요. (설정은 uploader의 config.json 재사용)"
