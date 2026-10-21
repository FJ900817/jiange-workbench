import Foundation

/** Restrict source links opened from the trusted Aipoju page to public web URLs. */
enum AipojuExternalLinkPolicy {
  static func accepts(_ url: URL?) -> Bool {
    guard let url,
          let components = URLComponents(url: url, resolvingAgainstBaseURL: false),
          let scheme = components.scheme?.lowercased(),
          scheme == "http" || scheme == "https",
          components.user == nil,
          components.password == nil,
          let host = components.host?.lowercased(),
          !host.isEmpty,
          !host.contains(":"),
          host != "localhost",
          !host.hasSuffix(".localhost"),
          !host.hasSuffix(".local"),
          !isPrivateIPv4(host) else { return false }
    return true
  }

  private static func isPrivateIPv4(_ host: String) -> Bool {
    let components = host.split(separator: ".")
    let octets = components.compactMap { UInt8($0) }
    guard components.count == 4, octets.count == 4 else { return false }
    return octets[0] == 10
      || octets[0] == 127
      || octets[0] == 0
      || (octets[0] == 169 && octets[1] == 254)
      || (octets[0] == 172 && (16...31).contains(octets[1]))
      || (octets[0] == 192 && octets[1] == 168)
  }
}
