import XCTest
@testable import TokenForest

final class SceneModelTests: XCTestCase {
    func testBandBoundaries() {
        XCTAssertEqual(timeBand(kstHour: 4), .night)
        XCTAssertEqual(timeBand(kstHour: 5), .dawn)
        XCTAssertEqual(timeBand(kstHour: 7), .dawn)
        XCTAssertEqual(timeBand(kstHour: 8), .day)
        XCTAssertEqual(timeBand(kstHour: 16), .day)
        XCTAssertEqual(timeBand(kstHour: 17), .dusk)
        XCTAssertEqual(timeBand(kstHour: 19), .dusk)
        XCTAssertEqual(timeBand(kstHour: 20), .night)
        XCTAssertEqual(timeBand(kstHour: 23), .night)
    }

    func testAnimalPools() {
        XCTAssertEqual(animalFor(band: .night), "🦉")
        XCTAssertEqual(animalFor(band: .day), "🐿️")
        XCTAssertEqual(animalFor(band: .dawn), "🐿️")
        XCTAssertEqual(animalFor(band: .dusk), "🐿️")
    }

    func testGaugeGuards() {
        XCTAssertEqual(gaugeFraction(gp: 0, toNext: 0), 0) // 휴면 0/0 → 0%
        XCTAssertEqual(gaugeFraction(gp: 107, toNext: nil), 1) // 최종 단계 → 100%
        XCTAssertEqual(gaugeFraction(gp: 50, toNext: 50), 0.5, accuracy: 0.001)
        XCTAssertEqual(gaugeFraction(gp: 0, toNext: 50), 0)
    }
}
