import SwiftUI

// 장면 레이어 — 확장 슬롯: 팀 나무·말풍선·동물 추가는 레이어 추가로 해결한다.
struct MiniScene: View {
    let growth: Growth
    var band: TimeBand = timeBand(kstHour: currentKstHour())

    var body: some View {
        ZStack {
            SkyLayer(band: band)
            if band == .night { FireflyLayer() }
            HillLayer(band: band)
            TreeLayer(emoji: growth.stageEmoji, stage: growth.stage)
            AnimalLayer(band: band)
        }
        .frame(height: 180)
        .clipped()
    }
}

struct SkyLayer: View {
    let band: TimeBand
    private var colors: [Color] {
        switch band {
        case .dawn: return [Color(red: 0.95, green: 0.89, blue: 0.85), Color(red: 0.93, green: 0.94, blue: 0.86)]
        case .day: return [Color(red: 0.86, green: 0.92, blue: 0.95), Color(red: 0.91, green: 0.94, blue: 0.86)]
        case .dusk: return [Color(red: 0.95, green: 0.83, blue: 0.68), Color(red: 0.90, green: 0.89, blue: 0.77)]
        case .night: return [Color(red: 0.06, green: 0.11, blue: 0.20), Color(red: 0.13, green: 0.22, blue: 0.18)]
        }
    }

    var body: some View {
        ZStack(alignment: .topLeading) {
            LinearGradient(colors: colors, startPoint: .top, endPoint: .bottom)
            Text(band == .night ? "🌙" : "☀️")
                .font(.system(size: 22))
                .padding(.top, 10)
                .padding(.leading, 16)
        }
    }
}

struct HillLayer: View {
    let band: TimeBand
    var body: some View {
        VStack {
            Spacer()
            Ellipse()
                .fill(band == .night ? Color(red: 0.14, green: 0.25, blue: 0.18) : Color(red: 0.79, green: 0.84, blue: 0.68))
                .frame(height: 90)
                .offset(y: 45)
        }
    }
}

struct TreeLayer: View {
    let emoji: String
    let stage: String
    @State private var swayRight = false

    private var size: CGFloat {
        switch stage {
        case "dormant": return 30
        case "germinated": return 36
        case "seedling": return 46
        case "sapling": return 54
        case "young": return 62
        case "mature": return 70
        default: return 76 // ancient
        }
    }

    var body: some View {
        VStack {
            Spacer()
            Text(emoji)
                .font(.system(size: size))
                .rotationEffect(.degrees(swayRight ? 1.8 : -1.6), anchor: .bottom)
                .animation(.easeInOut(duration: 4.6).repeatForever(autoreverses: true), value: swayRight)
                .padding(.bottom, 26)
        }
        .onAppear { swayRight = true }
    }
}

struct FireflyLayer: View {
    var body: some View {
        ForEach(0..<3, id: \.self) { i in
            Firefly(delay: Double(i) * 0.9, x: [0.28, 0.55, 0.74][i], y: [0.42, 0.30, 0.52][i])
        }
    }
}

struct Firefly: View {
    let delay: Double
    let x: CGFloat
    let y: CGFloat
    @State private var bright = false

    var body: some View {
        GeometryReader { geo in
            Text("✨")
                .font(.system(size: 8))
                .opacity(bright ? 0.9 : 0.15)
                .position(x: geo.size.width * x, y: geo.size.height * y)
                .animation(.easeInOut(duration: 1.4).repeatForever(autoreverses: true).delay(delay), value: bright)
        }
        .onAppear { bright = true }
    }
}

// 습성 축약 타임라인: 질주 → 정지(킁킁) → 질주 → 정지 → 퇴장. 올빼미는 정지+깜빡임만.
struct AnimalLayer: View {
    let band: TimeBand

    var body: some View {
        if band == .night {
            OwlLayer()
        } else {
            SquirrelLayer()
        }
    }
}

struct OwlLayer: View {
    @State private var flipped = false
    var body: some View {
        VStack {
            Spacer()
            HStack {
                Spacer()
                Text("🦉")
                    .font(.system(size: 15))
                    .scaleEffect(x: flipped ? -1 : 1)
                    .animation(.easeInOut(duration: 0.4).delay(5).repeatForever(autoreverses: true), value: flipped)
                    .padding(.trailing, 22)
                    .padding(.bottom, 18)
            }
        }
        .onAppear { flipped = true }
    }
}

struct SquirrelLayer: View {
    // keyframeAnimator: 32초 루프 — 질주 구간만 이동+홉, 정지 구간 유지
    struct Pose {
        var x: CGFloat = -0.1
        var hop: CGFloat = 0
        var pitch: Double = 0
    }

    var body: some View {
        GeometryReader { geo in
            Text("🐿️")
                .font(.system(size: 15))
                .keyframeAnimator(initialValue: Pose(), repeating: true) { view, pose in
                    view
                        .rotationEffect(.degrees(pose.pitch))
                        .position(
                            x: geo.size.width * pose.x,
                            y: geo.size.height - 22 + pose.hop
                        )
                } keyframes: { _ in
                    KeyframeTrack(\.x) {
                        CubicKeyframe(-0.1, duration: 1)
                        CubicKeyframe(0.3, duration: 3)   // 질주 1
                        CubicKeyframe(0.3, duration: 5)   // 정지 (킁킁)
                        CubicKeyframe(0.62, duration: 3)  // 질주 2
                        CubicKeyframe(0.62, duration: 5)  // 정지
                        CubicKeyframe(1.15, duration: 3)  // 퇴장
                        CubicKeyframe(1.15, duration: 12) // 대기 후 루프
                    }
                    KeyframeTrack(\.hop) {
                        CubicKeyframe(0, duration: 1)
                        // 질주 1: 홉 3회
                        CubicKeyframe(-5, duration: 0.5); CubicKeyframe(0, duration: 0.5)
                        CubicKeyframe(-5, duration: 0.5); CubicKeyframe(0, duration: 0.5)
                        CubicKeyframe(-5, duration: 0.5); CubicKeyframe(0, duration: 0.5)
                        CubicKeyframe(0, duration: 5)
                        // 질주 2
                        CubicKeyframe(-5, duration: 0.5); CubicKeyframe(0, duration: 0.5)
                        CubicKeyframe(-5, duration: 0.5); CubicKeyframe(0, duration: 0.5)
                        CubicKeyframe(-5, duration: 0.5); CubicKeyframe(0, duration: 0.5)
                        CubicKeyframe(0, duration: 5)
                        // 퇴장
                        CubicKeyframe(-5, duration: 0.5); CubicKeyframe(0, duration: 0.5)
                        CubicKeyframe(-5, duration: 0.5); CubicKeyframe(0, duration: 0.5)
                        CubicKeyframe(-5, duration: 0.5); CubicKeyframe(0, duration: 0.5)
                        CubicKeyframe(0, duration: 12)
                    }
                    KeyframeTrack(\.pitch) {
                        CubicKeyframe(0, duration: 5)     // 질주 1 끝까지
                        CubicKeyframe(12, duration: 1)    // 킁킁 (고개 숙임)
                        CubicKeyframe(12, duration: 2)
                        CubicKeyframe(0, duration: 2)
                        CubicKeyframe(0, duration: 22)
                    }
                }
        }
    }
}
