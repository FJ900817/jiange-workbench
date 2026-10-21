/** Host-only, bounded delivery for images returned by the fixed XHS source. */

import { randomUUID } from 'node:crypto'
import { Buffer } from 'node:buffer'
import type { XhsCoverAssetResult } from './types.ts'

const ALLOWED_HOSTS = new Set([
  'sns-webpic-qc.xhscdn.com',
  'sns-img-qc.xhscdn.com',
  'sns-img-hw.xhscdn.com',
  'sns-img-bd.xhscdn.com',
  'sns-img-qn.xhscdn.com',
])
const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif'])
const MAX_IMAGE_BYTES = 2 * 1024 * 1024
const MAX_CACHE_ENTRIES = 50
const MAX_REFERENCES = 400
const MAX_REDIRECTS = 3
const FETCH_TIMEOUT_MS = 10_000
const MAX_CONCURRENT_FETCHES = 4

interface CachedImage {
  readonly mimeType: string
  readonly bytes: Uint8Array
}

/** Resolves opaque search and detail image references to in-memory, validated payloads. */
export class XhsCoverDelivery {
  private readonly references = new Map<string, string>()
  private readonly cache = new Map<string, CachedImage>()
  private readonly inflight = new Map<string, Promise<CachedImage | undefined>>()
  private readonly waiters: (() => void)[] = []
  private activeFetches = 0

  /** Retain an allowlisted XHS image URL behind a random, process-local reference.
   * @param url - A source image URL selected from one mapped feed or detail.
   * @returns An opaque reference, or null when the URL is not allowlisted.
   */
  register(url: string | null): string | null {
    if (url === null || validatedUrl(url) === undefined) return null
    const assetId = randomUUID()
    this.references.set(assetId, url)
    if (this.references.size > MAX_REFERENCES) {
      const oldest = this.references.keys().next().value
      if (oldest !== undefined) this.references.delete(oldest)
    }
    return assetId
  }

  /** Fetch one registered image without forwarding source credentials or its URL.
   * @param assetId - A reference returned by this process's feed mapper.
   * @param fetcher - The HTTP implementation, injectable for tests.
   * @returns A validated image payload or a content-free error result.
   */
  async get(assetId: string, fetcher: typeof fetch = fetch): Promise<XhsCoverAssetResult> {
    const url = this.references.get(assetId)
    if (url === undefined) return { status: 'error' }
    let image = this.cache.get(url)
    let cacheHit = image !== undefined
    if (image !== undefined) {
      this.cache.delete(url)
      this.cache.set(url, image)
    } else {
      let pending = this.inflight.get(url)
      if (pending === undefined) {
        pending = this.fetchImage(url, fetcher)
        this.inflight.set(url, pending)
      } else cacheHit = true
      image = await pending
      if (this.inflight.get(url) === pending) this.inflight.delete(url)
    }
    if (image === undefined) return { status: 'error' }
    return { status: 'ready', mimeType: image.mimeType, base64: Buffer.from(image.bytes).toString('base64'), cacheKey: assetId, cacheHit }
  }

  private async fetchImage(initialUrl: string, fetcher: typeof fetch): Promise<CachedImage | undefined> {
    const signal = AbortSignal.timeout(FETCH_TIMEOUT_MS)
    await this.acquire()
    try {
      const image = await fetchValidatedImage(initialUrl, fetcher, signal)
      if (image === undefined) return undefined
      this.cache.set(initialUrl, image)
      while (this.cache.size > MAX_CACHE_ENTRIES) {
        const oldest = this.cache.keys().next().value
        if (oldest === undefined) break
        this.cache.delete(oldest)
      }
      return image
    } catch {
      return undefined
    } finally {
      this.release()
    }
  }

  private async acquire(): Promise<void> {
    if (this.activeFetches < MAX_CONCURRENT_FETCHES) {
      this.activeFetches += 1
      return
    }
    await new Promise<void>(resolve => { this.waiters.push(resolve) })
  }

  private release(): void {
    const next = this.waiters.shift()
    if (next !== undefined) next()
    else this.activeFetches -= 1
  }
}

async function fetchValidatedImage(initialUrl: string, fetcher: typeof fetch, signal: AbortSignal): Promise<CachedImage | undefined> {
  let url = validatedUrl(initialUrl)
  if (url === undefined) return undefined
  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
    const response = await fetcher(url, {
      method: 'GET',
      headers: { accept: [...ALLOWED_MIME_TYPES].join(', ') },
      credentials: 'omit',
      redirect: 'manual',
      signal,
    })
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location')
      await response.body?.cancel().catch(() => undefined)
      if (location === null || redirectCount === MAX_REDIRECTS) return undefined
      try {
        const redirectUrl = validatedUrl(new URL(location, url).toString())
        if (redirectUrl === undefined || new URL(redirectUrl).hostname !== new URL(initialUrl).hostname) return undefined
        url = redirectUrl
      } catch { return undefined }
      continue
    }
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined)
      return undefined
    }
    const mimeType = response.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase()
    if (mimeType === undefined || !ALLOWED_MIME_TYPES.has(mimeType)) {
      await response.body?.cancel().catch(() => undefined)
      return undefined
    }
    const contentLength = Number(response.headers.get('content-length'))
    if (Number.isFinite(contentLength) && contentLength > MAX_IMAGE_BYTES) {
      await response.body?.cancel().catch(() => undefined)
      return undefined
    }
    const bytes = await readLimitedBody(response, MAX_IMAGE_BYTES)
    return bytes === undefined || bytes.length === 0 ? undefined : { mimeType, bytes }
  }
  return undefined
}

async function readLimitedBody(response: Response, maxBytes: number): Promise<Uint8Array | undefined> {
  if (response.body === null) return undefined
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > maxBytes) {
        await reader.cancel()
        return undefined
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }
  const bytes = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return bytes
}

function validatedUrl(value: string): string | undefined {
  try {
    const url = new URL(value)
    if ((url.protocol !== 'http:' && url.protocol !== 'https:') || !ALLOWED_HOSTS.has(url.hostname) || url.username !== '' || url.password !== '') return undefined
    if (url.port !== '' && url.port !== (url.protocol === 'http:' ? '80' : '443')) return undefined
    return url.toString()
  } catch {
    return undefined
  }
}
