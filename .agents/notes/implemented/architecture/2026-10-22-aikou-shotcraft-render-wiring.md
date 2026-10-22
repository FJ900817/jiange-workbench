# aikou/shotcraft 生产渲染接线

日期：2026-10-22。分支：p2-more-components。

部分延续 [talkcraft 透明分发接线](./2026-10-22-talkcraft-render-wiring.md)
（同一 runRender 渲染链的另外两库；该 note 的分发决策仍然有效，本 note 不
替代它——只记录更名与新增两条链）。

## 背景

`runRender`（video-packaging.ts）只接了 talkcraft：AI 能点名 aikou/shotcraft
组件（prompt + lint 俱全），但正式渲染链没接——点了渲染不出来。本轮补齐。

## 决策记录

### 1. talkcraft-render 更名为 library-render（而非另起一套）

- Remotion 静帧管线对 talkcraft/shotcraft 完全一致，只差入口形态
  （default+meta vs 具名 export）；aikou 虽机制不同（DOM Canvas），但共用
  同一个 Chromium。二开两套是重复。
- 仓库预发布立场（AGENTS.md）明确允许更名/重打包，外部无消费者。
- 所有引用同步更新：video-packaging-talkcraft.ts 的 rendererCliPath、
  package.json（@deepseek-ai/dsh-library-render）、README。
- 兼容：环境变量 `TALKCRAFT_CHROMIUM_PATH` 仍被接受（新规范为
  `LIBRARY_RENDER_CHROMIUM_PATH`）；已冻结的旧 Agent Note 不改。
- M1 同步包（bd121ab3，含旧路径）在本轮提交之前发出，不受影响。

### 2. shotcraft 不走"小卡片+x/y"路线，走整幅画布

- shotcraft 卡是整幅构图（标题/数据/界面登场），非贴纸；且 timeline 组件的
  x/y 是占位框（来自 proposal.position），与卡片视觉位置无关。
- 因此 shotcraft 与 aikou 一致：渲染整幅画布（项目宽高），FFmpeg 叠加定位
  (0,0)。实现方式：runRender 里为这两类组件重写 x/y=0（不改原文档，
  仅渲染用副本 renderDocument）。
- talkcraft 保持原样（960x540 小卡按组件 x/y 定位）。

### 3. shotcraft 渲染尺寸 = 项目画布尺寸（而非固定 1920x1080）

- 卡片基于 AbsoluteFill 相对布局，可适应任意画布；固定 1920x1080 会在竖屏
  等项目上错位。代价：绝对字号不随画布缩放（设计稿按 1920x1080）。
- 帧号上界不由 Host 静态钳制：durationExport 在打包时求值，CLI 按卡片真实
  总帧数钳制（render-card.mjs 已有逻辑）。

### 4. 不新增客户端分发模块

- talkcraft-dispatch.js 存在的理由是 mode/theme 逻辑（编辑器预览也需要）。
  aikou/shotcraft 无模式无主题，Host 触发模块直接读注册表即可；分发即
  runRender 里的 lib switch。保持简单。

### 5. 注册表生成而非手写

- shotcraft-components.js 由扫描 31 个卡片文件生成：主 export =
  componentId 后段的 PascalCase；2 个特例硬编码（type-entrance-moves →
  LetterDropPhysics，typewriter-moves → TypewriterErrorRetype）。
- duration 取各卡最长的聚合 DURATION（如 TYPE_ASSEMBLY_MOVES_DURATION=160，
  三式中最长），保证钳制安全。

## 交付

- `packages/business/library-render/`：render-card.mjs（泛化双形态）、
  render-aikou.mjs（新增）、resolve-chromium.mjs（新增，共享浏览器解析）、
  README.md；playwright-core 1.61.1 新增依赖。
- `shotcraft-cards/shotcraft-components.js`（+ .d.ts）：31 项注册表。
- Host：`src/video-packaging-aikou.ts`、`src/video-packaging-shotcraft.ts`
  （is/create/render 三件套，镜像 talkcraft 触发模块结构）；
  `src/video-packaging.ts`：三路分发 + 未知 lib 中文大声失败 +
  PNG 上传豁免推广到三库。
- 测试：aikou 6/6、shotcraft 6/6；talkcraft 8/8、video-packaging 2/2、
  shotcraft-lint 13/13 回归；tsc 干净；oxlint（staged）0 错误。
- 端到端冒烟（真实 CLI + 真实 Host 触发链）：aikou tag（1920x1080，4.8s）、
  shotcraft blur-slide（1920x1080，24.9s）、talkcraft 回归（960x540）——
  四角 alpha 全 0，有效内容非空。

## 已知缺口

1. shotcraft 卡按 1920x1080 设计；在非 16:9 项目上相对布局自适应，
   绝对字号不缩放（v1 可接受）。
2. fadeUp 动画在整幅画布叠加上仍产生 14px 位移（0.35s），视觉上是轻微
   入场上浮，可接受，未特殊处理。
3. 预览层无 aikou/shotcraft 真实预览（沿用 talkcraft 的文字框占位策略）。
4. library-render 需 pnpm install；Chromium 首次渲染自动下载（约 150MB）。
5. runRender 内 switch 的 default 分支（未知 lib）仅代码审查覆盖，
   未单测（私有方法内联）。

## 红线

零付费模型调用；未碰 127.0.0.1:3080 与 ~/.dsh；未做 Desktop 部署；
~/workspace/video-talkcraft/、~/workspace/video-shotcraft/、
~/workspace/huashu-motion/、~/workspace/aizmt/ 原文件零修改。
