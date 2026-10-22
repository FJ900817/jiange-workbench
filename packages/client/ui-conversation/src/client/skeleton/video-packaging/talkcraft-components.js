/**
 * video-talkcraft 真 props 卡注册表（P1）。
 *
 * 只读来源（从未修改）：video-talkcraft 库的 references/cards-index.json
 * （29 张 hardcoded=false 的真 props 卡）与 template/cards/*.tsx 的 Props 声明。
 * params 即 Remotion 组件 props，整包透传给隔离渲染服务；本模块只做注册与描述，
 * 不做渲染（路线 A：Remotion 整段渲染 + FFmpeg 透明叠加）。
 *
 * Self-contained ESM：无 import，顶层 export 各占一行（与 aikou-components.js 同约定，
 * 可内联进 editor 文档）。
 */

/** 29 张真 props 卡的 componentId 白名单（顺序与库索引一致）。 */
export const TALKCRAFT_COMPONENT_IDS = Object.freeze([
  'bed-echo-blur',
  'chip-grid-single-select',
  'countdown-arc-scatter',
  'crash-zoom-punch',
  'doc-park-left-pill-deal',
  'error-retype',
  'filmstrip-conveyor',
  'flying-words',
  'gallery-wall-dolly',
  'grid-to-hero',
  'host-card-glass-board',
  'info-card-assemble',
  'lead-word-zoom-assemble',
  'line-carry-transition',
  'parallel-items-with-host',
  'rack-focus-pair',
  'reticle-lock-on',
  'scanline-annotate',
  'source-converge',
  'split-60-40-story',
  'split-compare-slider',
  'split-text-stagger',
  'stack-fan-out',
  'still-layout-relay',
  'timeline-photo-strip',
  'title-demote-to-label',
  'unit-grid-proportion',
  'word-relay-filmstrip',
  'word-slot-cycle',
])

/**
 * 每张卡的注册信息：propsSchema（参数名/类型/是否必填/默认值/说明）、
 * meta（宽高/fps/总帧数）、semanticWords（26 词表中的词）、inputType（输入类型）。
 */
export const TALKCRAFT_COMPONENTS = {
  'bed-echo-blur': {
    slug: 'bed-echo-blur',
    alphaFile: 'talkcraft-cards/bed-echo-blur.tsx', // 透明改编版（全量）：根整屏底已去掉，叠加渲染时用此文件
    name: "同源模糊底床",
    oneliner: "竖屏素材（9:16）装白边卡放右侧，同一条素材放大 1.25 + blur 26 + brightness .45 + saturate .8 铺满当底床且慢放 0.5×；左侧标题两行 + 来源两行逐行升入，前景卡落位后极缓推 1→1.03，7.2s 字与卡退场、底床同帧收",
    category: "素材呈现",
    priority: "P0",
    meta: { width: 960, height: 540, fps: 30, durationInFrames: 243, durationSec: 8.1 },
    semanticWords: ["例证", "引用"],
    inputType: ["V", "人"],
    propsSchema: [
      { name: 'src', kind: 'string', required: false, default: "", desc: "竖屏素材（9:16 视频）；同一条渲两份：前景清晰 1× + 底床慢放 0.5×。不传 = footage 占位" },
      { name: 'title', kind: 'array', required: true, default: "有内置示例", desc: "左侧标题两行" },
      { name: 'note', kind: 'array', required: false, default: "有内置示例", desc: "来源说明两行" },
    ],
  },
  'chip-grid-single-select': {
    slug: 'chip-grid-single-select',
    alphaFile: 'talkcraft-cards/chip-grid-single-select.tsx', // 透明改编版（全量）：根整屏底已去掉；支持 theme light/dark（深色字浅色版），叠加渲染时用此文件
    name: "五选一反黑",
    oneliner: "N 个候选 chip 3+2 居中铺开让观众读题（前 2s）；选中帧先插 1 帧灰色按压，紧接 5 帧 linear 反黑（底→墨、字→白）+ 1→1.04→1 极轻正弦回弹，其余 chip 降到 18% 但位置锁死；停 1.5s 看清选中态后余项归零、黑 chip 上移 46px 收窄 0.82 并横向补偿回中线，下方算式行浮现逐词加深——\"选了它，然后……\"",
    category: "数据信息图",
    priority: "P1",
    meta: { width: 960, height: 540, fps: 30, durationInFrames: 216, durationSec: 7.2 },
    semanticWords: ["对比", "数据", "选择"],
    inputType: ["文"],
    propsSchema: [
      { name: 'question', kind: 'string', required: true, default: "五个方案，我选哪个？", desc: "问题行（画面文字）" },
      { name: 'options', kind: 'array', required: true, default: "有内置示例", desc: "候选项（≤6，每行最多 3 枚：前 3 上排、其余下排）" },
      { name: 'selected', kind: 'number', required: false, default: "2", desc: "选中项索引" },
      { name: 'equation', kind: 'array', required: false, default: "有内置示例", desc: "算式行（逐词加深；accent 的词用强调色）" },
    ],
  },
  'countdown-arc-scatter': {
    slug: 'countdown-arc-scatter',
    alphaFile: 'talkcraft-cards/countdown-arc-scatter.tsx', // 透明改编版（全量）：根整屏底已去掉；支持 theme light/dark（深色字浅色版），叠加渲染时用此文件
    name: "数字弧落标题",
    oneliner: "一串相邻递减的数字 11 / 10 / 9 … 5 / 4 / 3 切向挂在半径 150 的弧上，整盘从 96° 扫回 0°（0.57s，power2.out 急停），位置角超 ±70° 的数字用角度算透明度\"转进视野\"；停稳那一刻被选中的\"5\"正在弧顶，随即 0.3s 平移到标题首字符位并同步回正，其余数字原地 blur 3 淡出不位移，\"分钟 / 搭好 / 创作系统\"逐词解糊，末词 1.75s 染强调色；落定后整幕静止到 4.6s 同收",
    category: "字幕花字",
    priority: "P2",
    meta: { width: 960, height: 540, fps: 30, durationInFrames: 162, durationSec: 5.4 },
    semanticWords: ["钩子", "数据"],
    inputType: ["文"],
    propsSchema: [
      { name: 'numbers', kind: 'array', required: false, default: "有内置示例", desc: "弧上的数字串（相邻递减），含被选中的那个" },
      { name: 'pick', kind: 'number', required: false, default: "5", desc: "被选中、落成标题首字符的数" },
      { name: 'words', kind: 'array', required: true, default: "有内置示例", desc: "标题后续词（末词染强调色）" },
      { name: 'accent', kind: 'string', required: false, default: "#0066cc", desc: "末词颜色（唯一强调色）" },
    ],
  },
  'crash-zoom-punch': {
    slug: 'crash-zoom-punch',
    alphaFile: 'talkcraft-cards/crash-zoom-punch.tsx', // 透明改编版（全量）：根整屏底已去掉，叠加渲染时用此文件
    name: "急推特写",
    oneliner: "全景静置 1s 让观众看清整页，然后 6 帧 ease-in 急推到截图里的目标文字块（zoom 1→2.3，相机中心同步收敛到目标中心），过冲后 5 帧回收 4.5% 到 2.2 落定；急推那 6 帧叠一记短促 blur 当运动模糊，之后画面钉死——一次性的重音\"就是这一行\"",
    category: "强调标注",
    priority: "P1",
    meta: { width: 960, height: 540, fps: 30, durationInFrames: 144, durationSec: 4.8 },
    semanticWords: ["强调", "例证"],
    inputType: ["图", "截图"],
    propsSchema: [
      { name: 'src', kind: 'string', required: false, default: "", desc: "真截图（铺满 800×396 截图卡，object-fit cover）；不传 = CSS 假设置页" },
      { name: 'target', kind: 'object', required: false, default: "有内置示例", desc: "目标 bbox（舞台坐标），急推中心 = 它的中心；不传 = demo 的\"自动续费\"文字块" },
      { name: 'label', kind: 'string', required: true, default: "自动续费", desc: "假设置页的目标行文案（仅无 src 时用）" },
      { name: 'sub', kind: 'string', required: false, default: "下次扣款 2026-10-05 · ¥ 19…", desc: "" },
    ],
  },
  'doc-park-left-pill-deal': {
    slug: 'doc-park-left-pill-deal',
    alphaFile: 'talkcraft-cards/doc-park-left-pill-deal.tsx', // 透明改编版（全量）：根整屏底已去掉；支持 theme light/dark（深色字浅色版），叠加渲染时用此文件
    name: "文档驻留发牌",
    oneliner: "700×420 的文档先满幅在场 0.9s，然后不淡出而是以左边缘为锚驻留（0.8s power2.inOut：translateX −514 + scale .92，只露约 35%——\"来源还在\"），右侧按旁白节奏每 1.3s 慢发牌一张白底描边药丸（0.2s 淡入 + 0.37s back.out(1.7) 落定，先实后稳），每张落定 0.3s 后其下说明行逐词加深并留住；文档内容全程 −18.75 px/s 极慢自动滚动\"正在被读\"；三张落齐是静态结论清单，6.6s 同收",
    category: "素材呈现",
    priority: "P1",
    meta: { width: 960, height: 540, fps: 30, durationInFrames: 222, durationSec: 7.4 },
    semanticWords: ["引用"],
    inputType: ["截图", "文"],
    propsSchema: [
      { name: 'docTitle', kind: 'string', required: true, default: "2026 中国短视频创作者调研报告", desc: "文档标题（mock 文档顶部；传 docSrc 时不显示）" },
      { name: 'pills', kind: 'array', required: true, default: "有内置示例", desc: "三条结论（药丸文案，按口播顺序）" },
      { name: 'notes', kind: 'array', required: false, default: "有内置示例", desc: "每条结论下的一行说明（与 pills 同序）" },
      { name: 'hint', kind: 'string', required: false, default: "读完 60 页，我记下三条", desc: "提示行" },
      { name: 'docSrc', kind: 'string', required: false, default: "", desc: "真文档长截图（cover 铺进文档卡，随内容一起慢滚）；不传 = 灰条 mock" },
      { name: 'accent', kind: 'string', required: false, default: "#0066cc", desc: "药丸圆点颜色（唯一强调色）" },
    ],
  },
  'error-retype': {
    slug: 'error-retype',
    alphaFile: 'talkcraft-cards/error-retype.tsx', // 透明改编版（全量）：根整屏底已去掉；支持 theme light/dark（深色字浅色版），叠加渲染时用此文件
    name: "打字改口",
    oneliner: "句干\"口播做得好，靠的是\"先在，后半句以打字机节奏（0.09s/字，帧确定硬切）打出\"模型大小\"→ 停 0.55s、光标以 4 帧半周期闪两下（犹豫）→ 以更快的 0.06s/字退掉 → 零犹豫同速重打\"讲述方法\"→ 完稿光标闪两下后摘除，整句静置 ≥2.6s 再同收。三档速度差是戏的全部，光标是演员的脸",
    category: "字幕花字",
    priority: "P1",
    meta: { width: 960, height: 540, fps: 30, durationInFrames: 177, durationSec: 5.9 },
    semanticWords: ["转折"],
    inputType: ["文"],
    propsSchema: [
      { name: 'prefix', kind: 'string', required: false, default: "口播做得好，靠的是", desc: "句干（先在，不动）" },
      { name: 'first', kind: 'string', required: true, default: "模型大小", desc: "错的半句（打出后被退掉）" },
      { name: 'second', kind: 'string', required: true, default: "讲述方法", desc: "对的半句（零犹豫重打）" },
      { name: 'accent', kind: 'string', required: false, default: "#0066cc", desc: "光标颜色（唯一强调色）" },
    ],
  },
  'filmstrip-conveyor': {
    slug: 'filmstrip-conveyor',
    alphaFile: 'talkcraft-cards/filmstrip-conveyor.tsx', // 透明改编版（试点）：根整屏底已去掉，叠加渲染时用此文件
    name: "传送带列举 + 减速停靠",
    oneliner: "六格 240×160 白边卡接成一条传送带匀速左行 176px/s，经过中线的格按\"离中线的距离\"每帧连续放大到 1.08 并提亮（不是到点触发）；讲到第四格时按位置-时间分段积分减速（匀速 → 0.5s 减速 → 0.25× 慢速 1.4s → 0.6s 加速 → 匀速），减速结束点正好是\"第四格居中\"；六格全部过完中线后整体退场",
    category: "素材呈现",
    priority: "P1",
    meta: { width: 960, height: 540, fps: 30, durationInFrames: 250, durationSec: 8.3 },
    semanticWords: ["例证", "列举"],
    inputType: ["图"],
    propsSchema: [
      { name: 'srcs', kind: 'array', required: false, default: "", desc: "六张真图（第 i 格）；不传用六档灰调占位" },
      { name: 'labels', kind: 'array', required: true, default: "", desc: "六格标签；不传用\"构图 一~六\"" },
      { name: 'title', kind: 'string', required: true, default: "去年爆款封面的六种构图", desc: "顶部标题 / 小注" },
      { name: 'note', kind: 'string', required: false, default: "2025 年播放量前六的封面 · 第四种出现最多", desc: "" },
    ],
  },
  'flying-words': {
    slug: 'flying-words',
    alphaFile: 'talkcraft-cards/flying-words.tsx', // 透明改编版（全量）：根整屏底已去掉，叠加渲染时用此文件
    name: "关键词隧道",
    oneliner: "深底上 22 个名词按黄金角铺在扁椭圆截面（半径 82~247）上，沿 z 轴从 −1750 匀速飞到 +800 穿过相机平面擦身而过，每词相位 i/N 均分、跑满 2 整圈首尾无缝；生命曲线 [0,1,.5,.2,0]——前 1/4 猛亮、中段压到半透给前景让位、末段拖尾消失；越近越往画外散（drift .5→1.85），冲到眼前（u>.86）加运动模糊；中心一枚静态光晕钉住\"隧道尽头\"。它是幕底级背景层，前景放人物或标题",
    category: "字幕花字",
    priority: "P2",
    meta: { width: 960, height: 540, fps: 30, durationInFrames: 192, durationSec: 6.4 },
    semanticWords: ["氛围", "钩子"],
    inputType: ["文"],
    propsSchema: [
      { name: 'words', kind: 'array', required: true, default: "有内置示例", desc: "词表（12~30 个；<12 画面稀，>30 近处糊成一片）" },
    ],
  },
  'gallery-wall-dolly': {
    slug: 'gallery-wall-dolly',
    alphaFile: 'talkcraft-cards/gallery-wall-dolly.tsx', // 透明改编版（全量）：根整屏底已去掉；整屏构图重排为浮动面板，叠加渲染时用此文件
    name: "照片墙推轨",
    oneliner: "三张平级案例（430×290）挂在 rotateY −12° 的 3D 墙上（深灰径向幕底 + 地面反光），相机全景 z .61 → 逐张推近停靠 z 1.15（移 1.0s + 停 0.9s；缩放绕当前图发生，其余压暗 .5 + blur 3px，当前图内部 1→1.03 微推）→ 拉回全景与字同收",
    category: "素材呈现",
    priority: "P1",
    meta: { width: 960, height: 540, fps: 30, durationInFrames: 258, durationSec: 8.6 },
    semanticWords: ["例证", "对比", "列举"],
    inputType: ["图"],
    propsSchema: [
      { name: 'srcs', kind: 'array', required: false, default: "", desc: "真图（三张）；不传用灰调占位" },
      { name: 'labels', kind: 'array', required: true, default: "", desc: "压图标签；不传用默认文案" },
    ],
  },
  'grid-to-hero': {
    slug: 'grid-to-hero',
    alphaFile: 'talkcraft-cards/grid-to-hero.tsx', // 透明改编版（全量）：根整屏底已去掉，叠加渲染时用此文件
    name: "网格收成主角",
    oneliner: "2×2 网格错峰 120ms 落位先并列，讲到那一格时它 0.8s 长成 620×444 主图、其余三格同一条曲线收成右侧一列 220×132 小图（不消失），停 2s 后回到网格，再一起退场",
    category: "素材呈现",
    priority: "P1",
    meta: { width: 960, height: 540, fps: 30, durationInFrames: 232, durationSec: 7.7 },
    semanticWords: ["对比", "列举", "选择"],
    inputType: ["图", "V"],
    propsSchema: [
      { name: 'labels', kind: 'array', required: true, default: "", desc: "四格压图标签；不传用默认文案" },
      { name: 'srcs', kind: 'array', required: false, default: "", desc: "四格真素材（图片 → <Img>，.mp4/.webm/.mov → <OffthreadVideo>）；不传用灰调占位" },
      { name: 'heroIdx', kind: 'number', required: false, default: "有内置示例", desc: "哪一格成为主角（0 起），默认 CONFIG.heroIdx = 2（第 3 格）" },
    ],
  },
  'host-card-glass-board': {
    slug: 'host-card-glass-board',
    alphaFile: 'talkcraft-cards/host-card-glass-board.tsx', // 透明改编版（全量）：根整屏底已去掉；整屏构图重排为浮动面板，叠加渲染时用此文件
    name: "人物竖卡玻璃台",
    oneliner: "左 1/3 口播人物装 250×444 的 9:16 竖卡常驻（圆角 22、2px 半透白描边、演播室底），右 2/3 一块 570×408 的玻璃道具台以左缘为轴 rotateY −18° → −10° 显影、sheen 扫一次；板头期数小字 → 大标题逐字解糊 → 英文字距行，板内道具按口播接力：三步 tile 逐个 back.out pop、连接线从左长出带箭头、结果胶囊最后落定；6.1s 板、人、装饰同收",
    category: "人物互动",
    priority: "P1",
    meta: { width: 960, height: 540, fps: 30, durationInFrames: 210, durationSec: 7.0 },
    semanticWords: ["步骤"],
    inputType: ["人", "文", "界"],
    propsSchema: [
      { name: 'hostSrc', kind: 'string', required: false, default: "", desc: "口播人物 alpha 视频（必需输入；不传 = 灰阶剪影兜底）" },
      { name: 'tag', kind: 'string', required: false, default: "TALKCRAFT · 第 12 期", desc: "板头期数小字" },
      { name: 'title', kind: 'string', required: true, default: "口播工作流", desc: "大标题（逐字解糊）" },
      { name: 'en', kind: 'string', required: false, default: "SCRIPT → VOICE → RENDER", desc: "英文字距行" },
      { name: 'steps', kind: 'array', required: true, default: "有内置示例", desc: "三步道具（2~4 步；每步 图标字符 / 标签 / 副标）" },
      { name: 'result', kind: 'string', required: false, default: "一遍过 · 3 分 20 秒", desc: "结果胶囊文案" },
    ],
  },
  'info-card-assemble': {
    slug: 'info-card-assemble',
    alphaFile: 'talkcraft-cards/info-card-assemble.tsx', // 透明改编版（试点）：根整屏底已去掉，叠加渲染时用此文件
    name: "信息卡逐字段自建",
    oneliner: "一张信息卡（书 / 工具 / 人物）像被结构化抽取一样自己长出来：封面 rise → 标题 rise → 三枚标签 pop → 价格行 rise → 三行要点逐行 rise、其中两行被马克底块 5 帧从左刷过 → 三块色卡 pop；相邻字段只隔 2 帧（配方帧）、单字段行程 0.5s 远大于间隔所以画面是\"涌\"不是\"点\"，整卡全程极慢前推 1→1.06",
    category: "素材呈现",
    priority: "P1",
    meta: { width: 960, height: 540, fps: 30, durationInFrames: 216, durationSec: 7.2 },
    semanticWords: ["例证"],
    inputType: ["图", "文"],
    propsSchema: [
      { name: 'src', kind: 'string', required: false, default: "", desc: "封面 / 头像真图（object-fit cover）；不传 = 灰调占位" },
      { name: 'caption', kind: 'string', required: false, default: "这期推荐的一本书", desc: "左侧版面说明（画面文字）" },
      { name: 'title', kind: 'string', required: true, default: "《讲故事的科学》", desc: "标题" },
      { name: 'pills', kind: 'array', required: false, default: "有内置示例", desc: "标签 pill（≤3 枚与配方帧一一对应，多出的按 2 帧续排）" },
      { name: 'price', kind: 'string', required: false, default: "¥ 39.9", desc: "价格 / 关键数字行（空字符串 = 不显示该行）" },
      { name: 'lines', kind: 'array', required: true, default: "有内置示例", desc: "要点行（≤3 行与配方帧一一对应）" },
      { name: 'highlightLines', kind: 'array', required: false, default: "有内置示例", desc: "哪几行要点带马克底块（行索引）" },
      { name: 'swatches', kind: 'array', required: false, default: "有内置示例", desc: "底部色卡颜色" },
    ],
  },
  'lead-word-zoom-assemble': {
    slug: 'lead-word-zoom-assemble',
    alphaFile: 'talkcraft-cards/lead-word-zoom-assemble.tsx', // 透明改编版（全量）：根整屏底已去掉；支持 theme light/dark（深色字浅色版），叠加渲染时用此文件
    name: "首词占满补句",
    oneliner: "首词\"效率\"以 2.3 倍字号独占画面正中、hold 0.4s 期间继续推近 6%；随后一条 power3.inOut 曲线同时完成\"缩回终字号\"（0.4s）与\"整行左滑归位\"（0.8s，同起同曲线时长两倍），后续词各自从槽位右侧 28px 被推进来（0.4s power4.out，淡入只 2 帧），结论词落位即强调色；整行落定后上移 28px、副行同一时窗浮出，静置 3s 后同收",
    category: "字幕花字",
    priority: "P1",
    meta: { width: 960, height: 540, fps: 30, durationInFrames: 156, durationSec: 5.2 },
    semanticWords: ["金句", "转折", "标题"],
    inputType: ["文"],
    propsSchema: [
      { name: 'words', kind: 'array', required: true, default: "有内置示例", desc: "整句按词拆开，第一个词是首词（先占满画面）" },
      { name: 'subline', kind: 'string', required: false, default: "不是参数，也不是模型大小", desc: "副行（整行上移让出的位置）" },
      { name: 'accentIndex', kind: 'number', required: false, default: "words.length", desc: "换强调色的词序号（默认末词；-1 = 不换色）" },
      { name: 'accent', kind: 'string', required: false, default: "#0066cc", desc: "唯一强调色" },
    ],
  },
  'line-carry-transition': {
    slug: 'line-carry-transition',
    alphaFile: 'talkcraft-cards/line-carry-transition.tsx', // 透明改编版（全量）：根整屏底已去掉；支持 theme light/dark（深色字浅色版），叠加渲染时用此文件
    name: "线条接力转场",
    oneliner: "A 镜标题下先画出一条强调色下划线，停一拍后它继续向右冲出画面，镜头跟着线横移 960px（2s power2.inOut；横移段线的生长量 = 镜头位移量，笔头钉在画面 x≈640 永不出画也永不落后），线到位后拐直角向上、向右、向下、向左围出一个 560×330 的画框，框闭合那一帧笔头消失、B 镜内容在框内淡入——全程无剪切，一条线把两镜缝在一起",
    category: "转场结构",
    priority: "P1",
    meta: { width: 960, height: 540, fps: 30, durationInFrames: 204, durationSec: 6.8 },
    semanticWords: ["转场", "章节"],
    inputType: ["场", "图", "文"],
    propsSchema: [
      { name: 'titleA', kind: 'string', required: true, default: "第一部分 · 为什么慢", desc: "A 镜标题 / 副标" },
      { name: 'titleB', kind: 'string', required: true, default: "第二部分 · 怎么快", desc: "B 镜标题 / 副标（落在画框内图片下方）" },
      { name: 'srcB', kind: 'string', required: false, default: "", desc: "B 内容图；不传 = 灰调占位" },
      { name: 'subA', kind: 'string', required: false, default: "三个拖慢流程的地方", desc: "" },
      { name: 'subB', kind: 'string', required: false, default: "把三处改成自动", desc: "" },
    ],
  },
  'parallel-items-with-host': {
    slug: 'parallel-items-with-host',
    alphaFile: 'talkcraft-cards/parallel-items-with-host.tsx', // 透明改编版（全量）：根整屏底已去掉；整屏构图重排为浮动面板，叠加渲染时用此文件
    name: "并列句排版（人物在场）",
    oneliner: "口播讲\"A、B、C\"三件并列的事而人还在画面里时，三项按口播逐个弹出（0.6s 一项）、标签压图且大，七种版式一卡切换——头顶横排 / 三横条灰转彩 / 竖列虚化底 / 顶部卡堆 / 竖切三分 / 斜切三分 / 背景轮换大字",
    category: "人物互动",
    priority: "P0",
    meta: { width: 960, height: 540, fps: 30, durationInFrames: 663, durationSec: 22.1 },
    semanticWords: ["步骤", "例证", "列举"],
    inputType: ["人", "图"],
    propsSchema: [
      { name: 'layout', kind: 'string', required: false, default: "tour", desc: "单式 or 七式巡演（默认，与 demo 一致）" },
      { name: 'items', kind: 'array', required: true, default: "", desc: "三项标签；不传用各式默认文案" },
      { name: 'srcs', kind: 'array', required: false, default: "", desc: "三张真图（与 items 一一对应）；不传用灰调占位" },
      { name: 'hostSrc', kind: 'string', required: false, default: "", desc: "人物 alpha 视频（webm/mov）；不传用灰阶剪影" },
    ],
  },
  'rack-focus-pair': {
    slug: 'rack-focus-pair',
    alphaFile: 'talkcraft-cards/rack-focus-pair.tsx', // 透明改编版（全量）：根整屏底已去掉，叠加渲染时用此文件
    name: "焦点接力",
    oneliner: "两张白边卡前后叠放、永远一清一糊：讲到哪张，焦点 0.7s power2.inOut 转移过去（前张 blur 0→8 / brightness 1→.6 / scale 1.02→.97，后张反向），4.6s 再转回，6.4s 两张同收——像镜头在两张素材之间对焦",
    category: "素材呈现",
    priority: "P1",
    meta: { width: 960, height: 540, fps: 30, durationInFrames: 216, durationSec: 7.2 },
    semanticWords: ["对比"],
    inputType: ["图"],
    propsSchema: [
      { name: 'labels', kind: 'array', required: true, default: "有内置示例", desc: "两张标签 [前张, 后张]" },
      { name: 'srcs', kind: 'array', required: false, default: "", desc: "两张真图 [前张, 后张]；不传用灰调占位" },
    ],
  },
  'reticle-lock-on': {
    slug: 'reticle-lock-on',
    alphaFile: 'talkcraft-cards/reticle-lock-on.tsx', // 透明改编版（全量）：根整屏底已去掉，叠加渲染时用此文件
    name: "准星咬合",
    oneliner: "四个 L 角从四个画外方向（±700, ±500）10 帧扑向截图上的目标，到位时框仍是目标 bbox 的 2.2 倍，随即 6 帧收缩过头到 0.94 再 back.out 回弹到 1——\"咔\"的咬合感来自超调；咬合那一帧目标白闪 .55→.28 常驻微亮、标签同帧 back 弹出在目标右侧，之后全部钉死",
    category: "强调标注",
    priority: "P2",
    meta: { width: 960, height: 540, fps: 30, durationInFrames: 192, durationSec: 6.4 },
    semanticWords: ["强调"],
    inputType: ["截图", "图"],
    propsSchema: [
      { name: 'src', kind: 'string', required: false, default: "", desc: "真截图（铺满 700×420 截图卡，object-fit cover）；不传 = CSS 假设置页" },
      { name: 'target', kind: 'object', required: false, default: "有内置示例", desc: "目标 bbox（相对截图左上角）；不传 = demo 按钮" },
      { name: 'label', kind: 'string', required: true, default: "就是这个按钮", desc: "咬合帧弹出的标签" },
      { name: 'buttonText', kind: 'string', required: false, default: "立即开通 ¥ 199 / 年", desc: "假设置页里目标按钮的文字（仅无 src 时用）" },
    ],
  },
  'scanline-annotate': {
    slug: 'scanline-annotate',
    alphaFile: 'talkcraft-cards/scanline-annotate.tsx', // 透明改编版（全量）：根整屏底已去掉；支持 theme light/dark（深色字浅色版），叠加渲染时用此文件
    name: "扫描线逐处点名",
    oneliner: "一条强调色扫描线匀速（零缓动）自上而下掠过截图，越过每个目标下缘那一刻取景框从 1.75 倍收拢对准（back.out）+ 7% 对焦确认闪，滞后 5 帧右侧标注淡入并常驻；右上状态行实时数 0/4 → 4/4 → \"分析完成\"——一次扫描点出 N 处，节奏由扫描线统一驱动",
    category: "强调标注",
    priority: "P1",
    meta: { width: 960, height: 540, fps: 30, durationInFrames: 180, durationSec: 6.0 },
    semanticWords: ["强调"],
    inputType: ["截图", "图"],
    propsSchema: [
      { name: 'src', kind: 'string', required: false, default: "", desc: "真截图（铺满 600×396 截图卡，object-fit cover）；不传 = CSS 假落地页" },
      { name: 'targets', kind: 'array', required: false, default: "有内置示例", desc: "目标 bbox 列表（相对截图左上角），按 y 从上到下；不传 = demo 四个" },
      { name: 'labels', kind: 'string', required: true, default: "有内置示例", desc: "每个目标的标注（与 targets 一一对应）：主行 + 副行" },
    ],
  },
  'source-converge': {
    slug: 'source-converge',
    alphaFile: 'talkcraft-cards/source-converge.tsx', // 透明改编版（全量）：根整屏底已去掉；支持 theme light/dark（深色字浅色版），叠加渲染时用此文件
    name: "多源汇聚",
    oneliner: "四条细贝塞尔曲线错峰 0.15s 由左向右逐路接通，四个来源胶囊沿各自真实曲线 1.5s 滑向右侧汇聚点并三段式缩小（前 75% 1→.34 慢慢瘦身、后 25% 掉光——\"被吸进去\"），强调色数据包全程沿线滑行两个整周期；吞并瞬间\"一张表\"脉冲 +12%，曲线从起点方向擦除，结果胶囊 + 说明行 0.6s 滑到画面正中静置",
    category: "数据信息图",
    priority: "P2",
    meta: { width: 960, height: 540, fps: 30, durationInFrames: 198, durationSec: 6.6 },
    semanticWords: ["机制"],
    inputType: ["文"],
    propsSchema: [
      { name: 'title', kind: 'string', required: true, default: "四个平台的数据，怎么汇成一张表", desc: "标题（版面内容，不是旁白字幕）" },
      { name: 'sources', kind: 'array', required: true, default: "有内置示例", desc: "来源名（每项一个胶囊；4 条是甜点，>6 条曲线几乎重合）" },
      { name: 'hub', kind: 'string', required: false, default: "一张表", desc: "汇聚胶囊文案" },
      { name: 'caption', kind: 'string', required: false, default: "每天 8 点自动更新", desc: "汇聚完成后的说明行" },
    ],
  },
  'split-60-40-story': {
    slug: 'split-60-40-story',
    alphaFile: 'talkcraft-cards/split-60-40-story.tsx', // 透明改编版（全量）：根整屏底已去掉；整屏构图重排为浮动面板，叠加渲染时用此文件
    name: "60/40 主从分屏",
    oneliner: "左 60%（576px）一条素材缓推 1→1.06 做主（时长 = 镜头），3px 白中缝，右 40% 标题 30px 两行 + 三枚 pastel chip（24px 粗）按口播 1.0 / 1.6 / 2.2s 逐枚 back.out 弹出；6.8s 素材、中缝、字全部同帧收齐",
    category: "素材呈现",
    priority: "P1",
    meta: { width: 960, height: 540, fps: 30, durationInFrames: 216, durationSec: 7.2 },
    semanticWords: ["步骤", "列举"],
    inputType: ["人", "V", "文"],
    propsSchema: [
      { name: 'src', kind: 'string', required: false, default: "", desc: "左格 B-roll 视频（cover 铺满左格）；不传 = footage 占位" },
      { name: 'hostSrc', kind: 'string', required: false, default: "", desc: "左格放口播本人（alpha 视频）；传了就渲人物而不是 src / 占位" },
      { name: 'title', kind: 'array', required: true, default: "有内置示例", desc: "标题（每项一行）" },
      { name: 'chips', kind: 'array', required: true, default: "有内置示例", desc: "三枚要点 chip 文案" },
      { name: 'chipBg', kind: 'array', required: false, default: "有内置示例", desc: "chip 底板色（pastel，同组不重复；见 layout.md §7）" },
    ],
  },
  'split-compare-slider': {
    slug: 'split-compare-slider',
    alphaFile: 'talkcraft-cards/split-compare-slider.tsx', // 透明改编版（全量）：根整屏底已去掉；整屏构图重排为浮动面板，叠加渲染时用此文件
    name: "对比双分屏（滑动揭示）",
    oneliner: "两张同构图的图叠放，上层用 clip-path 裁掉右侧，一条 3px 白分割线（带圆钮）与裁切边由同一个进度值驱动——左图整屏起手 0.6s → 1.4s 滑到中线 → 停 1.5s → nudge 到 42% 再回中 → 滑到 8% 几乎全露右图 → 回中停 1s → 与两图同收；两图共用一条 1→1.04 的极慢推",
    category: "素材呈现",
    priority: "P0",
    meta: { width: 960, height: 540, fps: 30, durationInFrames: 296, durationSec: 9.9 },
    semanticWords: ["对比"],
    inputType: ["图"],
    propsSchema: [
      { name: 'srcBefore', kind: 'string', required: false, default: "", desc: "\"前\"图（左，上层被裁切）；不传用灰调占位" },
      { name: 'srcAfter', kind: 'string', required: false, default: "", desc: "\"后\"图（右，下层）；不传用灰调占位。只传一张（或两张相同）时自动套\"前 / 后\"两套滤镜演示调色" },
      { name: 'labelBefore', kind: 'string', required: true, default: "调色前", desc: "两枚标签文案" },
      { name: 'labelAfter', kind: 'string', required: true, default: "调色后", desc: "" },
    ],
  },
  'split-text-stagger': {
    slug: 'split-text-stagger',
    alphaFile: 'talkcraft-cards/split-text-stagger.tsx', // 透明改编版（全量）：根整屏底已去掉；支持 theme light/dark（深色字浅色版），叠加渲染时用此文件
    name: "逐字裂升",
    oneliner: "标题\"把复杂的事，讲简单\"9 个字各在自己的裁切盒（高 = 行高 78）里从下方 115% 升起、back.out(1.2) 带约 5% 过冲回落（极值 ≈1.053），字间错峰 2 帧（0.067s）、每字行程 0.5s；同时一条 3px 基线从左向右 scaleX 长到整行宽，生长时长 = 字的总错峰时长，长满与末字落定同帧——字像从一条线里长出来；1.4s 副标淡入，4.4s 整组同收",
    category: "字幕花字",
    priority: "P2",
    meta: { width: 960, height: 540, fps: 30, durationInFrames: 156, durationSec: 5.2 },
    semanticWords: ["金句", "标题"],
    inputType: ["文"],
    propsSchema: [
      { name: 'text', kind: 'string', required: true, default: "把复杂的事，讲简单", desc: "标题（逐字裂升）" },
      { name: 'sub', kind: 'string', required: false, default: "——口播脚本的第一原则", desc: "副标（落定后跟进）" },
    ],
  },
  'stack-fan-out': {
    slug: 'stack-fan-out',
    alphaFile: 'talkcraft-cards/stack-fan-out.tsx', // 透明改编版（全量）：根整屏底已去掉；支持 theme light/dark（深色字浅色版），叠加渲染时用此文件
    name: "卡堆扇形展开",
    oneliner: "五张 220×150 卡叠成一叠（微错位）→ 0.7s 绕卡堆下方 R=520 的弧心扇开成 −24°…+24° → 停 0.8s → 0.6s 铺平成一行等距五格（150 宽、间距 16、整行居中、旋转归零）→ 一起退场——\"这一叠\"变成\"这五个\"",
    category: "素材呈现",
    priority: "P1",
    meta: { width: 960, height: 540, fps: 30, durationInFrames: 204, durationSec: 6.8 },
    semanticWords: ["例证", "列举"],
    inputType: ["图"],
    propsSchema: [
      { name: 'title', kind: 'string', required: true, default: "今年拍了五张候选封面", desc: "顶部一行标题（演示语境）；传 \"\" 不显示" },
      { name: 'srcs', kind: 'array', required: false, default: "", desc: "五张真图（叠放顺序 = 数组顺序，最后一张在最上）；不传用灰调占位" },
    ],
  },
  'still-layout-relay': {
    slug: 'still-layout-relay',
    alphaFile: 'talkcraft-cards/still-layout-relay.tsx', // 透明改编版（全量）：根整屏底已去掉；整屏构图重排为浮动面板，叠加渲染时用此文件
    name: "多图排版 + 焦点接力",
    oneliner: "口播一句里要同时给几张图时，主图（首图）先落、其余同向错峰 80~150ms 入场，讲到谁谁亮（其余 brightness .6 / scale .985，主角 1.03~1.04 + 描边环）0.4s 接力，讲完全部回位再一起退场——两种版式一卡切换：一主两辅 / 三联竖图",
    category: "素材呈现",
    priority: "P0",
    meta: { width: 960, height: 540, fps: 30, durationInFrames: 467, durationSec: 15.6 },
    semanticWords: ["例证", "强调", "列举"],
    inputType: ["图"],
    propsSchema: [
      { name: 'layout', kind: 'string', required: false, default: "tour", desc: "单式 or 两式巡演（默认，与 demo 一致）" },
      { name: 'captions', kind: 'array', required: true, default: "", desc: "三条图注；不传用各式默认文案" },
      { name: 'srcs', kind: 'array', required: false, default: "", desc: "三张真图（① 顺序：主图、佐证1、佐证2；② 顺序：左中右）；不传用灰调占位" },
      { name: 'accent', kind: 'string', required: false, default: "#0066cc", desc: "描边环颜色（单强调色），默认 #0066cc" },
    ],
  },
  'timeline-photo-strip': {
    slug: 'timeline-photo-strip',
    alphaFile: 'talkcraft-cards/timeline-photo-strip.tsx', // 透明改编版（全量）：根整屏底已去掉；整屏构图重排为浮动面板，叠加渲染时用此文件
    name: "时间线照片带",
    oneliner: "有先后的几站（默认四张 240×160）沿一条时间线上下交替，日期 caption 靠线一侧；相机横移逐站停靠（移 0.9s + 停 1.0s，停靠 z 1.05 让邻站明确出画，当前站 1.03 亮 / 其余 .7）→ 拉开 z .62 看全条、有意停 1.2s → 与字同收",
    category: "素材呈现",
    priority: "P1",
    meta: { width: 960, height: 540, fps: 30, durationInFrames: 309, durationSec: 10.3 },
    semanticWords: ["时间地点", "步骤"],
    inputType: ["图"],
    propsSchema: [
      { name: 'srcs', kind: 'array', required: false, default: "", desc: "真图（四张）；不传用灰调占位" },
      { name: 'labels', kind: 'array', required: true, default: "", desc: "日期 caption；不传用默认文案" },
    ],
  },
  'title-demote-to-label': {
    slug: 'title-demote-to-label',
    alphaFile: 'talkcraft-cards/title-demote-to-label.tsx', // 透明改编版（试点）：根整屏底已去掉，叠加渲染时用此文件
    name: "标题降格成标签",
    oneliner: "章节标题\"第二步 · 拆解需求\"56px 居中解糊显影（blur 12→0，0.4s）、站稳 0.7s，然后一条 power2.inOut 曲线 0.67s 同时完成\"缩到 0.4 倍 + 飞到左上角 (80,72)\"落成 22px 小节标签（居中修正量随补间同步归零）；降格进行到 0.4s 时三条内容块已开始在其下方按口播逐条生长（clip 从 35% 宽展开 + 上移 28px，0.55s 一条）——标题不消失，变成常驻路标；末条落定后静置 2.7s 同收",
    category: "字幕花字",
    priority: "P0",
    meta: { width: 960, height: 540, fps: 30, durationInFrames: 189, durationSec: 6.3 },
    semanticWords: ["章节", "步骤", "列举", "标题", "设问"],
    inputType: ["文"],
    propsSchema: [
      { name: 'title', kind: 'string', required: true, default: "第二步 · 拆解需求", desc: "章节 / 小节标题（先居中当主角，再降格成左上角标签）" },
      { name: 'items', kind: 'array', required: true, default: "有内置示例", desc: "内容条目（≤4 条，按口播逐条生长）" },
      { name: 'itemBg', kind: 'array', required: false, default: "有内置示例", desc: "条目底板（layout §7 淡色系：蓝 / 青 / 黄 / 粉 / 紫 / 灰，同组不重复）" },
      { name: 'accent', kind: 'string', required: false, default: "#0066cc", desc: "条目左侧竖条颜色（唯一强调色）" },
    ],
  },
  'unit-grid-proportion': {
    slug: 'unit-grid-proportion',
    alphaFile: 'talkcraft-cards/unit-grid-proportion.tsx', // 透明改编版（试点）：根整屏底已去掉，叠加渲染时用此文件
    name: "点阵比例图",
    oneliner: "100 个小方格从网格中心分环长出（每环 4 帧 + ≤3 帧确定性抖动，1.1s 铺满；只做 opacity + scale .8→1，无位移），然后从左上起按阅读顺序逐格染成强调色（0.035s 一格），右侧 128px 大数字与染色同一时钟 0→37，图例最后浮出——把\"37%\"摊成 37 个可数的个体",
    category: "数据信息图",
    priority: "P0",
    meta: { width: 960, height: 540, fps: 30, durationInFrames: 195, durationSec: 6.5 },
    semanticWords: ["数据"],
    inputType: ["文"],
    propsSchema: [
      { name: 'target', kind: 'number', required: true, default: "有内置示例", desc: "染色格数 = 百分比（0~100）" },
      { name: 'unit', kind: 'string', required: false, default: "%", desc: "大数字后缀（\"%\" / \"人\" / \"家\"…）" },
      { name: 'label', kind: 'array', required: true, default: "有内置示例", desc: "大数字下的标签行（每项一行）" },
      { name: 'legend', kind: 'array', required: false, default: "有内置示例", desc: "图例：[染色项, 未染项, 备注]；空字符串 = 不显示该项" },
      { name: 'accent', kind: 'string', required: false, default: "有内置示例", desc: "强调色（默认唯一强调色）" },
    ],
  },
  'word-relay-filmstrip': {
    slug: 'word-relay-filmstrip',
    alphaFile: 'talkcraft-cards/word-relay-filmstrip.tsx', // 透明改编版（全量）：根整屏底已去掉；整屏构图重排为浮动面板，叠加渲染时用此文件
    name: "动词接力胶片",
    oneliner: "左列 360 宽的等高截图卡纵向排成胶片、深浅边框相间，右侧衬线两行——名词\"一个 AI，能\"恒定、动词原位接力：每 1.4s 旧词 0.18s 灰化淡出、胶片同起 0.4s power2.inOut 滚动恰好一卡高（212）、新词 +0.2s 起 0.25s 落位（先出后进不叠影），词块垂直中心钉在当前卡中点 y=264；末词换强调色，静置 0.9s 后胶片与词块同收——每切一个词，证据跟着翻一页",
    category: "素材呈现",
    priority: "P1",
    meta: { width: 960, height: 540, fps: 30, durationInFrames: 204, durationSec: 6.8 },
    semanticWords: ["例证", "列举"],
    inputType: ["图", "截图", "文"],
    propsSchema: [
      { name: 'noun', kind: 'string', required: true, default: "一个 AI，能", desc: "恒定的名词（上行，灰色衬线）" },
      { name: 'verbs', kind: 'array', required: true, default: "有内置示例", desc: "轮换的动词（下行，衬线大字；末词换强调色）" },
      { name: 'labels', kind: 'array', required: false, default: "有内置示例", desc: "胶片卡标签（与动词一一对应；多给一张 = 露在下方的\"下一张\"）" },
      { name: 'srcs', kind: 'array', required: false, default: "", desc: "胶片卡真图（与 labels 同序；不传 = 灰调占位）" },
      { name: 'accent', kind: 'string', required: false, default: "#0066cc", desc: "末词颜色（唯一强调色）" },
    ],
  },
  'word-slot-cycle': {
    slug: 'word-slot-cycle',
    alphaFile: 'talkcraft-cards/word-slot-cycle.tsx', // 透明改编版（全量）：根整屏底已去掉；整屏构图重排为浮动面板，叠加渲染时用此文件
    name: "词槽轮换",
    oneliner: "句干\"一个 AI，帮你\"左端锚死不动，句尾深色胶囊每 0.7s 向上翻一格换一个短语（前 8 帧换位 power2.inOut + 运动模糊、后 13 帧静置读词），胶囊宽度随词长帧内插值伸缩，胶囊外上下露两行 13% 的幽灵项暗示\"还有一串\"；换完 4 个词胶囊 0.23s 上飞逃走，结论\"搞定所有事\"从下 90px 带 back.out(1.4) 过冲落进同一位置——全卡唯一一次过冲留给结论，之后静置 ≥1.5s 再与句干同收",
    category: "字幕花字",
    priority: "P0",
    meta: { width: 960, height: 540, fps: 30, durationInFrames: 206, durationSec: 6.9 },
    semanticWords: ["转折", "列举"],
    inputType: ["文"],
    propsSchema: [
      { name: 'stem', kind: 'string', required: true, default: "一个 AI，帮你", desc: "句干（钉死不动）" },
      { name: 'words', kind: 'array', required: true, default: "有内置示例", desc: "轮换词表（4~6 个；末词后收束）" },
      { name: 'final', kind: 'string', required: true, default: "搞定所有事", desc: "结论（落进胶囊原位，强调色）" },
      { name: 'accent', kind: 'string', required: false, default: "#0066cc", desc: "结论颜色（唯一强调色）" },
    ],
  },
}

/** 取一张卡的注册信息；不在白名单抛中文错。 */
export function getTalkcraftComponent(componentId) {
  const spec = TALKCRAFT_COMPONENTS[componentId]
  if (!spec) throw new Error(`talkcraft 卡不受支持: ${String(componentId)}（29 张真 props 卡之外不可点名）`)
  return spec
}

/**
 * 把一条 libraryRef 翻译成人话摘要（面板展示 / 日志用，不调模型）。
 * @param libraryRef - { lib: 'talkcraft', componentId, params }
 */
export function describeTalkcraftReference(libraryRef) {
  const ref = libraryRef ?? {}
  if (ref.lib !== 'talkcraft') throw new Error(`不是 talkcraft 引用: ${String(ref.lib)}`)
  const spec = getTalkcraftComponent(ref.componentId)
  const filled = Object.keys(ref.params ?? {}).length
  return `${spec.name}（${spec.slug}，${spec.meta.durationSec}s，语义：${spec.semanticWords.join('/') || '无'}，已填 ${filled} 个参数）`
}
