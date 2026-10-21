import { describe, expect, it, vi } from 'vitest'
import { XhsCoverDelivery } from '../src/xhs-cover-delivery.ts'

const COVER_URL = 'http://sns-webpic-qc.xhscdn.com/path/cover.webp?signature=private'

function imageResponse(bytes = new Uint8Array([1, 2, 3]), mimeType = 'image/webp'): Response {
  return new Response(bytes, { status: 200, headers: { 'content-type': mimeType } })
}

describe('XHS cover delivery', () => {
  it('delivers bounded image bytes without exposing or forwarding source credentials', async () => {
    const delivery = new XhsCoverDelivery()
    const assetId = delivery.register(COVER_URL)!
    const timeout = vi.spyOn(AbortSignal, 'timeout')
    let timeoutMs: number | undefined
    timeout.mockImplementation(milliseconds => { timeoutMs = milliseconds; return new AbortController().signal })
    const fetcher = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => imageResponse())

    const result = await delivery.get(assetId, fetcher)

    expect(result).toMatchObject({ status: 'ready', mimeType: 'image/webp', base64: 'AQID', cacheHit: false })
    expect(JSON.stringify(result)).not.toContain('sns-webpic-qc.xhscdn.com')
    expect(JSON.stringify(result)).not.toContain('signature')
    expect(fetcher).toHaveBeenCalledWith(COVER_URL, expect.objectContaining({ method: 'GET', credentials: 'omit', redirect: 'manual', headers: { accept: expect.stringContaining('image/webp') } }))
    const init = fetcher.mock.calls[0]?.[1]
    expect(init?.headers).not.toHaveProperty('cookie')
    expect(init?.headers).not.toHaveProperty('authorization')
    expect(timeoutMs).toBe(10_000)
    vi.restoreAllMocks()
  })

  it('rejects non-XHS, local, private-IP, credentialed, and non-web URL references', () => {
    const delivery = new XhsCoverDelivery()
    for (const url of [
      'https://sns-webpic-qc.xhscdn.com.evil.test/image',
      'http://localhost/image',
      'http://127.0.0.1/image',
      'http://192.168.1.8/image',
      'file:///tmp/image',
      'data:image/png;base64,abc',
      'https://user:pass@sns-webpic-qc.xhscdn.com/image',
      'http://sns-webpic-qc.xhscdn.com:8080/image',
    ]) expect(delivery.register(url)).toBeNull()
  })

  it('rejects a redirect that leaves the exact image host', async () => {
    const delivery = new XhsCoverDelivery()
    const assetId = delivery.register(COVER_URL)!
    const fetcher = vi.fn(async () => new Response(null, { status: 302, headers: { location: 'https://other.example/image.webp' } }))

    await expect(delivery.get(assetId, fetcher)).resolves.toEqual({ status: 'error' })
    expect(fetcher).toHaveBeenCalledOnce()
  })

  it('keeps redirects on the exact starting hostname even when both hosts are allowlisted', async () => {
    const delivery = new XhsCoverDelivery()
    const assetId = delivery.register(COVER_URL)!
    const fetcher = vi.fn(async () => new Response(null, { status: 302, headers: { location: 'https://sns-img-qc.xhscdn.com/image.webp' } }))

    await expect(delivery.get(assetId, fetcher)).resolves.toEqual({ status: 'error' })
    expect(fetcher).toHaveBeenCalledOnce()
  })

  it('accepts exact XHS detail-image hosts without accepting neighboring names', () => {
    const delivery = new XhsCoverDelivery()
    expect(delivery.register('http://sns-img-qc.xhscdn.com/image')).toBeTruthy()
    expect(delivery.register('https://sns-img-qc.xhscdn.com.evil.test/image')).toBeNull()
  })

  it('revalidates same-host redirects before following them', async () => {
    const delivery = new XhsCoverDelivery()
    const assetId = delivery.register(COVER_URL)!
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 302, headers: { location: '/redirected.webp' } }))
      .mockResolvedValueOnce(imageResponse())

    await expect(delivery.get(assetId, fetcher)).resolves.toMatchObject({ status: 'ready', mimeType: 'image/webp' })
    expect(fetcher).toHaveBeenCalledTimes(2)
    expect(fetcher.mock.calls[1]?.[0]).toBe('http://sns-webpic-qc.xhscdn.com/redirected.webp')
  })

  it('rejects unsupported content types and bodies over two megabytes', async () => {
    const delivery = new XhsCoverDelivery()
    const unsupportedId = delivery.register(COVER_URL)!
    const unsupportedFetcher = vi.fn(async () => imageResponse(new Uint8Array([1]), 'text/html'))
    await expect(delivery.get(unsupportedId, unsupportedFetcher)).resolves.toEqual({ status: 'error' })

    const oversizedId = delivery.register('https://sns-webpic-qc.xhscdn.com/large.webp')!
    const oversizedFetcher = vi.fn(async () => new Response(null, { status: 200, headers: { 'content-type': 'image/webp', 'content-length': String(2 * 1024 * 1024 + 1) } }))
    await expect(delivery.get(oversizedId, oversizedFetcher)).resolves.toEqual({ status: 'error' })

    const streamedId = delivery.register('https://sns-webpic-qc.xhscdn.com/streamed.webp')!
    const streamedFetcher = vi.fn(async () => imageResponse(new Uint8Array(2 * 1024 * 1024 + 1)))
    await expect(delivery.get(streamedId, streamedFetcher)).resolves.toEqual({ status: 'error' })
  })

  it('maps timeout failures to a content-free fallback and does not cache failures', async () => {
    const delivery = new XhsCoverDelivery()
    const assetId = delivery.register(COVER_URL)!
    const fetcher = vi.fn(async () => { throw new DOMException('timeout', 'TimeoutError') })

    await expect(delivery.get(assetId, fetcher)).resolves.toEqual({ status: 'error' })
    await expect(delivery.get(assetId, fetcher)).resolves.toEqual({ status: 'error' })
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it('caches successful images in memory and marks subsequent reads as hits', async () => {
    const delivery = new XhsCoverDelivery()
    const firstId = delivery.register(COVER_URL)!
    const secondId = delivery.register(COVER_URL)!
    const fetcher = vi.fn(async () => imageResponse())

    await expect(delivery.get(firstId, fetcher)).resolves.toMatchObject({ status: 'ready', cacheHit: false })
    await expect(delivery.get(secondId, fetcher)).resolves.toMatchObject({ status: 'ready', cacheHit: true })
    expect(fetcher).toHaveBeenCalledOnce()
  })

  it('limits active remote image requests to four', async () => {
    const delivery = new XhsCoverDelivery()
    const ids = Array.from({ length: 6 }, (_, index) => delivery.register(`https://sns-webpic-qc.xhscdn.com/${index}.webp`)!)
    const pending: ((response: Response) => void)[] = []
    let active = 0
    let maximumActive = 0
    const fetcher = vi.fn(() => {
      active += 1
      maximumActive = Math.max(maximumActive, active)
      return new Promise<Response>(resolve => {
        pending.push(response => { active -= 1; resolve(response) })
      })
    })
    const requests = ids.map(id => delivery.get(id, fetcher))

    await vi.waitFor(() => expect(pending).toHaveLength(4))
    expect(maximumActive).toBe(4)
    pending.splice(0, 4).forEach(resolve => { resolve(imageResponse()) })
    await vi.waitFor(() => expect(pending).toHaveLength(2))
    pending.splice(0, 2).forEach(resolve => { resolve(imageResponse()) })
    await expect(Promise.all(requests)).resolves.toHaveLength(6)
    expect(maximumActive).toBe(4)
  })
})
