// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "TokenForest",
    platforms: [.macOS(.v14)],
    targets: [
        .executableTarget(name: "TokenForest", path: "Sources/TokenForest"),
        .testTarget(
            name: "TokenForestTests",
            dependencies: ["TokenForest"],
            path: "Tests/TokenForestTests"
        ),
    ]
)
