# token-forest — 메뉴바 클라이언트 (xbar / SwiftBar)

macOS 메뉴바에서 token-forest 성장 나무를 본다. 서버가 성장을 계산하므로 어느 기기에서 열어도 같다.

## 설치

1. [xbar](https://xbarapp.com) 또는 [SwiftBar](https://github.com/swiftbar/SwiftBar) 설치.
2. `token-forest.5m.js`를 플러그인 폴더에 복사하고 실행 권한 부여:
   ```bash
   cp token-forest.5m.js ~/Library/Application\ Support/xbar/plugins/
   chmod +x ~/Library/Application\ Support/xbar/plugins/token-forest.5m.js
   ```
3. 토큰·서버를 환경변수로(또는 스크립트 상단 상수 편집):
   ```bash
   export TOKEN_FOREST_URL=https://<your-ingest-host>
   export TOKEN_FOREST_TOKEN=tmk_xxx
   ```
4. xbar 새로고침. 파일명의 `5m` = 5분 주기.

토큰은 관리자가 `pnpm member add`로 발급한 본인 `tmk_...`. 개인 사용량만 보이며 팀 데이터는 노출되지 않는다.
