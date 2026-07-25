import SwiftUI

struct LimitsRow: View {
    let limits: [LimitRow]

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            ForEach(Array(limits.enumerated()), id: \.offset) { _, l in
                VStack(alignment: .leading, spacing: 2) {
                    Text("\(l.account) \(l.window)")
                        .font(.caption2).foregroundStyle(.secondary)
                    Gauge(
                        fraction: min(1, l.utilizationPct / 100),
                        tint: l.utilizationPct >= 90 ? .red : l.utilizationPct >= 70 ? .orange : .green
                    )
                }
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 8)
    }
}
