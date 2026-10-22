import type { LibraryRef } from './packaging-plan.js'

/** Whitelist entry for one AI口播包装库 component (params mirror the engine). */
export interface AikouComponentSpec {
  readonly componentId: string
  readonly name: string
  /** Engine z-layer: 'over' = above the presenter, 'behind' = behind (rendered as a normal overlay here). */
  readonly z: 'over' | 'behind'
  /** Params fields that must be present for renderAikouComponent to run. */
  readonly required: readonly string[]
  /** Params fields the renderer understands but can fall back on. */
  readonly optional: readonly string[]
  readonly notes: string
  /** Example layer copied verbatim from the registry (null when the registry has none). */
  readonly example: Record<string, unknown> | null
}

/** The 8 whitelisted AI口播包装库 components keyed by componentId. */
export declare const AIKOU_COMPONENTS: Record<string, AikouComponentSpec>

/** Scoped stylesheet for the HTML returned by renderAikouComponent. */
export declare const AIKOU_CSS: string

/**
 * Render one aikou library component as a static HTML snapshot at `timeSec`
 * seconds into the component (0 = component start; params may carry
 * engine-style t0/t1 for the enter/exit animation windows).
 */
export declare function renderAikouComponent(libraryRef: LibraryRef, timeSec: number): string

/**
 * Rasterize one aikou component to a full-canvas PNG blob for the Host
 * FFmpeg overlay chain (the Host loops a still PNG per component).
 */
export declare function renderAikouOverlayPng(libraryRef: LibraryRef, width: number, height: number, timeSec: number): Promise<Blob>

/**
 * Draw one aikou component onto a 2D canvas context with the Canvas 2D API
 * (taint-free; mirrors renderAikouComponent without DOM rasterization).
 */
export declare function drawAikouComponent(ctx: CanvasRenderingContext2D, libraryRef: LibraryRef, timeSec: number): void
