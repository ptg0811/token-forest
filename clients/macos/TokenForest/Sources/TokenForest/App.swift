import SwiftUI

@main
struct TokenForestApp: App {
    @StateObject private var store = SummaryStore()

    private var iconTitle: String {
        switch store.state {
        case .loading: return "🌰"
        case .needsConfig: return "🌰 —"
        case .unauthorized: return "🌲 ⚠️"
        case .offline(let last, _):
            return (last?.growth.stageEmoji ?? "🌲") + " ⚠️"
        case .ready(let s, _):
            let fire = s.growth.streakDays >= 3 ? " 🔥\(s.growth.streakDays)" : ""
            return s.growth.stageEmoji + fire
        }
    }

    var body: some Scene {
        MenuBarExtra(iconTitle) {
            PopoverView()
                .environmentObject(store)
                .frame(width: 320)
                .task { store.start() }
        }
        .menuBarExtraStyle(.window)
    }
}

struct PopoverView: View {
    @EnvironmentObject var store: SummaryStore
    @Environment(\.openURL) private var openURL

    var body: some View {
        VStack(spacing: 0) {
            switch store.state {
            case .loading:
                ProgressView().frame(height: 180)
            case .needsConfig:
                VStack(spacing: 8) {
                    Text("설정이 없습니다").font(.headline)
                    Text("대시보드 /me 의 설치 명령을 먼저 실행하세요.\n(~/.config/token-forest/config.json)")
                        .font(.caption).multilineTextAlignment(.center)
                }.padding(24)
            case .unauthorized:
                VStack(spacing: 8) {
                    Text("토큰이 유효하지 않습니다").font(.headline)
                    Text("대시보드 /me 에서 재온보딩하세요.").font(.caption)
                }.padding(24)
            case .offline(let last, let at):
                if let last { contentView(last, updatedAt: at, stale: true) }
                else {
                    VStack(spacing: 8) {
                        Text("오프라인").font(.headline)
                        Text("서버에 연결할 수 없습니다.").font(.caption)
                    }.padding(24)
                }
            case .ready(let summary, let at):
                contentView(summary, updatedAt: at, stale: false)
            }
        }
    }

    @ViewBuilder
    private func contentView(_ summary: Summary, updatedAt: Date?, stale: Bool) -> some View {
        MiniScene(growth: summary.growth)
        GrowthRow(growth: summary.growth)
        if let limits = summary.limits, !limits.isEmpty {
            LimitsRow(limits: limits)
        }
        Divider()
        HStack {
            Button("🌲 숲 열기") {
                if let url = URL(string: store.dashboardUrl + "/me") { openURL(url) }
            }
            .buttonStyle(.plain)
            .foregroundStyle(.green)
            Spacer()
            if let updatedAt {
                Text((stale ? "⚠️ " : "") + updatedAt.formatted(date: .omitted, time: .shortened) + " 갱신")
                    .font(.caption2).foregroundStyle(.secondary)
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
    }
}
