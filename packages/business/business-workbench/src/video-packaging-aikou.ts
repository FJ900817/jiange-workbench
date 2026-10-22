/**
 * aikou（AI口播包装库）组件渲染触发。
 *
 * aikou 组件是纯 HTML/Canvas 2D 渲染器（aikou-components.js）：编辑器内联它做
 * 预览；Host 渲染走隔离渲染器（packages/business/library-render/render-aikou.mjs），
 * 用 headless Chromium 调用其导出的 renderAikouOverlayPng 画出整幅画布 PNG，
 * 再进 FFmpeg 叠加链路。aikou 按整幅画布绝对坐标绘制，输出 PNG 即整幅画布尺寸，
 * runRender 把这类组件的叠加定位归零（x=0,y=0），见 video-packaging.ts。
 */

import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { AIKOU_COMPONENTS } from '@deepseek-ai/dsh-client-ui-conversation/src/client/skeleton/video-packaging/aikou-components.js'
import { BusinessWorkbenchError } from './errors.ts'

const require = createRequire(import.meta.url)

/** aikou 组件引用（来自 packaging-plan 的 libraryRef）。 */
export interface AikouLibraryRef {
  readonly lib: 'aikou'
  readonly componentId?: string
  readonly params?: Record<string, unknown>
}

/** 组件是否 aikou 库引用（Host 渲染，不走编辑器 PNG 上传）。 */
export function isAikouComponent(component: unknown): boolean {
  if (typeof component !== 'object' || component === null) return false
  const ref = (component as { readonly libraryRef?: unknown }).libraryRef
  return (
    typeof ref === 'object' &&
    ref !== null &&
    (ref as { readonly lib?: unknown }).lib === 'aikou'
  )
}

/** 隔离渲染器可执行的渲染任务。 */
export interface AikouRenderJob {
  readonly componentId: string
  /** aikou-components.js 绝对路径（传给 render-aikou.mjs --module）。 */
  readonly moduleFile: string
  /** 原始 libraryRef（JSON 序列化后传给渲染器）。 */
  readonly refJson: string
  readonly width: number
  readonly height: number
  /** 组件内时间（秒），0 = 组件起始。 */
  readonly timeSec: number
}

function fail(message: string): never {
  throw new BusinessWorkbenchError('INVALID_OPERATION', `business-workbench: aikou 渲染触发${message}`)
}

/** aikou-components.js 绝对路径（只读来源）。 */
function aikouModuleFile(): string {
  const file = require.resolve(
    '@deepseek-ai/dsh-client-ui-conversation/src/client/skeleton/video-packaging/aikou-components.js',
  )
  if (!existsSync(file)) fail(`组件模块不存在：${file}`)
  return file
}

interface AikouRegistryEntry {
  readonly required?: readonly string[]
}

/**
 * 把一条 aikou 组件引用翻译成隔离渲染器可执行的渲染任务。
 * 校验镜像 aikou-components.js 的 renderAikouComponent（白名单 + 必填参数），
 * 渲染本身走 Chromium（render-aikou.mjs），Host 侧不碰 DOM。
 */
export function createAikouRenderJob(
  libraryRef: AikouLibraryRef,
  context: { readonly width: number; readonly height: number; readonly timeSec?: number },
): AikouRenderJob {
  if (!isAikouComponent({ libraryRef })) fail('只接受 lib 为 aikou 的组件引用')
  const componentId = libraryRef.componentId
  if (typeof componentId !== 'string' || componentId.length === 0) fail('组件引用缺少组件 ID')
  const entry: AikouRegistryEntry | undefined = AIKOU_COMPONENTS[componentId]
  if (entry === undefined) fail(`组件不受支持：${componentId}（仅支持 ${Object.keys(AIKOU_COMPONENTS).join('、')}）`)
  const params = libraryRef.params ?? {}
  for (const field of entry.required ?? []) {
    const value = (params as Record<string, unknown>)[field]
    if (value === undefined || value === null || value === '') {
      fail(`组件 ${componentId} 缺少必填参数：${field}`)
    }
  }
  const { width, height } = context
  if (!Number.isInteger(width) || width <= 0) fail(`画布宽度无效：${String(width)}`)
  if (!Number.isInteger(height) || height <= 0) fail(`画布高度无效：${String(height)}`)
  const timeSec = context.timeSec ?? 0
  if (!Number.isFinite(timeSec) || timeSec < 0) fail(`组件内时间无效：${String(context.timeSec)}`)
  return Object.freeze({
    componentId,
    moduleFile: aikouModuleFile(),
    refJson: JSON.stringify({ lib: 'aikou', componentId, params }),
    width,
    height,
    timeSec,
  })
}

/** 隔离渲染器 CLI（packages/business/library-render/render-aikou.mjs）绝对路径。 */
function rendererCliPath(): string {
  const here = dirname(fileURLToPath(import.meta.url))
  const cli = join(here, '..', '..', 'library-render', 'render-aikou.mjs')
  if (!existsSync(cli)) {
    fail(`隔离渲染器未安装：${cli} 不存在，请先安装 packages/business/library-render`)
  }
  return cli
}

/**
 * 驱动隔离渲染器把渲染任务渲成一帧带透明通道的 PNG（整幅画布尺寸）。
 * @param job - createAikouRenderJob 的产物
 * @param outPath - 输出 PNG 绝对路径（父目录自动创建）
 * @param options.timeoutMs - 渲染超时（默认 2 分钟；Chromium 启动占大头）
 */
export async function renderAikouStillPng(
  job: AikouRenderJob,
  outPath: string,
  options: { readonly timeoutMs?: number } = {},
): Promise<void> {
  const cli = rendererCliPath()
  await mkdir(dirname(outPath), { recursive: true })
  const args = [
    cli,
    '--module', job.moduleFile,
    '--ref', job.refJson,
    '--width', String(job.width),
    '--height', String(job.height),
    '--time', String(job.timeSec),
    '--out', outPath,
  ]
  const timeoutMs = options.timeoutMs ?? 120_000
  await new Promise<void>((resolvePromise, rejectPromise) => {
    const child = spawn(process.execPath, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    let stderr = ''
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      rejectPromise(
        new BusinessWorkbenchError(
          'INVALID_OPERATION',
          `business-workbench: aikou 组件渲染超时（${job.componentId}，${timeoutMs}ms）`,
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
          `business-workbench: aikou 渲染器启动失败：${error.message}`,
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
          `business-workbench: aikou 组件 ${job.componentId} 渲染失败（exit ${String(code)}）${tail ? `：${tail}` : ''}`,
        ),
      )
    })
  })
}
