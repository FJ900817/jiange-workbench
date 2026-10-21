/** P5-07 FFmpeg argument adaptation for Host-owned video assets. */

/** Renderable P5 component fields used to build a fixed FFmpeg argument vector. */
export interface PackagingRenderComponent {
  readonly id: string
  readonly type: 'title' | 'highlight' | 'info' | 'asset'
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
  readonly start: number
  readonly duration: number
  readonly layer: number
  readonly opacity?: number
  readonly hidden?: boolean
  readonly animation: 'fadeUp' | 'fade' | 'none'
  readonly assetId?: string
}

/** P5-07 project fields that affect its FFmpeg render. */
export interface PackagingRenderProject {
  readonly fps: number
  readonly width: number
  readonly height: number
  readonly video: { readonly duration: number }
  readonly components: readonly PackagingRenderComponent[]
}

/** Resolve one P5 asset component to its verified Host-managed immutable file. */
export type ResolvePackagingAsset = (assetId: string) => string

/** Resolve one P5 text overlay to a Host-managed PNG generated from that component. */
export type ResolvePackagingOverlay = (componentId: string) => string

/**
 * Build the P5-07 FFmpeg argument vector while resolving every file through Host asset records.
 * @param project - Validated P5-07 project document.
 * @param sourcePath - Verified Host-managed source video.
 * @param outputPath - Unique Host-owned temporary MP4 path.
 * @param resolveAsset - Host lookup for a referenced PNG asset.
 * @param resolveOverlay - Host lookup for a rendered P5 text overlay.
 * @param maxOutputBytes - Fixed output byte ceiling passed to FFmpeg.
 * @returns Argument vector for `spawn(ffmpeg, args, { shell: false })`.
 */
export function buildP5RenderArgs(
  project: PackagingRenderProject,
  sourcePath: string,
  outputPath: string,
  resolveAsset: ResolvePackagingAsset,
  resolveOverlay: ResolvePackagingOverlay,
  maxOutputBytes: number,
): readonly string[] {
  const components = [...project.components]
    .filter(component => component.hidden !== true)
    .sort((left, right) => left.layer - right.layer)
  const chains: string[] = []
  const inputs: string[] = []
  let from = '[0:v]'

  for (let index = 0; index < components.length; index += 1) {
    const component = components[index]!
    const end = component.start + component.duration
    const inputIndex = index + 1
    const overlay = `[ov${index}]`
    const next = index === components.length - 1 ? '[outv]' : `[v${index}]`
    const enabled = `between(t\\,${component.start.toFixed(3)}\\,${end.toFixed(3)})`
    const isAsset = component.type === 'asset'
    const path = isAsset
      ? resolveAsset(component.assetId!)
      : resolveOverlay(component.id)
    inputs.push('-loop', '1', '-framerate', String(project.fps), '-i', path)
    const opacity = isAsset ? component.opacity ?? 1 : 1
    const scale = isAsset
      ? `scale=${Math.round(component.width)}:${Math.round(component.height)}:flags=lanczos,`
      : ''
    const animation = component.animation !== 'none'
    const fadeIn = animation ? `fade=t=in:st=${component.start.toFixed(3)}:d=0.28:alpha=1,` : ''
    const fadeOut = animation
      ? `,fade=t=out:st=${Math.max(component.start, end - 0.2).toFixed(3)}:d=0.2:alpha=1`
      : ''
    chains.push(`[${inputIndex}:v]${scale}format=rgba,colorchannelmixer=aa=${opacity},${fadeIn}null${fadeOut}${overlay}`)
    const y = component.animation === 'fadeUp'
      ? `'${component.y}+14*(1-clip((t-${component.start.toFixed(3)})/0.35\\,0\\,1))'`
      : String(component.y)
    chains.push(`${from}${overlay}overlay=x=${component.x}:y=${y}:eof_action=pass:shortest=0:enable='${enabled}'${next}`)
    from = next
  }

  if (components.length === 0) chains.push('[0:v]null[outv]')
  const end = Math.max(project.video.duration, ...components.map(component => component.start + component.duration))
  return [
    '-n', '-hide_banner', '-i', sourcePath, ...inputs,
    '-filter_complex', chains.join(';'),
    '-map', '[outv]', '-map', '0:a?', '-t', end.toFixed(3), '-r', String(project.fps),
    '-s', `${project.width}x${project.height}`,
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p',
    '-c:a', 'copy', '-movflags', '+faststart', '-fs', String(maxOutputBytes), outputPath,
  ]
}
