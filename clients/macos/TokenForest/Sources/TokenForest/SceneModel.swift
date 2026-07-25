import Foundation

// 웹 패리티: src/lib/forest-scene.ts 의 timeBand 와 경계 동일(05/08/17/20, KST).
// 경계를 바꿀 땐 두 파일과 양쪽 테스트를 함께 수정한다.
enum TimeBand: String {
    case dawn, day, dusk, night
}

func timeBand(kstHour: Int) -> TimeBand {
    switch kstHour {
    case 5..<8: return .dawn
    case 8..<17: return .day
    case 17..<20: return .dusk
    default: return .night
    }
}

func currentKstHour(now: Date = Date()) -> Int {
    var cal = Calendar(identifier: .gregorian)
    cal.timeZone = TimeZone(identifier: "Asia/Seoul")!
    return cal.component(.hour, from: now)
}

// MVP 동물: 낮 계열 🐿️ / 밤 🦉 (스펙 — 종 추가는 확장 슬롯)
func animalFor(band: TimeBand) -> String {
    band == .night ? "🦉" : "🐿️"
}

// 게이지 0...1 — 0/0 가드 (웹 GrowthCard NaN 회귀 교훈)
func gaugeFraction(gp: Int, toNext: Int?) -> Double {
    guard let toNext else { return 1 }
    let total = gp + toNext
    guard total > 0 else { return 0 }
    return min(1, Double(gp) / Double(total))
}
