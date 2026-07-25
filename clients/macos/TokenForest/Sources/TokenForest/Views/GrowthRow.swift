import SwiftUI

struct GrowthRow: View {
    let growth: Growth

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(spacing: 6) {
                Text("\(growth.stageLabel) · Lv\(growth.level)").font(.headline)
                if growth.streakDays >= 3 { Text("🔥\(growth.streakDays)").font(.subheadline) }
                else if growth.idleDays >= 3 { Text("💤\(growth.idleDays)").font(.subheadline) }
                Spacer()
            }
            Gauge(fraction: gaugeFraction(gp: growth.gp, toNext: growth.toNextStage), tint: .green)
            Text(gpLine).font(.caption).foregroundStyle(.secondary)
            if let m = growth.nextMilestone {
                Text("다음 \(m.label)까지 \(m.remaining)").font(.caption).foregroundStyle(.green)
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
    }

    private var gpLine: String {
        var line = "\(growth.gp) GP"
        if let next = growth.toNextStage { line += " · 다음 단계까지 \(next)" }
        line += " · 활동 \(growth.activeDays)일 · 최고 🔥\(growth.bestStreak)"
        return line
    }
}

struct Gauge: View {
    let fraction: Double
    let tint: Color

    var body: some View {
        GeometryReader { geo in
            ZStack(alignment: .leading) {
                Capsule().fill(Color.primary.opacity(0.08))
                Capsule().fill(tint).frame(width: max(0, geo.size.width * fraction))
            }
        }
        .frame(height: 5)
    }
}
