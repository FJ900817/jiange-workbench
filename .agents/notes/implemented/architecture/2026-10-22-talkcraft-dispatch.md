# talkcraft 渲染分发层收尾（P1 最后一公里）

## 背景

29 张 talkcraft 卡已有透明改编版（`talkcraft-cards/`，注册表 29/29 `alphaFile`
标记，10 张深色字卡有 `theme?: "light" | "dark"`），但没有任何生产代码读取
`alphaFile`——叠加渲染时分发层不知道该用透明版。`talkcraft-alpha-full.md`
遗留缺口①。

## 改了什么

新增 `packages/client/ui-conversation/src/client/skeleton/video-packaging/talkcraft-dispatch.js`
（+ 同名 `.d.ts`），`resolveTalkcraftRenderTarget(libraryRef, context)`：

- `context.mode`：`'overlay'`（默认）→ `entry.alphaFile`；`'fullscreen'` →
  `template/cards/<id>.tsx`（原库只读路径，不复制进仓库）。
- `theme`：`params.theme` 显式传入优先；否则 `context.darkScene === true` 且卡在
  `TALKCRAFT_THEMED_IDS`（10 张，与注册表注释及 `talkcraft-alpha.spec.ts`
  的 THEMED 一致）时默认 `'dark'` 并注入 `props.theme`；无 theme 的卡保持原样。
- `componentId` 非法或叠加模式缺 `alphaFile` 时抛中文错（配置错误大声失败）。

## 有意不做的

- 不改 `talkcraft-components.js` 注册表：theme 名单只在分发模块内冻结，
  避免动大文件；`alphaFile` 字段已被 alpha 系列测试覆盖。
- 不内联进 `embedded-editor.ts`：分发是渲染服务侧决策，不在浏览器 bundle
  路径上；且分发模块 import 注册表，内联会破坏"无 import"约定。
- 不碰 `video-packaging-render.ts` 的 FFmpeg 参数构造：分发只决定"渲哪个
  文件 + 什么 props"，文件解析仍走既有 Host 资产链路。

## 测试

`tests/talkcraft-dispatch.spec.ts` 10/10：叠加默认/显式 alphaFile、整屏原库路径、
暗场景 themed→dark、暗场景无 theme 卡原样、亮场景不注入、显式 theme 优先、
params 透传、未知 id 中文错、THEMED 名单 10 张。相关 4 文件 34/34 回归通过。

## 后续缺口

分发模块已就绪，但调用方（隔离 Remotion 渲染服务的触发点）尚未接入——
`resolveTalkcraftRenderTarget` 目前只被测试调用。接入时注意 `darkScene` 的
判定来源（源视频亮度/用户显式选择，待定）。
