/**
 * shotcraft 卡渲染注册表（Host 渲染用）。
 *
 * 31 张卡：componentId → 卡片文件（相对本目录）、具名 export 组件名、
 * 默认 props 导出名、总帧数导出名。由扫描卡片文件生成（命名约定：
 * 主 export = componentId 后段的 PascalCase；个别特例见下表硬编码），
 * 新增卡片后重跑扫描，勿手改。
 *
 * Self-contained ESM：无 import，顶层 export 各占一行。
 */

/**
 * 每张卡的渲染注册信息。
 * @typedef {object} ShotcraftRenderEntry
 * @property {string} file 卡片 tsx（相对 shotcraft-cards/ 目录）
 * @property {string} exportName 具名 export 的组件名
 * @property {string} defaultsExport 默认 props 导出名（与调用方 params 合并，调用方优先）
 * @property {string} durationExport 总帧数导出名（渲染入口取 durationInFrames 用）
 */

/** 31 张卡的渲染注册表。 */
export const SHOTCRAFT_COMPONENTS = {
  'typography/marker-underline-title': {
    file: 'typography/marker-underline-title.tsx',
    exportName: 'MarkerUnderlineTitle',
    defaultsExport: 'MARKER_UNDERLINE_TITLE_DEFAULTS',
    durationExport: 'MARKER_UNDERLINE_TITLE_DURATION',
  },
  'typography/blur-slide': {
    file: 'typography/blur-slide.tsx',
    exportName: 'BlurSlide',
    defaultsExport: 'BLUR_SLIDE_DEFAULTS',
    durationExport: 'BLUR_SLIDE_DURATION',
  },
  'typography/outline-word-fill': {
    file: 'typography/outline-word-fill.tsx',
    exportName: 'OutlineWordFill',
    defaultsExport: 'OUTLINE_WORD_FILL_DEFAULTS',
    durationExport: 'OUTLINE_WORD_FILL_DURATION',
  },
  'typography/gradient-word-sweep': {
    file: 'typography/gradient-word-sweep.tsx',
    exportName: 'GradientWordSweep',
    defaultsExport: 'GRADIENT_WORD_SWEEP_DEFAULTS',
    durationExport: 'GRADIENT_WORD_SWEEP_DURATION',
  },
  'typography/lead-word-zoom-assemble': {
    file: 'typography/lead-word-zoom-assemble.tsx',
    exportName: 'LeadWordZoomAssemble',
    defaultsExport: 'LEAD_WORD_ZOOM_ASSEMBLE_DEFAULTS',
    durationExport: 'LEAD_WORD_ZOOM_ASSEMBLE_DURATION',
  },
  'typography/brace-expand': {
    file: 'typography/brace-expand.tsx',
    exportName: 'BraceExpand',
    defaultsExport: 'BRACE_EXPAND_DEFAULTS',
    durationExport: 'BRACE_EXPAND_DURATION',
  },
  'typography/countdown-arc-scatter': {
    file: 'typography/countdown-arc-scatter.tsx',
    exportName: 'CountdownArcScatter',
    defaultsExport: 'COUNTDOWN_ARC_SCATTER_DEFAULTS',
    durationExport: 'COUNTDOWN_ARC_SCATTER_DURATION',
  },
  'typography/paper-title-card': {
    file: 'typography/paper-title-card.tsx',
    exportName: 'PaperTitleCard',
    defaultsExport: 'PAPER_TITLE_CARD_DEFAULTS',
    durationExport: 'PAPER_TITLE_CARD_DURATION',
  },
  'typography/pill-slot-cycle': {
    file: 'typography/pill-slot-cycle.tsx',
    exportName: 'PillSlotCycle',
    defaultsExport: 'PILL_SLOT_CYCLE_DEFAULTS',
    durationExport: 'PILL_SLOT_CYCLE_DURATION',
  },
  'typography/pill-chip-slot-cycle-handled': {
    file: 'typography/pill-chip-slot-cycle-handled.tsx',
    exportName: 'PillChipSlotCycleHandled',
    defaultsExport: 'PILL_CHIP_SLOT_CYCLE_HANDLED_DEFAULTS',
    durationExport: 'PILL_CHIP_SLOT_CYCLE_HANDLED_DURATION',
  },
  'typography/glitch-cycle': {
    file: 'typography/glitch-cycle.tsx',
    exportName: 'GlitchCycle',
    defaultsExport: 'GLITCH_CYCLE_DEFAULTS',
    durationExport: 'GLITCH_CYCLE_DURATION',
  },
  'typography/text-column-converge': {
    file: 'typography/text-column-converge.tsx',
    exportName: 'TextColumnConverge',
    defaultsExport: 'TEXT_COLUMN_CONVERGE_DEFAULTS',
    durationExport: 'TEXT_COLUMN_CONVERGE_DURATION',
  },
  'typography/title-demote-to-label': {
    file: 'typography/title-demote-to-label.tsx',
    exportName: 'TitleDemoteToLabel',
    defaultsExport: 'TITLE_DEMOTE_TO_LABEL_DEFAULTS',
    durationExport: 'TITLE_DEMOTE_TO_LABEL_DURATION',
  },
  'typography/type-assembly-moves': {
    file: 'typography/type-assembly-moves.tsx',
    exportName: 'TypeAssemblyMoves',
    defaultsExport: 'TYPE_ASSEMBLY_MOVES_DEFAULTS',
    durationExport: 'TYPE_ASSEMBLY_MOVES_DURATION',
  },
  // 特例：文件名是品类名，组件是具体手法名
  'typography/type-entrance-moves': {
    file: 'typography/type-entrance-moves.tsx',
    exportName: 'LetterDropPhysics',
    defaultsExport: 'LETTER_DROP_PHYSICS_DEFAULTS',
    durationExport: 'LETTER_DROP_PHYSICS_DURATION',
  },
  'typography/type-rhythm-sync': {
    file: 'typography/type-rhythm-sync.tsx',
    exportName: 'TypeRhythmSync',
    defaultsExport: 'TYPE_RHYTHM_SYNC_DEFAULTS',
    durationExport: 'TYPE_RHYTHM_SYNC_DURATION',
  },
  // 特例：文件名是品类名，组件是具体手法名
  'typography/typewriter-moves': {
    file: 'typography/typewriter-moves.tsx',
    exportName: 'TypewriterErrorRetype',
    defaultsExport: 'TYPEWRITER_ERROR_RETYPE_DEFAULTS',
    durationExport: 'TYPEWRITER_ERROR_RETYPE_DURATION',
  },
  'typography/vertical-word-roll-blur-cycle': {
    file: 'typography/vertical-word-roll-blur-cycle.tsx',
    exportName: 'VerticalWordRollBlurCycle',
    defaultsExport: 'VERTICAL_WORD_ROLL_BLUR_CYCLE_DEFAULTS',
    durationExport: 'VERTICAL_WORD_ROLL_BLUR_CYCLE_DURATION',
  },
  'typography/word-relay-filmstrip': {
    file: 'typography/word-relay-filmstrip.tsx',
    exportName: 'WordRelayFilmstrip',
    defaultsExport: 'WORD_RELAY_FILMSTRIP_DEFAULTS',
    durationExport: 'WORD_RELAY_FILMSTRIP_DURATION',
  },
  'typography/word-relay-geometry': {
    file: 'typography/word-relay-geometry.tsx',
    exportName: 'WordRelayGeometry',
    defaultsExport: 'WORD_RELAY_GEOMETRY_DEFAULTS',
    durationExport: 'WORD_RELAY_GEOMETRY_DURATION',
  },
  'ui-entrance/list-reveal': {
    file: 'ui-entrance/list-reveal.tsx',
    exportName: 'ListReveal',
    defaultsExport: 'LIST_REVEAL_DEFAULTS',
    durationExport: 'LIST_REVEAL_DURATION',
  },
  'ui-entrance/avatar-bracket-carousel': {
    file: 'ui-entrance/avatar-bracket-carousel.tsx',
    exportName: 'AvatarBracketCarousel',
    defaultsExport: 'AVATAR_BRACKET_CAROUSEL_DEFAULTS',
    durationExport: 'AVATAR_BRACKET_CAROUSEL_DURATION',
  },
  'ui-entrance/product-card-progressive-assemble': {
    file: 'ui-entrance/product-card-progressive-assemble.tsx',
    exportName: 'ProductCardProgressiveAssemble',
    defaultsExport: 'PRODUCT_CARD_PROGRESSIVE_ASSEMBLE_DEFAULTS',
    durationExport: 'PRODUCT_CARD_PROGRESSIVE_ASSEMBLE_DURATION',
  },
  'ui-entrance/research-card-stack-scroll': {
    file: 'ui-entrance/research-card-stack-scroll.tsx',
    exportName: 'ResearchCardStackScroll',
    defaultsExport: 'RESEARCH_CARD_STACK_SCROLL_DEFAULTS',
    durationExport: 'RESEARCH_CARD_STACK_SCROLL_DURATION',
  },
  'ui-entrance/draw-svg-trace': {
    file: 'ui-entrance/draw-svg-trace.tsx',
    exportName: 'DrawSvgTrace',
    defaultsExport: 'DRAW_SVG_TRACE_DEFAULTS',
    durationExport: 'DRAW_SVG_TRACE_DURATION',
  },
  'ui-entrance/wall-reveal-moves': {
    file: 'ui-entrance/wall-reveal-moves.tsx',
    exportName: 'WallRevealMoves',
    defaultsExport: 'WALL_REVEAL_MOVES_DEFAULTS',
    durationExport: 'WALL_REVEAL_MOVES_DURATION',
  },
  'data/before-after-slider-scrub': {
    file: 'data/before-after-slider-scrub.tsx',
    exportName: 'BeforeAfterSliderScrub',
    defaultsExport: 'BEFORE_AFTER_SLIDER_SCRUB_DEFAULTS',
    durationExport: 'BEFORE_AFTER_SLIDER_SCRUB_DURATION',
  },
  'data/chart-live-moves': {
    file: 'data/chart-live-moves.tsx',
    exportName: 'ChartLiveMoves',
    defaultsExport: 'CHART_LIVE_MOVES_DEFAULTS',
    durationExport: 'CHART_LIVE_MOVES_DURATION',
  },
  'data/gauge-readout-moves': {
    file: 'data/gauge-readout-moves.tsx',
    exportName: 'GaugeReadoutMoves',
    defaultsExport: 'GAUGE_READOUT_MOVES_DEFAULTS',
    durationExport: 'GAUGE_READOUT_MOVES_DURATION',
  },
  'data/scroll-brake-moves': {
    file: 'data/scroll-brake-moves.tsx',
    exportName: 'ScrollBrakeMoves',
    defaultsExport: 'SCROLL_BRAKE_MOVES_DEFAULTS',
    durationExport: 'SCROLL_BRAKE_MOVES_DURATION',
  },
  'data/timeline-travel': {
    file: 'data/timeline-travel.tsx',
    exportName: 'TimelineTravel',
    defaultsExport: 'TIMELINE_TRAVEL_DEFAULTS',
    durationExport: 'TIMELINE_TRAVEL_DURATION',
  },
}
