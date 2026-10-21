import CryptoKit
import Foundation
import Security
import Darwin

#if KEYCHAIN_TEST
private let serviceName = "ai.deepseek.harness.desktop.test"
#else
private let serviceName = "ai.deepseek.harness.desktop"
#endif

private struct Request: Decodable {
  let operation: String
  let account: String?
  let value: String?
}

private struct Diagnostic: Encodable {
  let operation: String
  let osStatus: Int32
  let message: String
}

private struct Response: Encodable {
  let ok: Bool
  let code: String?
  let value: String?
  let accounts: [String]?
  let diagnostic: Diagnostic?
  let phases: [String]?

  init(ok: Bool, code: String? = nil, value: String? = nil, accounts: [String]? = nil,
       diagnostic: Diagnostic? = nil, phases: [String]? = nil) {
    self.ok = ok
    self.code = code
    self.value = value
    self.accounts = accounts
    self.diagnostic = diagnostic
    self.phases = phases
  }
}

private struct NativeFailure {
  let code: String
  let status: OSStatus
  let operation: String
}

private enum Lookup<Value> {
  case success(Value)
  case failure(NativeFailure)
}

private func accountHash(_ account: String) -> String {
  SHA256.hash(data: Data(account.utf8)).map { String(format: "%02x", $0) }.joined()
}

private func diagnostic(_ failure: NativeFailure, _ account: String) -> Diagnostic? {
  let message = (SecCopyErrorMessageString(failure.status, nil) as String?) ?? "Unknown Keychain error"
  _ = account
  return Diagnostic(operation: failure.operation, osStatus: failure.status, message: message)
}

private func failed(_ failure: NativeFailure, account: String, phases: [String] = []) -> Response {
  Response(ok: false, code: failure.code, diagnostic: diagnostic(failure, account), phases: phases)
}

private func emit(_ response: Response) {
  guard let data = try? JSONEncoder().encode(response), let text = String(data: data, encoding: .utf8) else {
    FileHandle.standardOutput.write(Data("{\"ok\":false,\"code\":\"HELPER_ERROR\"}\n".utf8))
    return
  }
  FileHandle.standardOutput.write(Data((text + "\n").utf8))
}

private func itemQuery(_ account: String) -> [String: Any] {
  [
    kSecClass as String: kSecClassGenericPassword,
    kSecAttrService as String: serviceName,
    kSecAttrAccount as String: account,
  ]
}

private func readSecret(_ account: String) -> Lookup<String?> {
  var query = itemQuery(account)
  query[kSecReturnData as String] = true
  query[kSecMatchLimit as String] = kSecMatchLimitOne
  var result: CFTypeRef?
  let status = SecItemCopyMatching(query as CFDictionary, &result)
  if status == errSecItemNotFound { return .success(nil) }
  guard status == errSecSuccess, let data = result as? Data,
        let value = String(data: data, encoding: .utf8) else {
    let failureStatus = status == errSecSuccess ? errSecDecode : status
    return .failure(NativeFailure(code: "KEYCHAIN_READ_FAILED", status: failureStatus, operation: "read"))
  }
  return .success(value)
}

private func write(_ account: String, _ value: String) -> NativeFailure? {
  var addQuery = itemQuery(account)
  addQuery[kSecValueData as String] = Data(value.utf8)
  let addStatus = SecItemAdd(addQuery as CFDictionary, nil)
  if addStatus == errSecSuccess { return nil }
  guard addStatus == errSecDuplicateItem else {
    return NativeFailure(code: "KEYCHAIN_WRITE_FAILED", status: addStatus, operation: "add")
  }

  let updateStatus = SecItemUpdate(itemQuery(account) as CFDictionary,
    [kSecValueData as String: Data(value.utf8)] as CFDictionary)
  return updateStatus == errSecSuccess
    ? nil
    : NativeFailure(code: "KEYCHAIN_WRITE_FAILED", status: updateStatus, operation: "update")
}

private func delete(_ account: String) -> NativeFailure? {
  let status = SecItemDelete(itemQuery(account) as CFDictionary)
  guard status == errSecSuccess || status == errSecItemNotFound else {
    return NativeFailure(code: "KEYCHAIN_DELETE_FAILED", status: status, operation: "delete")
  }
  return nil
}

private func accounts() -> Lookup<[String]> {
  let query: [String: Any] = [
    kSecClass as String: kSecClassGenericPassword,
    kSecAttrService as String: serviceName,
    kSecReturnAttributes as String: true,
    kSecMatchLimit as String: kSecMatchLimitAll,
    kSecReturnData as String: false,
  ]
  var result: CFTypeRef?
  let status = SecItemCopyMatching(query as CFDictionary, &result)
  if status == errSecItemNotFound { return .success([]) }
  guard status == errSecSuccess else {
    return .failure(NativeFailure(code: "KEYCHAIN_READ_FAILED", status: status, operation: "list"))
  }
  let items = result as? [[String: Any]] ?? (result as? [String: Any]).map { [$0] } ?? []
  return .success(items.compactMap { $0[kSecAttrAccount as String] as? String })
}

private func lockURL(_ account: String) throws -> URL {
  let base = FileManager.default.homeDirectoryForCurrentUser
    .appendingPathComponent("Library/Caches/ai.deepseek.harness/keychain-locks", isDirectory: true)
  try FileManager.default.createDirectory(at: base, withIntermediateDirectories: true,
    attributes: [.posixPermissions: 0o700])
  try FileManager.default.setAttributes([.posixPermissions: 0o700], ofItemAtPath: base.path)
  let digest = accountHash(account)
  return base.appendingPathComponent(digest + ".lock")
}

private func withAccountLock<T>(_ account: String, _ body: () -> T) throws -> T {
  let url = try lockURL(account)
  let fd = open(url.path, O_CREAT | O_RDWR | O_NOFOLLOW, S_IRUSR | S_IWUSR)
  guard fd >= 0 else { throw NSError(domain: "KeychainLock", code: 1) }
  defer { close(fd) }
  guard flock(fd, LOCK_EX) == 0 else { throw NSError(domain: "KeychainLock", code: 2) }
  defer { flock(fd, LOCK_UN) }
  return body()
}

private func modify(_ account: String) -> Response {
  var phases: [String] = []
  do {
    let response = try withAccountLock(account) { () -> Response in
      phases.append("LOCK_ACQUIRED")
      phases.append("READ_STARTED")
      switch readSecret(account) {
      case .success(let value):
        phases.append("READ_FINISHED")
        emit(Response(ok: true, value: value, phases: phases))
      case .failure(let failure):
        return failed(failure, account: account, phases: phases + ["READ_FAILED"])
      }

      guard let line = readLine(), let data = line.data(using: .utf8),
            let update = try? JSONDecoder().decode(Request.self, from: data),
            update.operation == "commit", update.account == account else {
        return Response(ok: false, code: "KEYCHAIN_WRITE_FAILED", phases: phases)
      }
      phases.append("CALLBACK_FINISHED")
      phases.append("WRITE_STARTED")
      guard let value = update.value else {
        return Response(ok: false, code: "KEYCHAIN_WRITE_FAILED", phases: phases)
      }
      if let failure = write(account, value) {
        return failed(failure, account: account, phases: phases + ["WRITE_FAILED"])
      }
      phases.append("WRITE_FINISHED")
      return Response(ok: true, value: value, phases: phases)
    }
    let completed = Response(ok: response.ok, code: response.code, value: response.value,
      accounts: response.accounts, diagnostic: response.diagnostic,
      phases: (response.phases ?? phases) + ["LOCK_RELEASED"])
    return completed
  } catch {
    return Response(ok: false, code: "KEYCHAIN_LOCK_FAILED", phases: phases)
  }
}

private func handle(_ request: Request) {
  guard let account = request.account, !account.isEmpty else {
    emit(Response(ok: false, code: "INVALID_REQUEST")); return
  }
  switch request.operation {
  case "get", "has":
    switch readSecret(account) {
    case .success(let value): emit(Response(ok: true, value: request.operation == "get" ? value : (value == nil ? nil : "present")))
    case .failure(let failure): emit(failed(failure, account: account))
    }
  case "set":
    guard let value = request.value else { emit(Response(ok: false, code: "INVALID_REQUEST")); return }
    if let failure = write(account, value) { emit(failed(failure, account: account)); return }
    emit(Response(ok: true))
  case "delete":
    if let failure = delete(account) { emit(failed(failure, account: account)); return }
    emit(Response(ok: true))
  case "list":
    switch accounts() {
    case .success(let values): emit(Response(ok: true, accounts: values))
    case .failure(let failure): emit(failed(failure, account: "records"))
    }
  case "modify":
    emit(modify(account))
  default:
    emit(Response(ok: false, code: "INVALID_REQUEST"))
  }
}

guard let line = readLine(), let data = line.data(using: .utf8),
      let request = try? JSONDecoder().decode(Request.self, from: data) else {
  emit(Response(ok: false, code: "INVALID_REQUEST"))
  exit(0)
}
handle(request)
