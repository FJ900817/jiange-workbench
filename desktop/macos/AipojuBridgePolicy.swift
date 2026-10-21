import Foundation

/** Exact caller and operation policy for the private Radar WebKit message handler. */
enum AipojuBridgePolicy {
  static func accepts(isMainFrame: Bool, scheme: String, host: String, port: Int) -> Bool {
    isMainFrame && scheme == "http" && host == "127.0.0.1" && port == 3080
  }

  static func allowsOperation(_ operation: String) -> Bool {
    ["topic.list", "topic.search", "topic.detail", "scys.recent", "scys.hot", "scys.digested"].contains(operation)
  }
}
