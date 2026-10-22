/**
 * shotcraft 镜头卡渲染触发。
 *
 * shotcraft 卡是 Remotion TSX（具名 export 组件，无 default、无 meta），与
 * talkcraft 同技术。Host 渲染走隔离渲染器（packages/business/library-render/
 * render-card.mjs 的 shotcraft 形态：--export-name 指定组件，--defaults-export
 * 合并默认 props，--duration-export 取总帧数），渲染成带透明通道的 PNG，
 * 再进 FFmpeg 叠加链路。shotcraft 卡按整幅画布设计（透明底），输出 PNG 为
 * 整幅画布尺寸，runRender 把这类组件的叠加定位归零（x=0,y=0），见 video-packaging.ts。
 */

import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { SHOTCRAFT_COMPONENTS } from '@deepseek-ai/dsh-client-ui-conversation/src/client/skeleton/video-packaging/shotcraft-cards/shotcraft-components.js'
import { BusinessWorkbenchError } from './errors.ts'

const require = createRequire(import.meta.url)

/** shotcraft 组件引用（来自 packaging-plan 的 libraryRef）。 */
export interface ShotcraftLibraryRef {
  readonly lib: 'shotcraft'
  readonly componentId?: string
  readonly params?: Record<string, unknown>
}

/** 组件是否 shotcraft 库引用（Host 渲染，不走编辑器 PNG 上传）。 */
export function isShotcraftComponent(component: unknown): boolean {
  if (typeof component !== 'object' || component === null) return false
  const ref = (component as { readonly libraryRef?: unknown }).libraryRef
  return (
    typeof ref === 'object' &&
    ref !== null &&
    (ref as { readonly lib?: unknown }).lib === 'shotcraft'
  )
}

/** 隔离渲染器可执行的渲染任务。 */
export interface ShotcraftRenderJob {
  readonly componentId: string
  /** 卡片 .tsx 绝对路径。 */
  readonly cardFile: string
  /** 具名 export 的组件名（如 BlurSlide）。 */
  readonly exportName: string
  /** 默认 props 导出名（渲染入口与 params 合并，params 优先）。 */
  readonly defaultsExport: string
  /** 总帧数导出名（渲染入口取 durationInFrames 用）。 */
  readonly durationExport: string
  readonly props: Readonly<Record<string, unknown>>
  readonly width: number
  readonly height: number
  readonly fps: number
  /** 要渲染的静帧（0-based；超出卡片总帧数时渲染器钳制）。 */
  readonly frame: number
}

function fail(message: string): never {
  throw new BusinessWorkbenchError('INVALID_OPERATION', `business-workbench: shotcraft 渲染触发${message}`)
}

/** shotcraft-cards/ 目录（只读来源，卡片文件相对它解析）。 */
function shotcraftCardsDir(): string {
  const dir = dirname(
    require.resolve(
      '@deepseek-ai/dsh-client-ui-conversation/src/client/skeleton/video-packaging/shotcraft-cards/shotcraft-components.js',
    ),
  )
  return dir
}

/**
 * 把一条 shotcraft 组件引用翻译成隔离渲染器可执行的渲染任务。
 * @param libraryRef - 组件的 libraryRef（lib 必须为 shotcraft）
 * @param context - width/height：输出画布（整幅画布）；fps：默认 30；
 *   stillSec：取静帧的秒数（默认 2s）。
 */
export function createShotcraftRenderJob(
  libraryRef: ShotcraftLibraryRef,
  context: { readonly width: number; readonly height: number; readonly fps?: number; readonly stillSec?: number },
): ShotcraftRenderJob {
  if (!isShotcraftComponent({ libraryRef })) fail('只接受 lib 为 shotcraft 的组件引用')
  const componentId = libraryRef.componentId
  if (typeof componentId !== 'string' || componentId.length === 0) fail('组件引用缺少组件 ID')
  const entry = SHOTCRAFT_COMPONENTS[componentId as keyof typeof SHOTCRAFT_COMPONENTS]
  if (entry === undefined) {
    fail(`组件不受支持：${componentId}（仅支持 shotcraft 注册表中的 31 张卡）`)
  }
  const cardFile = join(shotcraftCardsDir(), entry.file)
  if (!existsSync(cardFile)) fail(`卡片文件不存在：${entry.file}`)
  const { width, height } = context
  if (!Number.isInteger(width) || width <= 0) fail(`画布宽度无效：${String(width)}`)
  if (!Number.isInteger(height) || height <= 0) fail(`画布高度无效：${String(height)}`)
  const fps = context.fps ?? 30
  if (!Number.isInteger(fps) || fps <= 0) fail(`帧率无效：${String(context.fps)}`)
  const stillSec = context.stillSec ?? 2
  // 上界钳制由渲染器按卡片真实总帧数完成（durationExport 在打包时求值）。
  const frame = Math.max(0, Math.round(stillSec * fps))
  return Object.freeze({
    componentId,
    cardFile,
    exportName: entry.exportName,
    defaultsExport: entry.defaultsExport,
    durationExport: entry.durationExport,
    props: { ...(libraryRef.params ?? {}) },
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
 * 驱动隔离渲染器把渲染任务渲成一帧带透明通道的 PNG（整幅画布尺寸）。
 * @param job - createShotcraftRenderJob 的产物
 * @param outPath - 输出 PNG 绝对路径（父目录自动创建）
 * @param options.timeoutMs - 渲染超时（默认 5 分钟；首次打包较慢）
 */
export async function renderShotcraftStillPng(
  job: ShotcraftRenderJob,
  outPath: string,
  options: { readonly timeoutMs?: number } = {},
): Promise<void> {
  const cli = rendererCliPath()
  await mkdir(dirname(outPath), { recursive: true })
  const args = [
    cli,
    '--card', job.cardFile,
    '--export-name', job.exportName,
    '--defaults-export', job.defaultsExport,
    '--duration-export', job.durationExport,
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
          `business-workbench: shotcraft 卡片渲染超时（${job.componentId}，${timeoutMs}ms）`,
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
          `business-workbench: shotcraft 渲染器启动失败：${error.message}`,
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
          `business-workbench: shotcraft 卡片 ${job.componentId} 渲染失败（exit ${String(code)}）${tail ? `：${tail}` : ''}`,
        ),
      )
    })
  })
}
