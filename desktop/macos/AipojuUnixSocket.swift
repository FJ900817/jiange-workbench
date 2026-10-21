import Darwin
import Foundation

/** Send one bounded JSON request to the current app's private Host socket. */
enum AipojuUnixSocket {
  static func request(socketPath: String, body: [String: Any], timeoutSeconds: Int = 30) throws -> Data {
    let descriptor = Darwin.socket(AF_UNIX, SOCK_STREAM, 0)
    guard descriptor >= 0 else { throw AipojuSocketError.connect }
    defer { _ = Darwin.close(descriptor) }

    var noSignal: Int32 = 1
    _ = withUnsafePointer(to: &noSignal) {
      Darwin.setsockopt(descriptor, SOL_SOCKET, SO_NOSIGPIPE, $0, socklen_t(MemoryLayout<Int32>.size))
    }
    var timeout = timeval(tv_sec: timeoutSeconds, tv_usec: 0)
    _ = withUnsafePointer(to: &timeout) {
      Darwin.setsockopt(descriptor, SOL_SOCKET, SO_RCVTIMEO, $0, socklen_t(MemoryLayout<timeval>.size))
    }
    _ = withUnsafePointer(to: &timeout) {
      Darwin.setsockopt(descriptor, SOL_SOCKET, SO_SNDTIMEO, $0, socklen_t(MemoryLayout<timeval>.size))
    }

    var address = sockaddr_un()
    address.sun_family = sa_family_t(AF_UNIX)
    let pathBytes = Array(socketPath.utf8CString)
    let pathCapacity = MemoryLayout.size(ofValue: address.sun_path)
    guard pathBytes.count <= pathCapacity else { throw AipojuSocketError.connect }
    withUnsafeMutableBytes(of: &address.sun_path) { destination in
      destination.initializeMemory(as: CChar.self, repeating: 0)
      for index in 0..<pathBytes.count { destination[index] = UInt8(bitPattern: pathBytes[index]) }
    }
    address.sun_len = UInt8(MemoryLayout<sa_family_t>.size + pathBytes.count)
    let addressLength = socklen_t(MemoryLayout<sa_family_t>.size + pathBytes.count)
    let connectResult = withUnsafePointer(to: &address) { pointer in
      pointer.withMemoryRebound(to: sockaddr.self, capacity: 1) {
        Darwin.connect(descriptor, $0, addressLength)
      }
    }
    guard connectResult == 0 else { throw AipojuSocketError.connect }

    var requestData = try JSONSerialization.data(withJSONObject: body, options: [.sortedKeys])
    requestData.append(0x0a)
    try writeAll(requestData, descriptor: descriptor)

    var response = Data()
    var chunk = [UInt8](repeating: 0, count: 16 * 1024)
    while response.count <= 2 * 1024 * 1024 {
      let count = Darwin.read(descriptor, &chunk, chunk.count)
      if count == 0 { break }
      guard count > 0 else { throw AipojuSocketError.response }
      response.append(contentsOf: chunk.prefix(count))
      if response.contains(0x0a) { break }
    }
    guard response.count <= 2 * 1024 * 1024, response.contains(0x0a) else { throw AipojuSocketError.response }
    return response
  }

  private static func writeAll(_ data: Data, descriptor: Int32) throws {
    try data.withUnsafeBytes { rawBuffer in
      guard let baseAddress = rawBuffer.baseAddress else { throw AipojuSocketError.request }
      var offset = 0
      while offset < rawBuffer.count {
        let count = Darwin.write(descriptor, baseAddress.advanced(by: offset), rawBuffer.count - offset)
        guard count > 0 else { throw AipojuSocketError.request }
        offset += count
      }
    }
  }
}

enum AipojuSocketError: Error {
  case connect
  case request
  case response
}
