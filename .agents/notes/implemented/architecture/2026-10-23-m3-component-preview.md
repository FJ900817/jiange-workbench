# M3 面板真实预览（Host 静帧 PNG + 预览层接入）

## 背景

面板预览层对带 `libraryRef` 的组件只有文字框占位：aikou 有浏览器内联
实时渲染（`aikouMarkup`→`renderAikouComponent`），talkcraft/shotcraft 直接
走文字框。简哥是视觉设计师，审美终审靠点开看——占位框对他没用，这是
面板当前最大的体验缺口。M3 的目标：有 `libraryRef` 的组件，预览层显示
该组件的真实渲染静帧 PNG。

## 设计决策

1. **三库统一走 Host PNG，不在浏览器里各搞一套。** `aikouMarkup` 的内联
   实时渲染已删除（ deliberate product decision ）：同一 Chromium/Remotion
   引擎出的图与最终渲染所见即所得；浏览器 bundle 不再为预览背渲染器；
   三条链路收敛到一条代码路径。`renderAikouComponent` 的 import 保留
   （`renderAikouOverlayPng` 仍在第 82 行给导出链用）。
2. **预览是 best-effort，永远不抛错。** `renderComponentPreview` 内部
   try/catch 全包：引用非法、渲染失败、渲染器缺失一律返回 `null`。
   面板侧三层兜底（fetch 超时/HTTP 非 200/坏包 → 占位；60s 失败冷却；
   冷却期内直接走文字占位），面板绝不报错、不白屏。
3. **缓存分两层。** Host 侧内存 LRU（`ComponentPreviewCache`，默认 200
   张，`previewCacheKey` 对 params 做 key 排序序列化保证命中）；浏览器侧
   object-URL 缓存（200 上限，淘汰时 `revokeObjectURL`）。
4. **Remote 边界类型用 `JsonValue` 不用 `unknown`。** 第一版
   `params?: Record<string, unknown>` 被 Typert 构建插件拦下
   （`Remote boundary contains unconstrained unknown data`）；按仓库既有
   约定改用 `@deepseek-ai/dsh-session/types` 的 `JsonValue`。
5. **talkcraft 预览走叠加（overlay）透明改编版**，与生产渲染一致；
   `darkScene` 取自工程面板开关，随请求下发。

## 改了什么

**Host**（`packages/business/business-workbench/src/`）：
- `video-packaging-preview.ts`（新建）：`ComponentPreviewCache`（LRU）、
  `previewCacheKey`（稳定序列化）、`renderComponentPreview`（无缓存真渲，
  超时 120s、静帧 2s、失败→null）、`previewComponentPng`（缓存入口）、
  `clearPreviewCache`/`previewCacheSize`（测试用）。复用三条生产渲染链，
  不重造渲染器；`fullCanvas` 标记（aikou/shotcraft 真，talkcraft 假）驱动
  面板图片定位。
- `types.ts`：`PreviewVideoPackagingComponentRequest/Result`。
- `video-packaging.ts`：`VideoPackagingStore.previewComponent()`。
- `index.ts`：`@Remote('previewVideoPackagingComponent')`。

**Client**：
- `contract/slots.ts`：`videoPackaging.previewComponent` 槽位。
- `apply.ts`：bridge 接线（Host 不可用时抛中文错，由 dispatch 转 502）。
- `VideoPackagingEditor.tsx`：`/api/preview` POST 分发（400/404/502 语义）；
  iframe fetch shim 加 `signal` 支持（AbortController 15s 超时用）。
- `video-packaging/editor.js`：`componentMarkup` 拆出 `textComponentMarkup`；
  library 组件走持久化预览节点（`syncLibraryPreviews`，仿 `previewAssetNodes`
  模式）：占位先上（300ms 防抖）、图到换图、最大 2 并发、失败静默回退文字
  占位、60s 冷却。aikou/shotcraft 整舞台定位，talkcraft 按 item 盒子
  `object-fit:contain`。
- `video-packaging/editor.css`：`.library-preview*` 样式。
- `video-packaging/embedded-editor.ts`：`node gen-embedded-editor.mjs` 再生
  （内联新鲜度测试通过）。

**测试**（`packages/business/business-workbench/tests/video-packaging-preview.spec.ts`，
新建，9/9 通过）：
- 三库真实冒烟：aikou（14s，1280×720）、talkcraft（46s，卡片尺寸）、
  shotcraft（49s，1280×720）；PNG 非空、四角 alpha=0（自带最小 PNG 解码
  器，node:zlib，不引入 sharp 新依赖）。
- 坏引用/非法尺寸 → null；缓存命中（注入计数渲染器，2 次请求 1 次渲染）；
  key 与 params 键序无关；LRU 淘汰最旧；null 结果不进缓存。

## 验证

- 新 spec 9/9；`video-packaging.spec` 2/2；`embedded-editor-inline.spec` 2/2。
- 相关套件 52 项中 51 通过；唯一失败
  `video-packaging-model.spec.ts > lists models…` 在 7 文件并跑时复现、
  单独跑通过，**stash 后在干净树上同样复现——是既有测试隔离问题，
  与本变更无关**（已记录，未修）。
- `tsc -b tsconfig.host.json` 干净；客户端 `tsc -b tsconfig.client.json`
  在改动文件上干净（其余为既有 44 个旧错，未动）。
- pre-commit 钩子（lint/whitespace/vendor guard）随提交跑。

## 遗留与缺口

- 预览图是静帧（2s 处），不跟随时间轴播放头变化；aikou 组件的时间相关
  参数（t0/t1）在预览里固定。这是设计取舍，不是 bug。
- talkcraft/shotcraft 预览节点暂无缩放手柄（与 aikou 之前一致）；排布仍
  用 inspector 改参数。
- 首次渲染慢（Chromium/Remotion 冷启动 15–50s）：客户端 15s 超时后先回退
  文字占位，Host 侧 120s 内完成后进缓存，下次点开即命中。
- `video-packaging-model.spec.ts` 的并跑隔离失败是既有问题，待修。

## 红线

零付费模型调用；未碰 127.0.0.1:3080 与 ~/.dsh；未做 Desktop 部署；
四个原库（video-talkcraft/video-shotcraft/huashu-motion/aizmt）零修改。
