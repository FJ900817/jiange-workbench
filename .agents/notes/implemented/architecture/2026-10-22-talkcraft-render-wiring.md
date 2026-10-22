# talkcraft 透明分发接线（P1 真正闭环）

## 背景

`talkcraft-dispatch.js`（`resolveTalkcraftRenderTarget`）已就绪但没有任何生产
代码调用——叠加渲染走透明版 / 整屏走原版的决策悬空。渲染管线现状：
编辑器把组件渲成 PNG 上传（`/api/overlay/:id`），Host 的 FFmpeg 链路只消费
PNG；talkcraft 卡是 Remotion TSX，浏览器跑不了，编辑器此前对它没有分支。
按既定决策（分发是渲染服务侧决策，不进浏览器 bundle），接线点在 Host。

## 改了什么

**触发模块** `packages/business/business-workbench/src/video-packaging-talkcraft.ts`
（新建）：
- `isTalkcraftComponent(component)`：`libraryRef.lib === 'talkcraft'` 判定。
- `createTalkcraftRenderJob(libraryRef, { mode, darkScene, stillSec })`：先经
  `resolveTalkcraftRenderTarget` 翻译（叠加→`alphaFile` 透明改编版；
  整屏→原库 `template/cards/` 路径），再把相对路径解析为绝对路径并验证
  存在；按卡片 `meta` 取原生宽高/fps，静帧按 `stillSec` 折算并钳制在
  `durationInFrames` 内。非法引用/缺文件抛中文错。
- `renderTalkcraftStillPng(job, outPath, { timeoutMs })`：spawn 隔离渲染器
  CLI，失败/超时抛中文错（含 stderr 尾）。

**Host 渲染链路** `video-packaging.ts`：
- `runRender` 在组 FFmpeg 参数前，对 `libraryRef.lib === 'talkcraft'` 的组件
  逐张渲染透明 PNG（静帧取组件中部，与 aikou 取帧逻辑一致），`darkScene`
  取自工程文档；overlay 解析器优先返回预渲染 PNG，其余走原逻辑。
- 渲染产物为 render-scoped 临时文件，任务结束（成功/失败）后删除。
- Schema：`textComponent.overlayAssetId` 改为可选；superRefine 中 talkcraft
  组件豁免 PNG 预上传校验；工程文档新增 `darkScene?: boolean`。
- `buildP5RenderArgs` 的 FFmpeg 参数构造未动（上一轮特意没动，保持）。

**隔离渲染器** `packages/business/talkcraft-render/`（新建 workspace 包，
private）：
- `render-card.mjs` CLI：`--card/--props/--width/--height/--fps/--frame/--out`；
  临时入口 import 卡片 default 组件 + `meta`，`@remotion/bundler` 打包后
  `renderStill` 出 PNG（RGBA）。版本锁定 `@remotion/*@4.0.519`、
  `react@19.2.8`（与验证时一致）。
- 卡片 `import "react"/"remotion"` 经 webpack alias 指向本包，避免跨包解析失败。

**面板**（`editor.html`/`editor.css`/`editor.js`，`embedded-editor.ts` 已同步再生）：
- 视频主轨区新增「深色视频场景」复选框（默认不勾选=浅色）；`project.darkScene`
  随工程保存，Host 渲染时读取。
- `syncTextOverlayAssets()` 跳过 talkcraft 组件（Host 渲染，编辑器不上传 PNG）。
- `gen-embedded-editor.mjs`（仓库根，ad-hoc）：bundle 再生脚本，转义规则已与
  原 bundle 字节级对齐（含 `assetRetrievalJs` 双引号特例）。

## 有意不做的

- 不碰 `buildP5RenderArgs` 的 FFmpeg 参数构造：PNG 叠加链路不变。
- 分发模块不进浏览器 bundle（维持既定决策）；编辑器只负责开关，不调分发。
- 整屏模式：分发支持，触发模块透传，但原库 `template/cards/` 不在仓库内，
  实际调用报中文错——整屏渲染管线未建，不假装能用。
- 预览层未动：talkcraft 组件在编辑器预览里仍按普通文字框显示位置/时长，
  最终 MP4 才出卡片效果（不伪造预览）。

## 验证

- `video-packaging-talkcraft.spec.ts` 8/8：叠加→alphaFile 绝对路径、暗场景
  themed→dark、亮场景不注入、整屏缺文件中文错、非法引用中文错、静帧钳制。
- 回归：`video-packaging.spec.ts` 2/2；`tsc --noEmit` 干净；oxlint 新增文件
  0 错误（`video-packaging.ts` 的 40 个为改动前已存在）。
- 端到端实测（2026-10-22）：`createTalkcraftRenderJob({ componentId:
  'chip-grid-single-select' }, { mode: 'overlay', darkScene: true })` →
  theme=dark、frame=60；`renderTalkcraftStillPng` 经隔离渲染器出图：
  PNG 960×540 RGBA，四角 alpha 全 0。分发→触发→渲染器→PNG 全链路打通。
- 渲染器冒烟（`packages/business/talkcraft-render` 施工员交付）：
  title-demote-to-label 第 45 帧（98.4% 透明）、chip-grid-single-select
  theme=dark 第 120 帧（98.1% 透明），四角 alpha 全 0；`--frame 9999`
  钳制到 188 并中文警告；Chromium 由 `@remotion/renderer` 自动下载复用。

## 后续缺口

1. 卡片 PNG 按原生尺寸（960×540）叠加在组件 x/y 处，AI 给的 w/h 暂未做缩放。
2. 整屏渲染管线未建（原库文件不在仓库内）。
3. 预览层无卡片真实预览（仅文字框占位）。
4. `packages/business/talkcraft-render` 需 `pnpm install` 才能用；未安装时
   Host 报中文错（不静默失败）。
