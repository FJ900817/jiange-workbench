/**
 * 组件预览：给带 libraryRef 的组件渲染静帧 PNG（供面板预览层）。
 *
 * 复用三条生产渲染链（aikou 走 Chromium，talkcraft/shotcraft 走 Remotion
 * 隔离渲染器），不重造渲染器。本模块是 best-effort：渲染失败、引用非法、
 * 渲染器缺失一律返回 null，调用方（面板）静默回退文字占位，绝不抛错。
 * 同一请求只渲染一次，结果进内存 LRU（默认上限 200，超了淘汰最旧）。
 */

import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  createAikouRenderJob,
  isAikouComponent,
  renderAikouStillPng,
} from './video-packaging-aikou.ts'
import {
  createTalkcraftRenderJob,
  isTalkcraftComponent,
  renderTalkcraftStillPng,
} from './video-packaging-talkcraft.ts'
import {
  createShotcraftRenderJob,
  isShotcraftComponent,
  renderShotcraftStillPng,
} from './video-packaging-shotcraft.ts'
import type {
  PreviewVideoPackagingComponentRequest,
  PreviewVideoPackagingComponentResult,
} from './types.ts'
import type { JsonValue } from '@deepseek-ai/dsh-session/types'

/** 预览渲染超时：宽于客户端 15s 上限，慢首渲完成后进缓存预热。 */
const PREVIEW_RENDER_TIMEOUT_MS = 120_000
/** 预览取静帧的秒数：与生产渲染默认一致（组件中段）。 */
const PREVIEW_STILL_SEC = 2
/** 预览缓存上限（张）。 */
const PREVIEW_CACHE_MAX = 200

/** 内存 LRU 缓存：命中时把条目搬到最新，超限淘汰最旧。 */
export class ComponentPreviewCache {
  private readonly entries = new Map<string, PreviewVideoPackagingComponentResult>()

  /** @param maxSize - 缓存上限（张），默认 200。 */
  constructor(private readonly maxSize: number = PREVIEW_CACHE_MAX) {}

  /** @returns 命中返回结果（并搬到最新），未命中返回 undefined。 */
  get(key: string): PreviewVideoPackagingComponentResult | undefined {
    const hit = this.entries.get(key)
    if (hit === undefined) return undefined
    this.entries.delete(key)
    this.entries.set(key, hit)
    return hit
  }

  /** 存入结果；超限时淘汰最旧条目。 */
  set(key: string, value: PreviewVideoPackagingComponentResult): void {
    this.entries.delete(key)
    this.entries.set(key, value)
    while (this.entries.size > this.maxSize) {
      const oldest = this.entries.keys().next()
      if (oldest.done) break
      this.entries.delete(oldest.value)
    }
  }

  /** 当前条目数。 */
  get size(): number {
    return this.entries.size
  }

  /** 清空（测试隔离用）。 */
  clear(): void {
    this.entries.clear()
  }
}

const defaultCache = new ComponentPreviewCache(PREVIEW_CACHE_MAX)

/** key 排序后序列化，保证语义相同的 params 命中同一缓存条目。 */
function stableStringify(value: unknown): string {
  if (value === null || value === undefined) return 'null'
  if (typeof value !== 'object') return JSON.stringify(value) ?? 'null'
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => item !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`).join(',')}}`
}

/**
 * 计算预览缓存 key。
 * @param request - 预览请求。
 * @returns 稳定的缓存 key 字符串。
 */
export function previewCacheKey(request: PreviewVideoPackagingComponentRequest): string {
  return stableStringify({
    lib: request.libraryRef?.lib ?? null,
    componentId: request.libraryRef?.componentId ?? null,
    params: request.libraryRef?.params ?? null,
    width: request.width,
    height: request.height,
    darkScene: request.darkScene ?? false,
    stillSec: request.stillSec ?? PREVIEW_STILL_SEC,
  })
}

async function readPngResult(
  outPath: string,
  width: number,
  height: number,
  fullCanvas: boolean,
): Promise<PreviewVideoPackagingComponentResult> {
  const png = await readFile(outPath)
  if (png.length === 0) throw new Error('预览渲染产物为空')
  return { data: png.toString('base64'), width, height, fullCanvas }
}

/** 构造触发器需要的库引用：componentId 非字符串时不带该键（exactOptionalPropertyTypes）。 */
function libraryRefFor<Lib extends 'aikou' | 'talkcraft' | 'shotcraft'>(
  lib: Lib,
  componentId: unknown,
  params: Record<string, unknown>,
): { readonly lib: Lib; readonly componentId?: string; readonly params: Record<string, unknown> } {
  return typeof componentId === 'string' ? { lib, componentId, params } : { lib, params }
}

/**
 * 不带缓存地渲染一张组件预览（真实渲染器）。
 * @param request - 预览请求。
 * @returns PNG 结果；引用非法、渲染失败、渲染器缺失时返回 null（不抛错）。
 */
export async function renderComponentPreview(
  request: PreviewVideoPackagingComponentRequest,
): Promise<PreviewVideoPackagingComponentResult | null> {
  try {
    const { libraryRef, width, height } = request
    if (!Number.isInteger(width) || width <= 0 || !Number.isInteger(height) || height <= 0) return null
    if (typeof libraryRef !== 'object' || libraryRef === null) return null
    const lib = (libraryRef as { readonly lib?: unknown }).lib
    const componentId = (libraryRef as { readonly componentId?: unknown }).componentId
    const params = (libraryRef as { readonly params?: Record<string, JsonValue> }).params
    const safeParams: Record<string, unknown> = params ?? {}
    const stillSec = request.stillSec ?? PREVIEW_STILL_SEC
    const dir = await mkdtemp(join(tmpdir(), 'dsh-vp-preview-'))
    const outPath = join(dir, 'preview.png')
    try {
      if (lib === 'aikou' && isAikouComponent({ libraryRef })) {
        const job = createAikouRenderJob(
          libraryRefFor('aikou', componentId, safeParams),
          { width, height, timeSec: stillSec },
        )
        await renderAikouStillPng(job, outPath, { timeoutMs: PREVIEW_RENDER_TIMEOUT_MS })
        return await readPngResult(outPath, job.width, job.height, true)
      }
      if (lib === 'talkcraft' && isTalkcraftComponent({ libraryRef })) {
        const job = createTalkcraftRenderJob(
          libraryRefFor('talkcraft', componentId, safeParams),
          { mode: 'overlay', darkScene: request.darkScene ?? false, stillSec },
        )
        await renderTalkcraftStillPng(job, outPath, { timeoutMs: PREVIEW_RENDER_TIMEOUT_MS })
        return await readPngResult(outPath, job.width, job.height, false)
      }
      if (lib === 'shotcraft' && isShotcraftComponent({ libraryRef })) {
        const job = createShotcraftRenderJob(
          libraryRefFor('shotcraft', componentId, safeParams),
          { width, height, stillSec },
        )
        await renderShotcraftStillPng(job, outPath, { timeoutMs: PREVIEW_RENDER_TIMEOUT_MS })
        return await readPngResult(outPath, job.width, job.height, true)
      }
      return null
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  } catch {
    return null
  }
}

export interface PreviewComponentDeps {
  readonly cache?: ComponentPreviewCache
  readonly render?: typeof renderComponentPreview
}

/**
 * 组件预览入口（带 LRU 缓存）。
 * @param request - 预览请求。
 * @param deps - 可选依赖覆盖（测试用：小缓存 / 计数渲染器）。
 * @returns PNG 结果；不可预览时返回 null（不抛错）。
 */
export async function previewComponentPng(
  request: PreviewVideoPackagingComponentRequest,
  deps: PreviewComponentDeps = {},
): Promise<PreviewVideoPackagingComponentResult | null> {
  const cache = deps.cache ?? defaultCache
  const key = previewCacheKey(request)
  const hit = cache.get(key)
  if (hit !== undefined) return hit
  const render = deps.render ?? renderComponentPreview
  const rendered = await render(request)
  if (rendered !== null) cache.set(key, rendered)
  return rendered
}

/** 清空模块默认预览缓存（测试隔离用）。 */
export function clearPreviewCache(): void {
  defaultCache.clear()
}

/** 模块默认预览缓存当前条目数（测试用）。 */
export function previewCacheSize(): number {
  return defaultCache.size
}
