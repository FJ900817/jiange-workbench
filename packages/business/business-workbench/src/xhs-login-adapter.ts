/** Host-only, two-operation login bridge for the local Xiaohongshu MCP HTTP API. */

import { lstat, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { resolveDshHome } from '@deepseek-ai/dsh-home-paths'
import { z } from 'zod'
import type { XhsLoginQrCodeResult, XhsLoginStatusResult } from './types.ts'

const XHS_API = 'http://127.0.0.1:18060/api/v1/login'
const TOKEN_PATH = join(resolveDshHome(), 'secrets', 'xhs-mcp-token')
const REQUEST_TIMEOUT_MS = 35_000
const MAX_QR_DATA_URL_LENGTH = 1_500_000

const envelopeSchema = z.object({ success: z.literal(true), data: z.unknown() }).passthrough()
const loginStatusSchema = z.object({ is_logged_in: z.boolean() }).passthrough()
const qrCodeSchema = z.object({ timeout: z.string().min(1).max(16), is_logged_in: z.boolean(), img: z.string().max(MAX_QR_DATA_URL_LENGTH).optional() }).passthrough()

type Fetcher = typeof fetch
type TokenReader = () => Promise<string | undefined>

/** Read the shared MCP token only from its owner-only regular file. */
export async function readXhsMcpToken(): Promise<string | undefined> {
  try {
    const metadata = await lstat(TOKEN_PATH)
    if (!metadata.isFile() || metadata.isSymbolicLink() || (metadata.mode & 0o777) !== 0o600) return undefined
    if (typeof process.getuid === 'function' && metadata.uid !== process.getuid()) return undefined
    const token = (await readFile(TOKEN_PATH, 'utf8')).trim()
    return token.length > 0 ? token : undefined
  } catch {
    return undefined
  }
}

/** Read only the logged-in boolean; account identity fields from upstream are discarded. */
export async function getXhsLoginStatus(
  fetcher: Fetcher = fetch,
  readToken: TokenReader = readXhsMcpToken,
): Promise<XhsLoginStatusResult> {
  const token = await readToken().catch(() => undefined)
  if (token === undefined) return { status: 'unavailable' }
  try {
    const response = await fetcher(`${XHS_API}/status`, {
      method: 'GET',
      headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
    if (!response.ok) return { status: 'unavailable' }
    const envelope = envelopeSchema.safeParse(await response.json())
    if (!envelope.success) return { status: 'unavailable' }
    const data = loginStatusSchema.safeParse(envelope.data.data)
    return data.success ? { status: 'available', loggedIn: data.data.is_logged_in } : { status: 'unavailable' }
  } catch {
    return { status: 'unavailable' }
  }
}

/** Request one temporary QR image; the caller owns its in-memory lifetime. */
export async function getXhsLoginQrCode(
  fetcher: Fetcher = fetch,
  readToken: TokenReader = readXhsMcpToken,
  now: () => number = Date.now,
): Promise<XhsLoginQrCodeResult> {
  const token = await readToken().catch(() => undefined)
  if (token === undefined) return { status: 'unavailable' }
  try {
    const response = await fetcher(`${XHS_API}/qrcode`, {
      method: 'GET',
      headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
    if (!response.ok) return { status: 'unavailable' }
    const envelope = envelopeSchema.safeParse(await response.json())
    if (!envelope.success) return { status: 'unavailable' }
    const data = qrCodeSchema.safeParse(envelope.data.data)
    if (!data.success) return { status: 'unavailable' }
    if (data.data.is_logged_in) return { status: 'logged_in' }
    const imageDataUrl = data.data.img
    const timeoutMs = parseGoDurationMs(data.data.timeout)
    if (imageDataUrl === undefined || !isPngDataUrl(imageDataUrl) || timeoutMs === undefined) return { status: 'unavailable' }
    return { status: 'qr_ready', imageDataUrl, expiresAt: now() + timeoutMs }
  } catch {
    return { status: 'unavailable' }
  }
}

/** Parse the bounded duration format returned by the pinned MCP API. */
function parseGoDurationMs(value: string): number | undefined {
  const match = /^(\d+)(ms|s|m|h)$/u.exec(value)
  if (match === null) return undefined
  const amount = Number(match[1])
  const unit = match[2]
  const multiplier = unit === 'ms' ? 1 : unit === 's' ? 1_000 : unit === 'm' ? 60_000 : 3_600_000
  const durationMs = amount * multiplier
  return Number.isSafeInteger(durationMs) && durationMs > 0 && durationMs <= 10 * 60_000 ? durationMs : undefined
}

/** Allow only an inline PNG payload so an upstream URL cannot make the Renderer fetch elsewhere. */
function isPngDataUrl(value: string): boolean {
  return value.length <= MAX_QR_DATA_URL_LENGTH && /^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/u.test(value)
}
