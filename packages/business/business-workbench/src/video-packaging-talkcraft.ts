/**
 * talkcraft 卡片渲染触发（P1 接线）。
 *
 * 渲染服务侧决策（按 Agent Note，不在浏览器 bundle 路径上）：
 * Host 的 runRender 在解析文字叠加层时，对 libraryRef.lib === 'talkcraft'
 * 的组件调用本模块——先经 talkcraft-dispatch 把引用翻译成渲染目标
 * （叠加模式走透明改编版 alphaFile；整屏模式走原库路径），再驱动隔离
 * 渲染器（packages/business/library-render）把卡片渲成带透明通道的
 * PNG，交给 FFmpeg 叠加链路。编辑器不为 talkcraft 组件上传 PNG。
 */

import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveTalkcraftRenderTarget } from '@deepseek-ai/dsh-client-ui-conversation/src/client/skeleton/video-packaging/talkcraft-dispatch.js'
import { TALKCRAFT_COMPONENTS } from '@deepseek-ai/dsh-client-ui-conversation/src/client/skeleton/video-packaging/talkcraft-components.js'
import { BusinessWorkbenchError } from './errors.ts'

const require = createRequire(import.meta.url)

/** talkcraft 组件引用（来自 packaging-plan 的 libraryRef）。 */
export interface TalkcraftLibraryRef {
  readonly lib: 'talkcraft'
  readonly componentId?: string
  readonly params?: Record<string, unknown>
}

/** 组件是否 talkcraft 库引用（Host 渲染，不走编辑器 PNG 上传）。 */
export function isTalkcraftComponent(component: unknown): boolean {
  if (typeof component !== 'object' || component === null) return false
  const ref = (component as { readonly libraryRef?: unknown }).libraryRef
  return (
    typeof ref === 'object' &&
    ref !== null &&
    (ref as { readonly lib?: unknown }).lib === 'talkcraft'
  )
}

/** 隔离渲染器可执行的渲染任务。 */
export interface TalkcraftRenderJob {
  readonly componentId: string
  readonly mode: 'overlay' | 'fullscreen'
  /** 卡片 .tsx 绝对路径（overlay→透明改编版；fullscreen→原库路径）。 */
  readonly cardFile: string
  readonly props: Readonly<Record<string, unknown>>
  readonly theme: 'light' | 'dark'
  readonly width: number
  readonly height: number
  readonly fps: number
  /** 要渲染的静帧（0-based）。 */
  readonly frame: number
}

function fail(message: string): never {
  throw new BusinessWorkbenchError('INVALID_OPERATION', `business-workbench: talkcraft 渲染触发${message}`)
}

/** talkcraft-dispatch.js 所在的 video-packaging 目录（绝对路径）。 */
function videoPackagingDir(): string {
  const dispatchFile = require.resolve(
    '@deepseek-ai/dsh-client-ui-conversation/src/client/skeleton/video-packaging/talkcraft-dispatch.js',
  )
  return dirname(dispatchFile)
}

/** 把分发目标的相对文件路径解析为绝对路径并验证存在。 */
function resolveCardFile(relativeFile: string): string {
  const absolute = join(videoPackagingDir(), relativeFile)
  if (!existsSync(absolute)) {
    fail(`卡片文件不存在：${relativeFile}（整屏原版不在仓库内，整屏渲染暂未接入）`)
  }
  return absolute
}

interface TalkcraftRegistryMeta {
  readonly width?: number
  readonly height?: number
  readonly fps?: number
  readonly durationInFrames?: number
}

/**
 * 把一条 talkcraft 组件引用翻译成隔离渲染器可执行的渲染任务。
 * @param libraryRef - 组件的 libraryRef（lib 必须为 talkcraft）
 * @param context - mode: overlay（默认）走透明改编版；fullscreen 走原库路径；
 *   darkScene: 面板「深色视频场景」开关，带 theme 的卡自动用浅色版；
 *   stillSec: 取静帧的秒数（默认 2s，即卡片播到约 2 秒处）。
 */
export function createTalkcraftRenderJob(
  libraryRef: TalkcraftLibraryRef,
  context: { readonly mode?: 'overlay' | 'fullscreen'; readonly darkScene?: boolean; readonly stillSec?: number } = {},
): TalkcraftRenderJob {
  if (!isTalkcraftComponent({ libraryRef })) fail('只接受 lib 为 talkcraft 的组件引用')
  const componentId = libraryRef.componentId
  if (typeof componentId !== 'string' || componentId.length === 0) fail('组件引用缺少组件 ID')
  const renderContext: { mode?: 'overlay' | 'fullscreen'; darkScene?: boolean } = {}
  if (context.mode !== undefined) renderContext.mode = context.mode
  if (context.darkScene !== undefined) renderContext.darkScene = context.darkScene
  const target = resolveTalkcraftRenderTarget(
    { lib: 'talkcraft', componentId, params: libraryRef.params ?? {} },
    renderContext,
  )
  const entry = (TALKCRAFT_COMPONENTS as Record<string, { readonly meta?: TalkcraftRegistryMeta }>)[
    target.componentId
  ]
  const meta = entry?.meta ?? {}
  const width = meta.width ?? 960
  const height = meta.height ?? 540
  const fps = meta.fps ?? 30
  const durationInFrames = meta.durationInFrames ?? 1
  const cardFile = resolveCardFile(target.file)
  const stillSec = context.stillSec ?? 2
  const frame = Math.max(0, Math.min(durationInFrames - 1, Math.round(stillSec * fps)))
  return Object.freeze({
    componentId: target.componentId,
    mode: target.mode,
    cardFile,
    props: target.props,
    theme: target.theme,
    width,
    height,
    fps,
    frame,
  })
}

/** 隔离渲染器 CLI（packages/business/library-render/render-card.mjs）绝对路径。 */
function rendererCliPath(): string {
  const here = dirname(fileURLToPath(import.meta.url))
  const cli = join(here, '..', '..', 'library-render', 'render-card.mjs')
  if (!existsSync(cli)) {
    fail(`隔离渲染器未安装：${cli} 不存在，请先安装 packages/business/library-render`)
  }
  return cli
}

/**
 * 驱动隔离渲染器把渲染任务渲成一帧带透明通道的 PNG。
 * @param job - createTalkcraftRenderJob 的产物
 * @param outPath - 输出 PNG 绝对路径（父目录自动创建）
 * @param options.timeoutMs - 渲染超时（默认 5 分钟；首次打包较慢）
 */
export async function renderTalkcraftStillPng(
  job: TalkcraftRenderJob,
  outPath: string,
  options: { readonly timeoutMs?: number } = {},
): Promise<void> {
  const cli = rendererCliPath()
  await mkdir(dirname(outPath), { recursive: true })
  const args = [
    cli,
    '--card', job.cardFile,
    '--props', JSON.stringify(job.props),
    '--width', String(job.width),
    '--height', String(job.height),
    '--fps', String(job.fps),
    '--frame', String(job.frame),
    '--out', outPath,
  ]
  const timeoutMs = options.timeoutMs ?? 300_000
  await new Promise<void>((resolvePromise, rejectPromise) => {
    const child = spawn(process.execPath, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    let stderr = ''
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      rejectPromise(
        new BusinessWorkbenchError(
          'INVALID_OPERATION',
          `business-workbench: talkcraft 卡片渲染超时（${job.componentId}，${timeoutMs}ms）`,
        ),
      )
    }, timeoutMs)
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8')
    })
    child.on('error', (error) => {
      clearTimeout(timer)
      rejectPromise(
        new BusinessWorkbenchError(
          'INVALID_OPERATION',
          `business-workbench: talkcraft 渲染器启动失败：${error.message}`,
        ),
      )
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      if (code === 0 && existsSync(outPath)) {
        resolvePromise()
        return
      }
      const tail = stderr.trim().slice(-2000)
      rejectPromise(
        new BusinessWorkbenchError(
          'INVALID_OPERATION',
          `business-workbench: talkcraft 卡片 ${job.componentId} 渲染失败（exit ${String(code)}）${tail ? `：${tail}` : ''}`,
        ),
      )
    })
  })
}
