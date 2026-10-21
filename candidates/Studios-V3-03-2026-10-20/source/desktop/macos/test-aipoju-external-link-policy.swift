import Foundation

@main
private enum AipojuExternalLinkPolicyTests {
  static func main() {
    expect(AipojuExternalLinkPolicy.accepts(URL(string: "https://example.org/topic")), "HTTPS source accepted")
    expect(AipojuExternalLinkPolicy.accepts(URL(string: "http://example.org/topic")), "HTTP source accepted")
    expect(!AipojuExternalLinkPolicy.accepts(URL(string: "javascript:alert(1)")), "script URL rejected")
    expect(!AipojuExternalLinkPolicy.accepts(URL(string: "file:///etc/passwd")), "file URL rejected")
    expect(!AipojuExternalLinkPolicy.accepts(URL(string: "http://localhost:3080/")), "localhost rejected")
    expect(!AipojuExternalLinkPolicy.accepts(URL(string: "http://192.168.1.1/")), "private IPv4 rejected")
    expect(!AipojuExternalLinkPolicy.accepts(URL(string: "https://user:pass@example.org/")), "userinfo rejected")
    print("Aipoju external-link policy: 7/7 PASS")
  }

  private static func expect(_ condition: Bool, _ label: String) {
    guard condition else { fputs("FAIL: \(label)\n", stderr); exit(1) }
  }
}
