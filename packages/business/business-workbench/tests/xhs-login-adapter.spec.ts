import { describe, expect, it, vi } from 'vitest'
import { getXhsLoginQrCode, getXhsLoginStatus } from '../src/xhs-login-adapter.ts'

const TOKEN_SENTINEL = 'test-only-secret-never-returned'
const QR_DATA_URL = `data:image/png;base64,${'a'.repeat(32)}`

function response(data: unknown, status = 200): Response {
  return Response.json({ success: true, data }, { status })
}

describe('Xiaohongshu Host login adapter', () => {
  it('projects only the login boolean and uses the fixed authenticated status endpoint', async () => {
    const fetcher = vi.fn(async () => response({ is_logged_in: true, username: 'private-name', user_id: 'private-id' }))
    const result = await getXhsLoginStatus(fetcher, async () => TOKEN_SENTINEL)

    expect(result).toEqual({ status: 'available', loggedIn: true })
    expect(fetcher).toHaveBeenCalledWith('http://127.0.0.1:18060/api/v1/login/status', expect.objectContaining({
      method: 'GET', headers: { Accept: 'application/json', Authorization: `Bearer ${TOKEN_SENTINEL}` },
    }))
    expect(JSON.stringify(result)).not.toContain(TOKEN_SENTINEL)
    expect(JSON.stringify(result)).not.toContain('private-name')
    expect(JSON.stringify(result)).not.toContain('private-id')
  })

  it('returns the PNG QR and bounded expiry metadata without retaining upstream fields', async () => {
    const now = 1_800_000_000_000
    const fetcher = vi.fn(async () => response({ timeout: '4m', is_logged_in: false, img: QR_DATA_URL, private: 'must-not-forward' }))
    const result = await getXhsLoginQrCode(fetcher, async () => TOKEN_SENTINEL, () => now)

    expect(result).toEqual({ status: 'qr_ready', imageDataUrl: QR_DATA_URL, expiresAt: now + 240_000 })
    expect(JSON.stringify(result)).not.toContain(TOKEN_SENTINEL)
    expect(JSON.stringify(result)).not.toContain('must-not-forward')
  })

  it('does not return QR when the upstream API says the user is already logged in', async () => {
    await expect(getXhsLoginQrCode(async () => response({ timeout: '0s', is_logged_in: true }), async () => TOKEN_SENTINEL))
      .resolves.toEqual({ status: 'logged_in' })
  })

  it('rejects URL images, malformed durations, and oversized QR payloads', async () => {
    await expect(getXhsLoginQrCode(async () => response({ timeout: '4m', is_logged_in: false, img: 'https://example.test/qr.png' }), async () => TOKEN_SENTINEL))
      .resolves.toEqual({ status: 'unavailable' })
    await expect(getXhsLoginQrCode(async () => response({ timeout: 'forever', is_logged_in: false, img: QR_DATA_URL }), async () => TOKEN_SENTINEL))
      .resolves.toEqual({ status: 'unavailable' })
    await expect(getXhsLoginQrCode(async () => response({ timeout: '4m', is_logged_in: false, img: `data:image/png;base64,${'a'.repeat(1_500_001)}` }), async () => TOKEN_SENTINEL))
      .resolves.toEqual({ status: 'unavailable' })
  })

  it('fails closed without a token, on HTTP failure, and on malformed status data', async () => {
    const fetcher = vi.fn(async () => response({ is_logged_in: false }))
    await expect(getXhsLoginStatus(fetcher, async () => undefined)).resolves.toEqual({ status: 'unavailable' })
    expect(fetcher).not.toHaveBeenCalled()
    await expect(getXhsLoginStatus(async () => response({}, 401), async () => TOKEN_SENTINEL)).resolves.toEqual({ status: 'unavailable' })
    await expect(getXhsLoginStatus(async () => Response.json({ success: true, data: { is_logged_in: 'false' } }), async () => TOKEN_SENTINEL))
      .resolves.toEqual({ status: 'unavailable' })
  })
})
