/** shotcraft 卡渲染注册表（Host 渲染用）的类型声明。 */

/** 一张卡的渲染注册信息。 */
export interface ShotcraftRenderEntry {
  /** 卡片 tsx（相对 shotcraft-cards/ 目录）。 */
  readonly file: string
  /** 具名 export 的组件名（如 BlurSlide）。 */
  readonly exportName: string
  /** 默认 props 导出名（与调用方 params 合并，调用方优先）。 */
  readonly defaultsExport: string
  /** 总帧数导出名（渲染入口取 durationInFrames 用）。 */
  readonly durationExport: string
}

/** 31 张卡的渲染注册表（键为 componentId，如 'typography/blur-slide'）。 */
export declare const SHOTCRAFT_COMPONENTS: Record<string, ShotcraftRenderEntry>
