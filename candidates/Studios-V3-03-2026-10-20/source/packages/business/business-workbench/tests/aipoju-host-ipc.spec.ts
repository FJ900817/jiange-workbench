import { createConnection } from 'node:net'
import { chmod, lstat, mkdtemp, readFile, rm } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AipojuAdapterError, AipojuCliAdapter, dispatchAipojuRead } from '../src/aipoju-cli-adapter.ts'
import { consumeAipojuHostIpcConfig, startAipojuHostIpc } from '../src/aipoju-host-ipc.ts'
import type { ScysRadarAdapter } from '../src/scys-radar-adapter.ts'

const token = 'a'.repeat(32)
const socketName = `a${'0'.repeat(32)}.s`
const topic = { id: '45548555825514558', title: '真实主题', content: '<b>正文</b>', author: '作者', createdAt: '2026-10-12', url: 'https://example.test/topic', images: ['https://example.test/image.webp', 'javascript:alert(1)', 'http://127.0.0.1/pixel', 'https://user:pass@example.test/image'], interactionCounts: { likes: 8, invalid: 'x' }, cookie: 'must-not-escape' }
const roots: string[] = []
const closers: Array<() => Promise<void>> = []

afterEach(async () => {
  vi.useRealTimers()
  await Promise.all(closers.splice(0).map(close => close()))
  await Promise.all(roots.splice(0).map(path => rm(path, { recursive: true, force: true })))
})

describe('Aipoju read-only adapter', () => {
  it('uses fixed CLI templates and returns only validated topic fields', async () => {
    const runner = vi.fn(async (_args: readonly string[]) => ({ stdout: JSON.stringify({ topics: [topic] }), stderr: '', exitCode: 0, timedOut: false, outputLimitExceeded: false, spawnFailed: false }))
    const adapter = new AipojuCliAdapter(runner)
    const result = await dispatchAipojuRead(adapter, 'topic.search', { keyword: 'AI工作流' })
    expect(runner).toHaveBeenCalledWith(['topic', 'list', '--page', '1', '--size', '20', '-k', 'AI工作流', '--json'])
    expect((result as { topics: Array<Record<string, unknown>> }).topics[0]).toEqual({
      topicId: '45548555825514558', title: '真实主题', content: '<b>正文</b>', author: '作者', createdAt: '2026-10-12',
      sourceUrl: 'https://example.test/topic', images: ['https://example.test/image.webp'], interactionCounts: { likes: 8 },
    })
    expect(JSON.stringify(result)).not.toContain('must-not-escape')
    expect(JSON.stringify(result)).not.toContain('cookie')
  })

  it('uses only the verified fixed list and detail command forms', async () => {
    const runner = vi.fn(async (args: readonly string[]) => ({ stdout: JSON.stringify(args[1] === 'detail' ? { topic } : { topics: [topic] }), stderr: '', exitCode: 0, timedOut: false, outputLimitExceeded: false, spawnFailed: false }))
    const adapter = new AipojuCliAdapter(runner)
    await dispatchAipojuRead(adapter, 'topic.list', {})
    expect(runner).toHaveBeenLastCalledWith(['topic', 'list', '--page', '1', '--size', '20', '--json'])
    const result = await dispatchAipojuRead(adapter, 'topic.detail', { topicId: '45548555825514558' })
    expect(runner).toHaveBeenLastCalledWith(['topic', 'detail', '45548555825514558', '--json'])
    expect(result).toMatchObject({ topicId: '45548555825514558', title: '真实主题' })
  })

  it('maps the observed paged records envelope and tolerates optional source fields', async () => {
    const record = { topicId: '45548555825514558', title: '', content: '正文', createdAt: '2026-10-12', fullName: '作者', url: 'https://example.test/source', images: '["https://example.test/image.webp"]', likeCount: 7, totalCollectionCount: 4, totalCommentCount: 2 }
    const raw = JSON.stringify({ pageNum: 1, pageSize: 3, records: [record], total: 1 })
    const adapter = new AipojuCliAdapter(async () => ({ stdout: raw, stderr: '', exitCode: 0, timedOut: false, outputLimitExceeded: false, spawnFailed: false }))
    const result = await adapter.read({ operation: 'topic.search', args: { keyword: '真实检索' } })
    expect(result).toMatchObject({ topics: [{
      topicId: record.topicId, title: '', content: '正文', author: '作者', createdAt: record.createdAt,
      sourceUrl: record.url, images: ['https://example.test/image.webp'], interactionCounts: { likes: 7, comments: 2, collections: 4 },
    }] })
    expect((result as { topics: unknown[] }).topics).toHaveLength(1)
  })

  it('builds a deduplicated home feed from verified 20-row pages and caches it for 15 minutes', async () => {
    const rows = Array.from({ length: 60 }, (_, index) => ({
      topicId: String(9000 + index), title: `真实主题 ${index}`, content: `内容 ${index}`.repeat(24),
      createdAt: new Date(Date.now() - index * 60_000).toISOString(), likeCount: index + 1,
    }))
    const runner = vi.fn(async (args: readonly string[]) => {
      const page = Number(args[args.indexOf('--page') + 1])
      const start = (page - 1) * 20
      return {
        stdout: JSON.stringify({ pageNum: page, pageSize: 20, total: 60, records: rows.slice(start, start + 20) }),
        stderr: '', exitCode: 0, timedOut: false, outputLimitExceeded: false, spawnFailed: false,
      }
    })
    const adapter = new AipojuCliAdapter(runner)
    const first = await adapter.readHomeFeed()
    expect(runner).toHaveBeenCalledTimes(3)
    expect(runner).toHaveBeenNthCalledWith(1, ['topic', 'list', '--page', '1', '--size', '20', '--json'])
    expect(runner).toHaveBeenNthCalledWith(3, ['topic', 'list', '--page', '3', '--size', '20', '--json'])
    expect(first.candidateCount).toBe(50)
    expect(first.featured).toHaveLength(8)
    expect(first.latest).toHaveLength(12)
    expect(new Set([...first.featured, ...first.latest].map(item => item.topicId)).size).toBe(20)
    expect(first.latest.map(item => Date.parse(item.createdAt ?? ''))).toEqual(
      [...first.latest].map(item => Date.parse(item.createdAt ?? '')).sort((left, right) => right - left),
    )

    const cached = await adapter.readHomeFeed()
    expect(cached).toMatchObject({ fetchedAt: first.fetchedAt, stale: false })
    expect(runner).toHaveBeenCalledTimes(3)
    await adapter.readHomeFeed(true)
    expect(runner).toHaveBeenCalledTimes(6)
  })

  it('ranks weekly picks from real dates, interaction counts, and content completeness', async () => {
    const createdAt = new Date().toISOString()
    const rows = [
      { topicId: '8001', title: '简短主题', content: '短文', createdAt, author: '作者' },
      { topicId: '8002', title: '完整主题', content: '较完整内容'.repeat(40), createdAt, author: '作者', url: 'https://example.test/full', images: ['https://example.test/image.webp'], likeCount: 100, totalCommentCount: 30, totalCollectionCount: 60 },
    ]
    const runner = vi.fn(async () => ({ stdout: JSON.stringify({ pageNum: 1, pageSize: 20, total: 2, records: rows }), stderr: '', exitCode: 0, timedOut: false, outputLimitExceeded: false, spawnFailed: false }))
    const feed = await new AipojuCliAdapter(runner).readHomeFeed()
    expect(feed.featured.map(item => item.topicId)).toEqual(['8002', '8001'])
  })

  it('retains the last successful home snapshot with a safe refresh error', async () => {
    const runner = vi.fn()
      .mockResolvedValueOnce({ stdout: JSON.stringify({ records: [topic], total: 1 }), stderr: '', exitCode: 0, timedOut: false, outputLimitExceeded: false, spawnFailed: false })
      .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: null, timedOut: true, outputLimitExceeded: false, spawnFailed: false })
    const adapter = new AipojuCliAdapter(runner)
    const first = await adapter.readHomeFeed()
    const stale = await adapter.readHomeFeed(true)
    expect(stale).toMatchObject({ fetchedAt: first.fetchedAt, stale: true, refreshErrorCode: 'CLI_TIMEOUT' })
    expect(stale.featured).toEqual(first.featured)
  })

  it('returns a true empty home feed and expires the snapshot after 15 minutes', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-13T00:00:00.000Z'))
    const runner = vi.fn(async () => ({ stdout: JSON.stringify({ pageNum: 1, pageSize: 20, total: 0, records: [] }), stderr: '', exitCode: 0, timedOut: false, outputLimitExceeded: false, spawnFailed: false }))
    const adapter = new AipojuCliAdapter(runner)
    const first = await adapter.readHomeFeed()
    expect(first).toMatchObject({ featured: [], latest: [], candidateCount: 0, stale: false })
    await adapter.readHomeFeed()
    expect(runner).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(15 * 60_000 + 1)
    await adapter.readHomeFeed()
    expect(runner).toHaveBeenCalledTimes(2)
  })

  it('serves a fresh home snapshot while a separate read is using the CLI', async () => {
    const success = (stdout: string) => ({ stdout, stderr: '', exitCode: 0, timedOut: false, outputLimitExceeded: false, spawnFailed: false })
    let finishSearch: ((result: ReturnType<typeof success>) => void) | undefined
    const runner = vi.fn((args: readonly string[]) => args.includes('-k')
      ? new Promise<ReturnType<typeof success>>(resolve => { finishSearch = resolve })
      : Promise.resolve(success(JSON.stringify({ records: [topic], total: 1 }))))
    const adapter = new AipojuCliAdapter(runner)
    const initial = await adapter.readHomeFeed()
    const search = adapter.read({ operation: 'topic.search', args: { keyword: 'test' } })
    const cached = await adapter.readHomeFeed()
    expect(cached).toMatchObject({ fetchedAt: initial.fetchedAt, stale: false })
    expect(runner).toHaveBeenCalledTimes(2)
    finishSearch?.(success(JSON.stringify({ topics: [topic] })))
    await search
  })

  it('continues only through the verified five-page, 100-row ceiling when candidates repeat', async () => {
    const repeatedRows = Array.from({ length: 20 }, (_, index) => ({
      topicId: String(7000 + index), title: `主题 ${index}`, createdAt: new Date(Date.now() - index * 60_000).toISOString(),
    }))
    const runner = vi.fn(async (args: readonly string[]) => {
      const page = Number(args[args.indexOf('--page') + 1])
      return {
        stdout: JSON.stringify({ pageNum: page, pageSize: 20, total: 100, records: repeatedRows }),
        stderr: '', exitCode: 0, timedOut: false, outputLimitExceeded: false, spawnFailed: false,
      }
    })
    const adapter = new AipojuCliAdapter(runner)
    const feed = await adapter.readHomeFeed()
    expect(runner).toHaveBeenCalledTimes(5)
    expect(feed.candidateCount).toBe(20)
    expect(feed.featured.length + feed.latest.length).toBeLessThanOrEqual(20)
  })

  it('allows only list, search, and detail and rejects argument escalation', async () => {
    const runner = vi.fn(async () => ({ stdout: JSON.stringify({ topics: [topic] }), stderr: '', exitCode: 0, timedOut: false, outputLimitExceeded: false, spawnFailed: false }))
    const adapter = new AipojuCliAdapter(runner)
    await expect(dispatchAipojuRead(adapter, 'topic.publish', {})).rejects.toMatchObject({ code: 'OPERATION_DENIED' })
    await expect(dispatchAipojuRead(adapter, 'topic.search', { keyword: '--help' })).rejects.toMatchObject({ code: 'INVALID_REQUEST' })
    await expect(dispatchAipojuRead(adapter, 'topic.list', { size: 11 })).rejects.toMatchObject({ code: 'INVALID_REQUEST' })
    await expect(dispatchAipojuRead(adapter, 'topic.detail', { topicId: '1;topic.publish' })).rejects.toMatchObject({ code: 'INVALID_REQUEST' })
    await expect(dispatchAipojuRead(adapter, 'topic.list', { refresh: true, extra: 'arg' })).rejects.toMatchObject({ code: 'INVALID_REQUEST' })
    expect(runner).not.toHaveBeenCalled()
  })

  it('dispatches fixed SCYS feed operations with an optional boolean refresh flag', async () => {
    const adapter = new AipojuCliAdapter()
    const queryFeed = vi.fn(async (mode: string, refresh = false) => ({ status: 'empty', query: { mode, refresh } }))
    const scys = { queryFeed } as never
    for (const mode of ['recent', 'hot', 'digested'] as const) {
      await expect(dispatchAipojuRead(adapter, `scys.${mode}`, {}, scys)).resolves.toMatchObject({ query: { mode, refresh: false } })
    }
    await expect(dispatchAipojuRead(adapter, 'scys.recent', { refresh: true }, scys)).resolves.toMatchObject({ query: { mode: 'recent', refresh: true } })
    await expect(dispatchAipojuRead(adapter, 'scys.callTool', { tool: 'topicLike' }, scys)).rejects.toMatchObject({ code: 'OPERATION_DENIED' })
    await expect(dispatchAipojuRead(adapter, 'scys.recent', { keyword: 'AI' }, scys)).rejects.toMatchObject({ code: 'INVALID_REQUEST' })
    await expect(dispatchAipojuRead(adapter, 'scys.recent', { refresh: 'yes' }, scys)).rejects.toMatchObject({ code: 'INVALID_REQUEST' })
    await expect(dispatchAipojuRead(adapter, 'scys.recent', {}, undefined)).rejects.toMatchObject({ code: 'OPERATION_DENIED' })
    expect(queryFeed.mock.calls).toEqual([['recent', false], ['hot', false], ['digested', false], ['recent', true]])
  })

  it('maps authentication, timeout, invalid response, and provider failures without raw text', async () => {
    const auth = new AipojuCliAdapter(async () => ({ stdout: '', stderr: 'not logged in; sensitive output', exitCode: 1, timedOut: false, outputLimitExceeded: false, spawnFailed: false }))
    await expect(auth.read({ operation: 'topic.search', args: { keyword: 'x' } })).rejects.toMatchObject({ code: 'AUTH_REQUIRED' })
    const timeout = new AipojuCliAdapter(async () => ({ stdout: '', stderr: '', exitCode: null, timedOut: true, outputLimitExceeded: false, spawnFailed: false }))
    await expect(timeout.read({ operation: 'topic.search', args: { keyword: 'x' } })).rejects.toMatchObject({ code: 'CLI_TIMEOUT' })
    const outputLimit = new AipojuCliAdapter(async () => ({ stdout: '', stderr: '', exitCode: null, timedOut: false, outputLimitExceeded: true, spawnFailed: false }))
    await expect(outputLimit.read({ operation: 'topic.search', args: { keyword: 'x' } })).rejects.toMatchObject({ code: 'CLI_OUTPUT_LIMIT' })
    const invalid = new AipojuCliAdapter(async () => ({ stdout: '{', stderr: '', exitCode: 0, timedOut: false, outputLimitExceeded: false, spawnFailed: false }))
    await expect(invalid.read({ operation: 'topic.search', args: { keyword: 'x' } })).rejects.toMatchObject({ code: 'JSON_PARSE_ERROR' })
    const failed = new AipojuCliAdapter(async () => ({ stdout: '', stderr: 'private details', exitCode: 1, timedOut: false, outputLimitExceeded: false, spawnFailed: false }))
    await expect(failed.read({ operation: 'topic.search', args: { keyword: 'x' } })).rejects.toMatchObject({ code: 'CLI_PROCESS_ERROR' })
    expect(new AipojuAdapterError('CLI_PROCESS_ERROR').message).toBe('CLI_PROCESS_ERROR')
  })

  it('disposes the adapter and prevents later process calls', async () => {
    const runner = vi.fn(async () => ({ stdout: JSON.stringify({ topics: [] }), stderr: '', exitCode: 0, timedOut: false, outputLimitExceeded: false, spawnFailed: false }))
    const adapter = new AipojuCliAdapter(runner)
    adapter.dispose()
    await expect(adapter.read({ operation: 'topic.search', args: { keyword: 'x' } })).rejects.toMatchObject({ code: 'CLI_PROCESS_ERROR' })
    expect(runner).not.toHaveBeenCalled()
  })

  it('allows one CLI process at a time', async () => {
    const success = { stdout: JSON.stringify({ topics: [] }), stderr: '', exitCode: 0, timedOut: false, outputLimitExceeded: false, spawnFailed: false }
    let release: ((value: typeof success) => void) | undefined
    const runner = vi.fn(() => new Promise<typeof success>((resolve) => { release = resolve }))
    const adapter = new AipojuCliAdapter(runner)
    const first = adapter.read({ operation: 'topic.search', args: { keyword: 'x' } })
    await expect(adapter.read({ operation: 'topic.detail', args: { topicId: '1' } })).rejects.toMatchObject({ code: 'CLI_BUSY' })
    release?.(success)
    await first
    expect(runner).toHaveBeenCalledTimes(1)
  })

  it('separates valid JSON with an unknown list mapping from parse and process failures', async () => {
    const raw = JSON.stringify({ payload: [{ id: 42, title: 'private title', body: 'private article body', images: [] }] })
    const adapter = new AipojuCliAdapter(async () => ({ stdout: raw, stderr: '', exitCode: 0, timedOut: false, outputLimitExceeded: false, spawnFailed: false }))
    let captured: unknown
    try { await adapter.read({ operation: 'topic.search', args: { keyword: 'x' } }) } catch (error) { captured = error }
    expect(captured).toMatchObject({ code: 'SCHEMA_MAPPING_ERROR' })
    const serialized = JSON.stringify(captured)
    expect(serialized).not.toContain('private title')
    expect(serialized).not.toContain('private article body')
    expect(serialized).not.toContain('cookie')
  })
})

describe('private Aipoju Unix socket', () => {
  it('does not include the channel token in the injected Renderer bridge', async () => {
    const swiftPath = fileURLToPath(new URL('../../../../desktop/macos/DeepSeekHarness.swift', import.meta.url))
    const source = await readFile(swiftPath, 'utf8')
    const start = source.indexOf('private func installAipojuBridge')
    const end = source.indexOf('func userContentController', start)
    expect(start).toBeGreaterThanOrEqual(0)
    expect(end).toBeGreaterThan(start)
    expect(source.slice(start, end)).not.toMatch(/token/i)
  })

  it('consumes valid launch configuration and removes secrets from the environment', () => {
    const root = homedir()
    const env: NodeJS.ProcessEnv = {
      DSH_AIPOJU_IPC_TOKEN: token,
      DSH_AIPOJU_IPC_PATH: join(root, 'Library', 'Application Support', 'DeepSeek Harness', 'aipoju-ipc', socketName),
    }
    const config = consumeAipojuHostIpcConfig(env)
    expect(config).toMatchObject({ token })
    expect(env.DSH_AIPOJU_IPC_TOKEN).toBeUndefined()
    expect(env.DSH_AIPOJU_IPC_PATH).toBeUndefined()
  })

  it('rejects a socket path that exceeds macOS sun_path capacity', async () => {
    const root = await makeRoot()
    const expectedDirectory = join(root, 'x'.repeat(70))
    const socketPath = join(expectedDirectory, socketName)
    await expect(startAipojuHostIpc({ socketPath, token, expectedDirectory })).rejects.toThrow('invalid private Aipoju IPC configuration')
  })

  it('rejects missing or forged tokens before calling the adapter', async () => {
    const { socketPath, adapter, runner } = await startFixture()
    const missing = await request(socketPath, { requestId: 'r1', token: '', operation: 'topic.list', args: {} })
    const forged = await request(socketPath, { requestId: 'r2', token: 'b'.repeat(32), operation: 'topic.list', args: {} })
    expect(missing).toMatchObject({ ok: false, errorCode: 'UNAUTHORIZED' })
    expect(forged).toMatchObject({ ok: false, errorCode: 'UNAUTHORIZED' })
    expect(runner).not.toHaveBeenCalled()
    adapter.dispose()
  })

  it('rejects privileged operations after authentication and dispatches a valid read', async () => {
    const { socketPath, runner } = await startFixture()
    const denied = await request(socketPath, { requestId: 'r3', token, operation: 'topic.comment', args: {} })
    const accepted = await request(socketPath, { requestId: 'r4', token, operation: 'topic.list', args: {} })
    expect(denied).toMatchObject({ ok: false, errorCode: 'OPERATION_DENIED' })
    expect(accepted).toMatchObject({ requestId: 'r4', ok: true, result: { featured: [{ topicId: '45548555825514558' }], candidateCount: 1 } })
    expect(runner).toHaveBeenCalledWith(['topic', 'list', '--page', '1', '--size', '20', '--json'])
  })

  it('requires the launch token for every SCYS feed operation and never accepts renderer query arguments', async () => {
    const queryFeed = vi.fn(async (mode: string, refresh = false) => ({ status: 'empty', query: { mode, refresh } }))
    const { socketPath } = await startFixture(JSON.stringify({ topics: [topic] }), { queryFeed } as unknown as ScysRadarAdapter)
    const denied = await request(socketPath, { requestId: 'r6', token: 'b'.repeat(32), operation: 'scys.recent', args: {} })
    expect(denied).toMatchObject({ ok: false, errorCode: 'UNAUTHORIZED' })
    const accepted = await Promise.all((['recent', 'hot', 'digested'] as const).map(mode => request(socketPath, {
      requestId: `r-${mode}`, token, operation: `scys.${mode}`, args: {},
    })))
    const escalation = await request(socketPath, { requestId: 'r8', token, operation: 'scys.hot', args: { isHot: false } })
    expect(accepted.map(response => response.result)).toEqual(['recent', 'hot', 'digested'].map(mode => ({ status: 'empty', query: { mode, refresh: false } })))
    expect(escalation).toMatchObject({ ok: false, errorCode: 'INVALID_REQUEST' })
    expect(queryFeed).toHaveBeenCalledTimes(3)
    expect(queryFeed).toHaveBeenCalledWith('recent', false)
    expect(queryFeed).toHaveBeenCalledWith('hot', false)
    expect(queryFeed).toHaveBeenCalledWith('digested', false)
  })

  it('rejects SCYS feed operations when no SCYS adapter is mounted', async () => {
    const { socketPath } = await startFixture()
    const denied = await request(socketPath, { requestId: 'r9', token, operation: 'scys.digested', args: {} })
    expect(denied).toMatchObject({ ok: false, errorCode: 'OPERATION_DENIED' })
  })

  it('returns only a safe error code when the authenticated CLI response schema is unknown', async () => {
    const stdout = JSON.stringify({ payload: [{ id: '42', title: 'private title', content: 'private member text' }] })
    const { socketPath } = await startFixture(stdout)
    const response = await request(socketPath, { requestId: 'r5', token, operation: 'topic.list', args: {} })
    expect(response).toMatchObject({ ok: false, errorCode: 'SCHEMA_MAPPING_ERROR' })
    const serialized = JSON.stringify(response)
    expect(serialized).not.toContain('private title')
    expect(serialized).not.toContain('private member text')
  })

  it('creates the socket with owner-only permissions', async () => {
    const { socketPath } = await startFixture()
    const socket = await lstat(socketPath)
    expect(socket.isSocket()).toBe(true)
    expect(socket.mode & 0o777).toBe(0o600)
  })

  it('requires a private owner-only directory and consumes launch credentials', async () => {
    const root = await makeRoot()
    await chmod(root, 0o755)
    await expect(startAipojuHostIpc({ socketPath: join(root, socketName), token, expectedDirectory: root })).rejects.toThrow('owner-only')
    const env: NodeJS.ProcessEnv = { DSH_AIPOJU_IPC_TOKEN: token, DSH_AIPOJU_IPC_PATH: join(root, 'wrong.sock') }
    expect(() => consumeAipojuHostIpcConfig(env)).toThrow()
    expect(env.DSH_AIPOJU_IPC_TOKEN).toBeUndefined()
    expect(env.DSH_AIPOJU_IPC_PATH).toBeUndefined()
  })
})

async function startFixture(stdout = JSON.stringify({ topics: [topic] }), scysRadar?: ScysRadarAdapter) {
  const root = await makeRoot()
  await chmod(root, 0o700)
  const socketPath = join(root, socketName)
  const runner = vi.fn(async () => ({ stdout, stderr: '', exitCode: 0, timedOut: false, outputLimitExceeded: false, spawnFailed: false }))
  const adapter = new AipojuCliAdapter(runner)
  closers.push(async () => { adapter.dispose() })
  const server = await startAipojuHostIpc({ socketPath, token, adapter, ...(scysRadar === undefined ? {} : { scysRadar }), expectedDirectory: root })
  closers.push(() => server.close())
  return { socketPath, adapter, runner }
}

async function makeRoot(): Promise<string> {
  const root = await mkdtemp(join('/private/tmp', 'aipoju-ipc-'))
  roots.push(root)
  return root
}

async function request(socketPath: string, value: unknown): Promise<Record<string, unknown>> {
  return await new Promise((resolve, reject) => {
    const socket = createConnection(socketPath)
    let response = ''
    socket.once('connect', () => socket.write(`${JSON.stringify(value)}\n`))
    socket.on('data', (chunk) => {
      response += chunk.toString('utf8')
      if (!response.includes('\n')) return
      socket.end()
      try { resolve(JSON.parse(response.trim()) as Record<string, unknown>) } catch (error) { reject(error instanceof Error ? error : new Error('Invalid test response')) }
    })
    socket.once('error', reject)
  })
}
