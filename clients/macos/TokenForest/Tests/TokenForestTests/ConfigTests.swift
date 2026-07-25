import XCTest
@testable import TokenForest

final class ConfigTests: XCTestCase {
    private func write(_ text: String) -> String {
        let path = NSTemporaryDirectory() + "tf-config-\(UUID().uuidString).json"
        FileManager.default.createFile(atPath: path, contents: text.data(using: .utf8))
        return path
    }

    func testLoadsUploaderConfigIgnoringUnknownKeys() throws {
        let path = write(#"{"serverUrl":"https://ingest.example.com","token":"tmk_x","claudeDirs":["~/.claude"]}"#)
        let cfg = try loadConfig(path: path)
        XCTAssertEqual(cfg.serverUrl, "https://ingest.example.com")
        XCTAssertEqual(cfg.token, "tmk_x")
        XCTAssertNil(cfg.dashboardUrl)
    }

    func testOptionalDashboardUrl() throws {
        let path = write(#"{"serverUrl":"https://i.example.com","token":"tmk_x","dashboardUrl":"https://app.example.com"}"#)
        XCTAssertEqual(try loadConfig(path: path).dashboardUrl, "https://app.example.com")
    }

    func testMissingFileThrowsMissing() {
        XCTAssertThrowsError(try loadConfig(path: "/nonexistent/config.json")) { error in
            guard case ConfigError.missing = error else { return XCTFail("expected .missing") }
        }
    }

    func testBrokenJsonThrowsInvalid() {
        let path = write("{not json")
        XCTAssertThrowsError(try loadConfig(path: path)) { error in
            guard case ConfigError.invalid = error else { return XCTFail("expected .invalid") }
        }
    }
}
