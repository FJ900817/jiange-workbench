/** Fixed, read-only adapter for the authenticated Breakout CLI. */

import { spawn } from 'node:child_process'
import { isIP } from 'node:net'
import { homedir } from 'node:os'
import type { ScysFeedMode } from './types.ts'
import type { ScysRadarAdapter } from './scys-radar-adapter.ts'

const BREAKOUT_CLI_PATH = '/Users/jane/.npm-global/bin/breakout'
const COMMAND_TIMEOUT_MS = 20_000
const OUTPUT_LIMIT_BYTES = 2 * 1024 * 1024
const CLI_PAGE_SIZE = 20
const INITIAL_CANDIDATE_LIMIT = 50
const MAX_CANDIDATE_LIMIT = 100
const MAX_CLI_PAGES = MAX_CANDIDATE_LIMIT / CLI_PAGE_SIZE
const LATEST_DISPLAY_LIMIT = 12
const HOME_CACHE_TTL_MS = 15 * 60_000
const MAX_SEARCH_RESULTS = 20
const MAX_KEYWORD_LENGTH = 80

/** Renderer-safe topic fields returned by the adapter. */
export interface AipojuTopic {
  readonly topicId: string
  readonly title: string
  readonly content: string | null
  readonly author: string | null
  readonly createdAt: string | null
  readonly sourceUrl: string | null
  readonly images: readonly string[] | null
  readonly interactionCounts: Readonly<Record<string, number>> | null
}

/** In-memory home feed projected from official topic-list pages. */
export interface AipojuHomeFeed {
  readonly featured: readonly AipojuTopic[]
  readonly latest: readonly AipojuTopic[]
  readonly candidateCount: number
  readonly fetchedAt: string
  readonly stale: boolean
  readonly refreshErrorCode: AipojuAdapterErrorCode | null
}

/** Closed request union accepted by the private Desktop channel. */
export type AipojuReadRequest =
  | { readonly operation: 'topic.list'; readonly args: { readonly refresh?: boolean } }
  | { readonly operation: 'topic.search'; readonly args: { readonly keyword: string } }
  | { readonly operation: 'topic.detail'; readonly args: { readonly topicId: string } }

/** Safe error codes that never include CLI output. */
export type AipojuAdapterErrorCode =
  | 'INVALID_REQUEST'
  | 'OPERATION_DENIED'
  | 'CLI_BUSY'
  | 'CLI_TIMEOUT'
  | 'CLI_OUTPUT_LIMIT'
  | 'CLI_PROCESS_ERROR'
  | 'AUTH_REQUIRED'
  | 'UPSTREAM_REJECTED'
  | 'JSON_PARSE_ERROR'
  | 'SCHEMA_MAPPING_ERROR'

/** Typed adapter failure with a renderer-safe code. */
export class AipojuAdapterError extends Error {
  constructor(readonly code: AipojuAdapterErrorCode) {
    super(code)
    this.name = 'AipojuAdapterError'
  }
}

interface CliResult {
  readonly stdout: string
  readonly stderr: string
  readonly exitCode: number | null
  readonly timedOut: boolean
  readonly outputLimitExceeded: boolean
  readonly spawnFailed: boolean
}

type CliRunner = (args: readonly string[]) => Promise<CliResult>

/** Spawn the fixed official CLI with a small, non-secret environment. */
function runBreakout(args: readonly string[]): Promise<CliResult> {
  return new Promise((resolveResult) => {
    let stdout = Buffer.alloc(0)
    let stderr = Buffer.alloc(0)
    let timedOut = false
    let outputLimitExceeded = false
    let settled = false
    let killTimer: NodeJS.Timeout | undefined
    const finish = (result: CliResult, timeout?: NodeJS.Timeout): void => {
      if (settled) return
      settled = true
      if (timeout !== undefined) clearTimeout(timeout)
      if (killTimer !== undefined) clearTimeout(killTimer)
      resolveResult(result)
    }
    const home = homedir()
    const env: NodeJS.ProcessEnv = {
      HOME: home,
      PATH: '/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin',
      TMPDIR: process.env.TMPDIR ?? '/tmp',
      LANG: 'en_US.UTF-8',
    }
    let child: ReturnType<typeof spawn>
    try {
      child = spawn(BREAKOUT_CLI_PATH, [...args], {
        cwd: home,
        env,
        shell: false,
        detached: process.platform !== 'win32',
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      })
    } catch {
      finish({ stdout: '', stderr: '', exitCode: null, timedOut: false, outputLimitExceeded: false, spawnFailed: true })
      return
    }
    const terminate = (): void => {
      if (process.platform !== 'win32' && child.pid !== undefined) {
        const processId = child.pid
        try { process.kill(-processId, 'SIGTERM') } catch { /* Process group already exited. */ }
        killTimer = setTimeout(() => {
          try { process.kill(-processId, 'SIGKILL') } catch { /* Process group already exited. */ }
        }, 500)
      } else {
        child.kill('SIGTERM')
      }
    }
    const timeout = setTimeout(() => {
      timedOut = true
      terminate()
    }, COMMAND_TIMEOUT_MS)
    const collect = (target: 'stdout' | 'stderr', chunk: Buffer | string): void => {
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
      if (stdout.length + stderr.length + bytes.length > OUTPUT_LIMIT_BYTES) {
        outputLimitExceeded = true
        clearTimeout(timeout)
        terminate()
        return
      }
      if (target === 'stdout') stdout = Buffer.concat([stdout, bytes])
      else stderr = Buffer.concat([stderr, bytes])
    }
    child.stdout?.on('data', (chunk: Buffer | string) => { collect('stdout', chunk) })
    child.stderr?.on('data', (chunk: Buffer | string) => { collect('stderr', chunk) })
    child.once('error', () => {
      finish({ stdout: '', stderr: '', exitCode: null, timedOut: false, outputLimitExceeded: false, spawnFailed: true }, timeout)
    })
    child.once('close', (code) => {
      finish({
        stdout: stdout.toString('utf8'), stderr: stderr.toString('utf8'), exitCode: code,
        timedOut, outputLimitExceeded, spawnFailed: false,
      }, timeout)
    })
  })
}

/** Run only topic list, keyword search, and detail using fixed CLI argument templates. */
export class AipojuCliAdapter {
  private active = false
  private disposed = false
  private homeCache: { readonly feed: AipojuHomeFeed; readonly expiresAt: number } | undefined

  constructor(private readonly runner: CliRunner = runBreakout) {}

  /** Execute one validated read request; concurrent calls fail closed.
   * @param request Fixed read operation and validated arguments.
   * @returns Normalized topic data without unrecognized CLI fields.
   */
  async read(request: AipojuReadRequest): Promise<unknown> {
    if (this.disposed) throw new AipojuAdapterError('CLI_PROCESS_ERROR')
    if (request.operation === 'topic.list') return await this.readHomeFeed(request.args.refresh ?? false)
    if (this.active) throw new AipojuAdapterError('CLI_BUSY')
    const args = commandFor(request)
    this.active = true
    try {
      const result = await this.runner(args)
      if (result.timedOut) throw new AipojuAdapterError('CLI_TIMEOUT')
      if (result.outputLimitExceeded) throw new AipojuAdapterError('CLI_OUTPUT_LIMIT')
      if (result.spawnFailed || result.exitCode !== 0) {
        throw new AipojuAdapterError(result.spawnFailed ? 'CLI_PROCESS_ERROR' : classifyCliFailure(result.stderr))
      }
      let payload: unknown
      try { payload = JSON.parse(stripAnsi(result.stdout).trim()) as unknown } catch {
        throw new AipojuAdapterError('JSON_PARSE_ERROR')
      }
      try {
        if (request.operation === 'topic.detail') {
          return normalizeTopic(extractDetail(payload))
        }
        const extracted = extractTopicList(payload)
        const topics = extracted.rows.map(row => normalizeTopic(row))
        return Object.freeze({ topics: Object.freeze(topics), pageSize: MAX_SEARCH_RESULTS })
      } catch (error) {
        if (error instanceof AipojuAdapterError) throw error
        throw new AipojuAdapterError('SCHEMA_MAPPING_ERROR')
      }
    } finally {
      this.active = false
    }
  }

  /** Read a cached 15-minute home feed or refresh it from bounded official pages.
   * @param refresh Bypass a fresh in-memory snapshot when true.
   * @returns Locally ranked featured topics and date-sorted latest topics.
   */
  async readHomeFeed(refresh = false): Promise<AipojuHomeFeed> {
    if (this.disposed) throw new AipojuAdapterError('CLI_PROCESS_ERROR')
    const now = Date.now()
    if (!refresh && this.homeCache !== undefined && now < this.homeCache.expiresAt) {
      return Object.freeze({ ...this.homeCache.feed, stale: false, refreshErrorCode: null })
    }
    if (this.active) throw new AipojuAdapterError('CLI_BUSY')
    this.active = true
    try {
      const candidates = await this.fetchHomeCandidates()
      const fetchedAt = new Date().toISOString()
      const feed = buildHomeFeed(candidates, fetchedAt, Date.now())
      this.homeCache = { feed, expiresAt: Date.now() + HOME_CACHE_TTL_MS }
      return feed
    } catch (error) {
      if (this.homeCache !== undefined) {
        const code = error instanceof AipojuAdapterError ? error.code : 'CLI_PROCESS_ERROR'
        return Object.freeze({ ...this.homeCache.feed, stale: true, refreshErrorCode: code })
      }
      throw error
    } finally {
      this.active = false
    }
  }

  /** Prevent new CLI requests after the Host begins shutting down. */
  dispose(): void {
    this.disposed = true
  }

  private async fetchHomeCandidates(): Promise<readonly AipojuTopic[]> {
    const topics: AipojuTopic[] = []
    for (let page = 1; page <= MAX_CLI_PAGES; page += 1) {
      const response = await this.runListPage(page, CLI_PAGE_SIZE)
      topics.push(...response.topics)
      const unique = deduplicateTopics(topics)
      if (unique.length >= INITIAL_CANDIDATE_LIMIT) return unique.slice(0, INITIAL_CANDIDATE_LIMIT)
      if (!response.hasMore || page === MAX_CLI_PAGES) return unique.slice(0, MAX_CANDIDATE_LIMIT)
    }
    return deduplicateTopics(topics).slice(0, MAX_CANDIDATE_LIMIT)
  }

  private async runListPage(page: number, size: number, keyword?: string): Promise<{ readonly topics: readonly AipojuTopic[]; readonly hasMore: boolean }> {
    const args = keyword === undefined
      ? ['topic', 'list', '--page', String(page), '--size', String(size), '--json']
      : ['topic', 'list', '--page', String(page), '--size', String(size), '-k', keyword, '--json']
    const result = await this.runner(args)
    if (result.timedOut) throw new AipojuAdapterError('CLI_TIMEOUT')
    if (result.outputLimitExceeded) throw new AipojuAdapterError('CLI_OUTPUT_LIMIT')
    if (result.spawnFailed || result.exitCode !== 0) throw new AipojuAdapterError(result.spawnFailed ? 'CLI_PROCESS_ERROR' : classifyCliFailure(result.stderr))
    let payload: unknown
    try { payload = JSON.parse(stripAnsi(result.stdout).trim()) as unknown } catch {
      throw new AipojuAdapterError('JSON_PARSE_ERROR')
    }
    try {
      const extracted = extractTopicList(payload)
      const topics = extracted.rows.map(row => normalizeTopic(row))
      const pageNumber = extracted.pageNum ?? page
      const pageSize = extracted.pageSize ?? size
      const hasMore = extracted.hasMore ?? (extracted.total === undefined ? topics.length >= pageSize : pageNumber * pageSize < extracted.total)
      return { topics, hasMore }
    } catch (error) {
      if (error instanceof AipojuAdapterError) throw error
      throw new AipojuAdapterError('SCHEMA_MAPPING_ERROR')
    }
  }

}

/** Validate an untrusted IPC envelope and dispatch one fixed read operation.
 * @param adapter The fixed Breakout CLI adapter.
 * @param operation Untrusted operation name from the socket request.
 * @param args Untrusted operation arguments from the socket request.
 * @returns Normalized read-only result.
 */
export async function dispatchAipojuRead(adapter: AipojuCliAdapter, operation: unknown, args: unknown, scysRadar?: ScysRadarAdapter): Promise<unknown> {
  if (typeof operation !== 'string' || !isRecord(args)) throw new AipojuAdapterError('INVALID_REQUEST')
  if (operation === 'scys.recent' || operation === 'scys.hot' || operation === 'scys.digested') {
    if (!hasOnlyKeys(args, ['refresh']) || (args.refresh !== undefined && typeof args.refresh !== 'boolean')) throw new AipojuAdapterError('INVALID_REQUEST')
    if (scysRadar === undefined) throw new AipojuAdapterError('OPERATION_DENIED')
    const mode = operation.slice('scys.'.length) as ScysFeedMode
    return await scysRadar.queryFeed(mode, args.refresh ?? false)
  }
  if (operation === 'topic.list') {
    if (!hasOnlyKeys(args, ['refresh']) || (args.refresh !== undefined && typeof args.refresh !== 'boolean')) throw new AipojuAdapterError('INVALID_REQUEST')
    return await adapter.readHomeFeed(args.refresh ?? false)
  }
  if (operation === 'topic.search') {
    if (!hasOnlyKeys(args, ['keyword']) || typeof args.keyword !== 'string') throw new AipojuAdapterError('INVALID_REQUEST')
    const keyword = args.keyword.trim()
    if (keyword.length === 0 || keyword.startsWith('-') || Array.from(keyword).length > MAX_KEYWORD_LENGTH || /[\u0000-\u001f\u007f]/u.test(keyword)) throw new AipojuAdapterError('INVALID_REQUEST')
    return await adapter.read({ operation, args: { keyword } })
  }
  if (operation === 'topic.detail') {
    if (!hasOnlyKeys(args, ['topicId']) || typeof args.topicId !== 'string' || !/^\d{1,32}$/u.test(args.topicId)) throw new AipojuAdapterError('INVALID_REQUEST')
    return await adapter.read({ operation, args: { topicId: args.topicId } })
  }
  throw new AipojuAdapterError('OPERATION_DENIED')
}

function commandFor(request: AipojuReadRequest): string[] {
  switch (request.operation) {
    case 'topic.list': return ['topic', 'list', '--page', '1', '--size', String(CLI_PAGE_SIZE), '--json']
    case 'topic.search': return ['topic', 'list', '--page', '1', '--size', String(MAX_SEARCH_RESULTS), '-k', request.args.keyword, '--json']
    case 'topic.detail': return ['topic', 'detail', request.args.topicId, '--json']
  }
}

function extractTopicList(value: unknown): {
  readonly rows: unknown[]
  readonly path: string
  readonly total?: number
  readonly pageNum?: number
  readonly pageSize?: number
  readonly hasMore?: boolean
} {
  const candidates: Array<{ readonly rows: unknown; readonly path: string }> = [
    { rows: value, path: '$' },
    { rows: isRecord(value) ? value.records : undefined, path: '$.records' },
    { rows: isRecord(value) ? value.topics : undefined, path: '$.topics' },
    { rows: isRecord(value) ? value.items : undefined, path: '$.items' },
    { rows: isRecord(value) ? value.data : undefined, path: '$.data' },
    { rows: isRecord(value) && isRecord(value.data) ? value.data.records : undefined, path: '$.data.records' },
    { rows: isRecord(value) && isRecord(value.data) ? value.data.topics : undefined, path: '$.data.topics' },
    { rows: isRecord(value) && isRecord(value.data) ? value.data.items : undefined, path: '$.data.items' },
    { rows: isRecord(value) && isRecord(value.result) ? value.result.topics : undefined, path: '$.result.topics' },
  ]
  const found = candidates.find(candidate => Array.isArray(candidate.rows))
  if (found === undefined || !Array.isArray(found.rows) || found.rows.some(row => !isRecord(row))) throw new Error('unrecognized topic-list structure')
  const envelope = found.path.startsWith('$.data') && isRecord(value) && isRecord(value.data) ? value.data : value
  const total = isRecord(envelope) ? readPositiveInteger(envelope.total) ?? readPositiveInteger(envelope.totalCount) : undefined
  const pageNum = isRecord(envelope) ? readPositiveInteger(envelope.pageNum) ?? readPositiveInteger(envelope.page) : undefined
  const pageSize = isRecord(envelope) ? readPositiveInteger(envelope.pageSize) : undefined
  const hasMore = isRecord(envelope) ? readBoolean(envelope.hasMore) ?? readBoolean(envelope.hasNextPage) : undefined
  return {
    rows: found.rows,
    path: found.path,
    ...(total === undefined ? {} : { total }),
    ...(pageNum === undefined ? {} : { pageNum }),
    ...(pageSize === undefined ? {} : { pageSize }),
    ...(hasMore === undefined ? {} : { hasMore }),
  }
}

function extractDetail(value: unknown): unknown {
  if (!isRecord(value)) throw new Error('unrecognized detail structure')
  const candidates = [value.topic, value.data, value.result]
  const found = candidates.find(isRecord)
  return found ?? value
}

function normalizeTopic(value: unknown): AipojuTopic {
  if (!isRecord(value)) throw new Error('topic row is not an object')
  const topicId = readString(value.topicId) ?? readTopicId(value.id)
  const title = readString(value.title) ?? ''
  if (topicId === undefined || !/^\d{1,32}$/u.test(topicId)) throw new Error('topic row lacks required fields')
  const sourceUrl = readString(value.sourceUrl) ?? readString(value.url)
  const images = readImageUrls(value.images)
  return Object.freeze({
    topicId,
    title,
    content: readString(value.content) ?? null,
    author: readNonEmptyString(value.author) ?? readNonEmptyString(value.fullName) ?? readNonEmptyString(value.userFullName) ?? null,
    createdAt: readString(value.createdAt) ?? null,
    sourceUrl: sourceUrl !== undefined && isHttpUrl(sourceUrl) ? sourceUrl : null,
    images: images === undefined ? null : Object.freeze(images.filter(isHttpUrl)),
    interactionCounts: normalizeCounts(value.interactionCounts) ?? normalizeRecordCounts(value),
  })
}

function buildHomeFeed(topics: readonly AipojuTopic[], fetchedAt: string, now: number): AipojuHomeFeed {
  const unique = deduplicateTopics(topics)
  const newestFirst = unique
    .map((topic, index) => ({ topic, index, timestamp: parseTimestamp(topic.createdAt) }))
    .sort((left, right) => (right.timestamp ?? Number.NEGATIVE_INFINITY) - (left.timestamp ?? Number.NEGATIVE_INFINITY) || left.index - right.index)
  const featured = newestFirst
    .filter(({ timestamp }) => timestamp !== null && timestamp <= now && now - timestamp <= 7 * 24 * 60 * 60_000)
    .map(({ topic, timestamp }) => ({ topic, score: featuredScore(topic, timestamp as number, now) }))
    .sort((left, right) => right.score - left.score)
    .slice(0, 8)
    .map(({ topic }) => topic)
  const featuredIds = new Set(featured.map(topic => topic.topicId))
  const latest = newestFirst
    .map(({ topic }) => topic)
    .filter(topic => !featuredIds.has(topic.topicId))
    .slice(0, LATEST_DISPLAY_LIMIT)
  return Object.freeze({
    featured: Object.freeze(featured),
    latest: Object.freeze(latest),
    candidateCount: unique.length,
    fetchedAt,
    stale: false,
    refreshErrorCode: null,
  })
}

function featuredScore(topic: AipojuTopic, timestamp: number, now: number): number {
  const ageDays = (now - timestamp) / (24 * 60 * 60_000)
  const recency = Math.max(0, 7 - ageDays) * 4
  const counts = topic.interactionCounts ?? {}
  const likes = countFor(counts, ['likes', 'likeCount', 'totalLikeCount'])
  const comments = countFor(counts, ['comments', 'commentCount', 'totalCommentCount'])
  const collections = countFor(counts, ['collections', 'collectCount', 'collectionCount', 'totalCollectionCount'])
  const engagement = Math.log2(likes + 1) * 2 + Math.log2(comments + 1) * 3 + Math.log2(collections + 1) * 2
  const completeness = Math.min((topic.content?.trim().length ?? 0) / 300, 1) * 20
    + Number(topic.title.trim().length > 0) * 4
    + Number(topic.author !== null) * 2
    + Number(topic.sourceUrl !== null) * 2
    + (topic.images?.length ? 5 : 0)
  return recency + engagement + completeness
}

function countFor(counts: Readonly<Record<string, number>>, keys: readonly string[]): number {
  for (const key of keys) {
    const value = counts[key]
    if (value !== undefined && Number.isFinite(value) && value >= 0) return value
  }
  return 0
}

function deduplicateTopics(topics: readonly AipojuTopic[]): AipojuTopic[] {
  const unique = new Map<string, AipojuTopic>()
  for (const topic of topics) {
    const current = unique.get(topic.topicId)
    if (current === undefined || topicCompleteness(topic) > topicCompleteness(current)) unique.set(topic.topicId, topic)
  }
  return [...unique.values()]
}

function topicCompleteness(topic: AipojuTopic): number {
  return Number(topic.title.trim().length > 0)
    + Number((topic.content?.trim().length ?? 0) > 0)
    + Number(topic.author !== null)
    + Number(topic.createdAt !== null && parseTimestamp(topic.createdAt) !== null)
    + Number(topic.sourceUrl !== null)
    + (topic.images?.length ?? 0)
    + Object.keys(topic.interactionCounts ?? {}).length
}

function parseTimestamp(value: string | null): number | null {
  if (value === null) return null
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp) ? timestamp : null
}

function readPositiveInteger(value: unknown): number | undefined {
  return Number.isSafeInteger(value) && (value as number) > 0 ? value as number : undefined
}

function readBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined
}

function normalizeCounts(value: unknown): Readonly<Record<string, number>> | null {
  if (!isRecord(value)) return null
  const entries = Object.entries(value).filter(([key, count]) => /^[A-Za-z][A-Za-z0-9]{0,31}$/u.test(key)
    && typeof count === 'number' && Number.isFinite(count) && count >= 0)
  return entries.length === 0 ? null : Object.freeze(Object.fromEntries(entries) as Record<string, number>)
}

function normalizeRecordCounts(value: Record<string, unknown>): Readonly<Record<string, number>> | null {
  const counts = {
    likes: readCount(value.likeCount) ?? readCount(value.totalLikeCount) ?? readCount(value.systemLikeCount),
    comments: readCount(value.totalCommentCount) ?? readCount(value.comments) ?? readCount(value.systemCommentCount),
    collections: readCount(value.totalCollectionCount),
  }
  const entries = Object.entries(counts).filter((entry): entry is [string, number] => entry[1] !== undefined)
  return entries.length === 0 ? null : Object.freeze(Object.fromEntries(entries))
}

function readCount(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function readNonEmptyString(value: unknown): string | undefined {
  const text = readString(value)?.trim()
  return text === undefined || text.length === 0 ? undefined : text
}

function readTopicId(value: unknown): string | undefined {
  if (typeof value === 'string') return value
  return Number.isSafeInteger(value) && (value as number) > 0 ? String(value) : undefined
}

function readImageUrls(value: unknown): string[] | undefined {
  if (Array.isArray(value)) return value.every(item => typeof item === 'string') ? value as string[] : undefined
  if (typeof value !== 'string') return undefined
  const text = value.trim()
  if (text.length === 0) return []
  try {
    const parsed: unknown = JSON.parse(text)
    if (Array.isArray(parsed) && parsed.every(item => typeof item === 'string')) return parsed as string[]
  } catch { /* The source may provide one URL rather than a JSON array. */ }
  return isHttpUrl(text) ? [text] : undefined
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value)
    const hostname = url.hostname.toLowerCase()
    return ['http:', 'https:'].includes(url.protocol)
      && url.username.length === 0
      && url.password.length === 0
      && hostname !== 'localhost'
      && !hostname.endsWith('.localhost')
      && !hostname.endsWith('.local')
      && isIP(hostname) === 0
  } catch { return false }
}

function classifyCliFailure(stderr: string): AipojuAdapterErrorCode {
  const normalized = stderr.toLowerCase()
  if (/not authenticated|not logged in|unauthorized|authentication required/u.test(normalized)) return 'AUTH_REQUIRED'
  if (/10010|permission denied|forbidden/u.test(normalized)) return 'UPSTREAM_REJECTED'
  return 'CLI_PROCESS_ERROR'
}

function stripAnsi(value: string): string {
  return value.replace(/\u001b\[[0-?]*[ -/]*[@-~]/gu, '')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasOnlyKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).every(key => keys.includes(key))
}
