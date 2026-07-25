#!/usr/bin/env bash
# SPM 실행파일 → .app 번들 + zip. macOS 전용 (CI macos 러너에서 실행).
set -euo pipefail
cd "$(dirname "$0")/.."

swift build -c release
BIN=".build/release/TokenForest"
APP="build/TokenForest.app"
rm -rf build && mkdir -p "$APP/Contents/MacOS"
cp "$BIN" "$APP/Contents/MacOS/TokenForest"
cat > "$APP/Contents/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>CFBundleName</key><string>TokenForest</string>
  <key>CFBundleIdentifier</key><string>world.carbonlink.tokenforest</string>
  <key>CFBundleExecutable</key><string>TokenForest</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>0.1.0</string>
  <key>LSMinimumSystemVersion</key><string>14.0</string>
  <key>LSUIElement</key><true/>
</dict></plist>
PLIST
codesign --force -s - "$APP"
ditto -ck --keepParent "$APP" build/TokenForest.zip
echo "OK: build/TokenForest.zip"
