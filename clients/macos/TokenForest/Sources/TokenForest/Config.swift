import Foundation

// uploader가 만든 파일 그대로 재사용 — 추가 설정 0. 모르는 키는 무시된다.
struct AppConfig: Decodable {
    let serverUrl: String
    let token: String
    let dashboardUrl: String? // 선택 — 미설정 시 serverUrl 로 폴백
}

enum ConfigError: Error {
    case missing
    case invalid
}

func loadConfig(
    path: String = NSString(string: "~/.config/token-forest/config.json").expandingTildeInPath
) throws -> AppConfig {
    guard let data = FileManager.default.contents(atPath: path) else {
        throw ConfigError.missing
    }
    do {
        return try JSONDecoder().decode(AppConfig.self, from: data)
    } catch {
        throw ConfigError.invalid
    }
}
