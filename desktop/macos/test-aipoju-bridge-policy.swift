import Foundation

@main
private enum AipojuBridgePolicyTests {
  static func main() {
    expect(AipojuBridgePolicy.accepts(isMainFrame: true, scheme: "http", host: "127.0.0.1", port: 3080), "trusted origin")
    expect(!AipojuBridgePolicy.accepts(isMainFrame: false, scheme: "http", host: "127.0.0.1", port: 3080), "subframe rejected")
    expect(!AipojuBridgePolicy.accepts(isMainFrame: true, scheme: "https", host: "127.0.0.1", port: 3080), "wrong scheme rejected")
    expect(!AipojuBridgePolicy.accepts(isMainFrame: true, scheme: "http", host: "localhost", port: 3080), "alias host rejected")
    expect(!AipojuBridgePolicy.accepts(isMainFrame: true, scheme: "http", host: "127.0.0.1", port: 3081), "wrong port rejected")
    expect(!AipojuBridgePolicy.accepts(isMainFrame: true, scheme: "http", host: "127.0.0.2", port: 3080), "neighbor host rejected")
    expect(AipojuBridgePolicy.allowsOperation("topic.list"), "Aipoju list allowed")
    expect(AipojuBridgePolicy.allowsOperation("scys.recent"), "SCYS recent allowed")
    expect(AipojuBridgePolicy.allowsOperation("scys.hot"), "SCYS hot allowed")
    expect(AipojuBridgePolicy.allowsOperation("scys.digested"), "SCYS digested allowed")
    expect(!AipojuBridgePolicy.allowsOperation("scys.callTool"), "arbitrary SCYS tool denied")
    expect(!AipojuBridgePolicy.allowsOperation("topic.like"), "write operation denied")
    print("Private Radar bridge policy: 12/12 PASS")
  }

  private static func expect(_ condition: Bool, _ label: String) {
    guard condition else { fputs("FAIL: \(label)\n", stderr); exit(1) }
  }
}
