import Foundation

struct Milestone: Decodable {
    let axis: String
    let label: String
    let remaining: Int
}

struct Growth: Decodable {
    let gp: Int
    let level: Int
    let stage: String
    let stageEmoji: String
    let stageLabel: String
    let toNextStage: Int?
    let streakDays: Int
    let idleDays: Int
    let bestStreak: Int
    let activeDays: Int
    let efficiencyBonusToday: Int
    let nextMilestone: Milestone?
}

struct LimitRow: Decodable {
    let account: String
    let window: String
    let utilizationPct: Double
    let resetsAt: String?
}

struct Summary: Decodable {
    let growth: Growth
    let limits: [LimitRow]?
}

@MainActor
final class SummaryStore: ObservableObject {
    enum State {
        case loading
        case ready(Summary, Date)
        case needsConfig
        case unauthorized
        case offline(last: Summary?, at: Date?)
    }

    @Published private(set) var state: State = .loading
    private var timer: Timer?

    func start() {
        refresh()
        guard timer == nil else { return }
        timer = Timer.scheduledTimer(withTimeInterval: 300, repeats: true) { [weak self] _ in
            guard let self else { return }
            Task { @MainActor in self.refresh() }
        }
    }

    func refresh() {
        Task { await load() }
    }

    private func load() async {
        guard let cfg = try? loadConfig() else {
            enterNeedsConfig()
            return
        }
        guard let url = URL(string: cfg.serverUrl + "/api/me/summary") else {
            enterNeedsConfig()
            return
        }
        var req = URLRequest(url: url)
        req.setValue("Bearer \(cfg.token)", forHTTPHeaderField: "Authorization")
        do {
            let (data, resp) = try await URLSession.shared.data(for: req)
            guard let http = resp as? HTTPURLResponse else { throw URLError(.badServerResponse) }
            if http.statusCode == 401 {
                state = .unauthorized
                return
            }
            guard http.statusCode == 200 else { throw URLError(.badServerResponse) }
            let summary = try JSONDecoder().decode(Summary.self, from: data)
            state = .ready(summary, Date())
        } catch {
            if case .ready(let last, let at) = state {
                state = .offline(last: last, at: at)
            } else if case .offline = state {
                // 유지
            } else {
                state = .offline(last: nil, at: nil)
            }
        }
    }

    var dashboardUrl: String {
        let cfg = try? loadConfig()
        return cfg?.dashboardUrl ?? cfg?.serverUrl ?? ""
    }

    /// 설치 직후 업로더가 아직 설정 파일을 쓰지 않은 경우를 대비해,
    /// needsConfig 상태 진입 시 5분 타이머보다 빠르게 한 번 재시도한다.
    private func enterNeedsConfig() {
        state = .needsConfig
        Task { [weak self] in
            try? await Task.sleep(for: .seconds(30))
            await self?.retryIfStillNeedsConfig()
        }
    }

    private func retryIfStillNeedsConfig() async {
        if case .needsConfig = state { await load() }
    }
}
