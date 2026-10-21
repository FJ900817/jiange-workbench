/** Private Unix-domain channel used only by the trusted macOS Desktop Shell. */

import { timingSafeEqual } from 'node:crypto'
import { lstat, mkdir, chmod, unlink } from 'node:fs/promises'
import { createServer } from 'node:net'
import { homedir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { AipojuAdapterError, AipojuCliAdapter, dispatchAipojuRead } from './aipoju-cli-adapter.ts'
import type { ScysRadarAdapter } from './scys-radar-adapter.ts'

const DIRECTORY_NAME = 'aipoju-ipc'
const MAX_REQUEST_BYTES = 16 * 1024
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024
const REQUEST_TIMEOUT_MS = 30_000
const MACOS_SUN_PATH_BYTES = 104

interface HostResponse {
  readonly requestId: string | null
  readonly ok: boolean
  readonly result?: unknown
  readonly errorCode?: string
}

/** Consume launch secrets before any Host child process can inherit them.
 * @param env Launch environment to consume; defaults to the Host process environment.
 * @returns Validated private channel configuration, or undefined when the Shell did not configure it.
 */
export function consumeAipojuHostIpcConfig(
  env: NodeJS.ProcessEnv = process.env,
): { readonly socketPath: string; readonly token: string } | undefined {
  const token = env.DSH_AIPOJU_IPC_TOKEN
  const socketPath = env.DSH_AIPOJU_IPC_PATH
  delete env.DSH_AIPOJU_IPC_TOKEN
  delete env.DSH_AIPOJU_IPC_PATH
  if (token === undefined && socketPath === undefined) return undefined
  if (token === undefined || socketPath === undefined || !/^[a-f0-9]{32}$/u.test(token)) throw new Error('business-workbench: invalid private Aipoju channel launch configuration')
  const expectedDirectory = join(homedir(), 'Library', 'Application Support', 'DeepSeek Harness', DIRECTORY_NAME)
  const resolvedPath = resolve(socketPath)
  if (dirname(resolvedPath) !== expectedDirectory || !/^a[a-f0-9]{32}\.s$/u.test(basename(resolvedPath)) || Buffer.byteLength(resolvedPath) >= MACOS_SUN_PATH_BYTES) {
    throw new Error('business-workbench: private Aipoju socket path is outside its fixed application directory')
  }
  return Object.freeze({ socketPath: resolvedPath, token })
}

/** Start the one-request-per-connection, authenticated Aipoju read channel.
 * @param options Socket path, per-launch token, and optional isolated test dependencies.
 * @returns A handle that closes the server, adapter, and owned socket.
 */
export async function startAipojuHostIpc(options: {
  readonly socketPath: string
  readonly token: string
  readonly adapter?: AipojuCliAdapter
  readonly scysRadar?: ScysRadarAdapter
  /** Private temporary directory override used only by isolated tests. */
  readonly expectedDirectory?: string
}): Promise<{ close(): Promise<void> }> {
  const socketPath = resolve(options.socketPath)
  const expectedDirectory = options.expectedDirectory ?? join(homedir(), 'Library', 'Application Support', 'DeepSeek Harness', DIRECTORY_NAME)
  if (dirname(socketPath) !== expectedDirectory || !/^a[a-f0-9]{32}\.s$/u.test(basename(socketPath)) || Buffer.byteLength(socketPath) >= MACOS_SUN_PATH_BYTES || !/^[a-f0-9]{32}$/u.test(options.token)) throw new Error('business-workbench: invalid private Aipoju IPC configuration')
  await ensurePrivateDirectory(expectedDirectory)
  try {
    await lstat(socketPath)
    throw new Error('business-workbench: private Aipoju socket path already exists')
  } catch (error) {
    if (errorCode(error) !== 'ENOENT') throw error
  }
  const adapter = options.adapter ?? new AipojuCliAdapter()
  let activeConnections = 0
  const server = createServer((socket) => {
    activeConnections += 1
    if (activeConnections > 16) {
      activeConnections -= 1
      socket.destroy()
      return
    }
    socket.once('close', () => { activeConnections -= 1 })
    socket.setTimeout(REQUEST_TIMEOUT_MS, () => socket.destroy())
    let input = Buffer.alloc(0)
    let handled = false
    socket.on('data', (chunk) => {
      if (handled) return
      input = Buffer.concat([input, chunk])
      if (input.length > MAX_REQUEST_BYTES) {
        handled = true
        writeResponse(socket, { requestId: null, ok: false, errorCode: 'REQUEST_TOO_LARGE' })
        return
      }
      const newline = input.indexOf(0x0a)
      if (newline < 0) return
      handled = true
      const line = input.subarray(0, newline)
      void handleRequest(line, options.token, adapter, options.scysRadar)
        .then((response) => { writeResponse(socket, response) })
        .catch(() => { socket.destroy() })
    })
  })
  await new Promise<void>((resolveListen, reject) => {
    server.once('error', reject)
    server.listen(socketPath, resolveListen)
  })
  try {
    await chmod(socketPath, 0o600)
    await assertPrivateSocket(socketPath)
  } catch (error) {
    await new Promise<void>((resolveClose) => { server.close(() => { resolveClose() }) })
    await unlink(socketPath).catch(() => undefined)
    throw error
  }
  return {
    async close(): Promise<void> {
      adapter.dispose()
      await new Promise<void>((resolveClose, reject) => {
        server.close((error) => {
          if (error) reject(error)
          else resolveClose()
        })
      })
      const metadata = await lstat(socketPath).catch(() => undefined)
      if (metadata !== undefined && metadata.isSocket() && process.getuid?.() === metadata.uid) await unlink(socketPath)
    },
  }
}

async function handleRequest(line: Buffer, expectedToken: string, adapter: AipojuCliAdapter, scysRadar?: ScysRadarAdapter): Promise<HostResponse> {
  let request: unknown
  try { request = JSON.parse(line.toString('utf8')) as unknown } catch { return { requestId: null, ok: false, errorCode: 'INVALID_REQUEST' } }
  if (!isRecord(request)) return { requestId: null, ok: false, errorCode: 'INVALID_REQUEST' }
  const requestId = typeof request.requestId === 'string' && /^[A-Za-z0-9_-]{1,64}$/u.test(request.requestId) ? request.requestId : null
  if (requestId === null || !hasExactEnvelopeKeys(request)) return { requestId, ok: false, errorCode: 'INVALID_REQUEST' }
  if (!safeTokenEqual(request.token, expectedToken)) return { requestId, ok: false, errorCode: 'UNAUTHORIZED' }
  try {
    const result = await dispatchAipojuRead(adapter, request.operation, request.args, scysRadar)
    return { requestId, ok: true, result }
  } catch (error) {
    const code = error instanceof AipojuAdapterError ? error.code : 'HOST_RESPONSE_ERROR'
    return { requestId, ok: false, errorCode: code }
  }
}

function safeTokenEqual(value: unknown, expected: string): boolean {
  if (typeof value !== 'string' || !/^[a-f0-9]{32}$/u.test(value)) return false
  const actualBytes = Buffer.from(value, 'hex')
  const expectedBytes = Buffer.from(expected, 'hex')
  return actualBytes.length === expectedBytes.length && timingSafeEqual(actualBytes, expectedBytes)
}

async function ensurePrivateDirectory(path: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 })
  try { await mkdir(path, { mode: 0o700 }) } catch (error) {
    if (errorCode(error) !== 'EEXIST') throw error
  }
  const metadata = await lstat(path)
  if (!metadata.isDirectory() || metadata.isSymbolicLink() || process.getuid?.() !== metadata.uid || (metadata.mode & 0o077) !== 0) {
    throw new Error('business-workbench: private Aipoju IPC directory is not owner-only')
  }
}

async function assertPrivateSocket(path: string): Promise<void> {
  const metadata = await lstat(path)
  if (!metadata.isSocket() || process.getuid?.() !== metadata.uid || (metadata.mode & 0o077) !== 0) {
    throw new Error('business-workbench: private Aipoju IPC socket permissions are invalid')
  }
}

function writeResponse(socket: import('node:net').Socket, response: HostResponse): void {
  const serialized = Buffer.from(`${JSON.stringify(response)}\n`, 'utf8')
  if (serialized.length > MAX_RESPONSE_BYTES) {
    socket.end(`${JSON.stringify({ requestId: response.requestId, ok: false, errorCode: 'RESPONSE_TOO_LARGE' })}\n`)
    return
  }
  socket.end(serialized)
}

function hasExactEnvelopeKeys(value: Record<string, unknown>): boolean {
  return Object.keys(value).every(key => ['requestId', 'token', 'operation', 'args'].includes(key))
    && ['requestId', 'token', 'operation', 'args'].every(key => Object.hasOwn(value, key))
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function errorCode(error: unknown): string | undefined {
  return typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string' ? error.code : undefined
}
