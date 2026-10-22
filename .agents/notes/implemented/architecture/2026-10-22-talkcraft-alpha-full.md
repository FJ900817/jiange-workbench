# Agent Note: talkcraft 透明化全量（25 张卡）

Status: implemented

Extends: `.agents/notes/implemented/architecture/2026-10-22-talkcraft-alpha-pilot.md`（试点 4 张的方法与结论）
——本任务完成剩下 25 张，29 张 talkcraft 真 props 卡全部有透明改编版。

## 分工

用户拍板"全改"后，3 个并行施工员分卡：
- A（8 张常规卡）：bed-echo-blur、chip-grid-single-select、countdown-arc-scatter、crash-zoom-punch、error-retype、flying-words、lead-word-zoom-assemble、reticle-lock-on
- B（8 张混合卡）：doc-park-left-pill-deal、grid-to-hero、line-carry-transition、rack-focus-pair、scanline-annotate、source-converge、split-text-stagger、stack-fan-out
- C（9 张整屏构图卡）：gallery-wall-dolly、host-card-glass-board、parallel-items-with-host、split-60-40-story、split-compare-slider、still-layout-relay、timeline-photo-strip、word-relay-filmstrip、word-slot-cycle

## 改编方法（与试点一致）

1. 只读来源：`video-talkcraft/template/cards/<slug>.tsx`（原库零修改）。
2. 复制到 `packages/client/ui-conversation/src/client/skeleton/video-packaging/talkcraft-cards/<slug>.tsx`，
   只去掉根 `AbsoluteFill` 的整屏不透明底（→ `background: "transparent"`），
   卡片本体（动效时序/CONFIG/props 接口）逐字保留；文件头按试点格式注改编来源与改动。
3. 注册表 `talkcraft-components.js`：25 张全部加 `alphaFile: 'talkcraft-cards/<slug>.tsx'`（29/29 全覆盖）。
4. 豁免：`.oxlintrc.json` / `.oxlintrc.staged.json` / tsconfig 已在试点时加 `**/talkcraft-cards/**`，无需再动。

## 整屏构图卡的重排（施工员 C，9 张统一语言：「浮动面板」）

整屏场景卡去底会悬空。方案：把 960×540 原场景（含原底色、全部动效数学/CONFIG/props 逐字保留）
整体等比缩进一张圆角 28px + 轻阴影（`0 4px 12px`，初版 `0 24px 80px` 扩散到四角已收紧）的悬浮面板，
居中浮在透明画幅上。8 张用 880×495 面板（scale 0.91667）；
word-slot-cycle 内容只有居中一行，单独收紧为 800×340 面板（scale 0.83333）。
diff 举证：差异仅文件头、根底→透明、面板包裹层三处。

## 深色字处理（10 张，同文件 `theme?: "light" | "dark"` 可选 props，默认 light=原画面）

- A 组 4 张：chip-grid-single-select、countdown-arc-scatter、error-retype、lead-word-zoom-assemble
- B 组 6 张：doc-park-left-pill-deal、line-carry-transition、scanline-annotate、source-converge、split-text-stagger、stack-fan-out
- 实现：`CSS_DARK` 追加覆盖块 + theme 三元切换，原 CSS 逐字保留。
- C 组 9 张不需要：面板把卡片自带底色一起收进来，文字对比度与原设计一致（字只跟面板底发生关系，跟视频无关）。
- 注意：`theme` 是 alpha 文件新增的可选 props，原组件 params 接口里没有；
  渲染分发层如需深主题版，校验逻辑要容许该可选参数（lint 只校验原 componentId+params，不受影响）。

## 验证数据

- 渲染（~/workspace/talkcraft-render/，Remotion 4.0.519 + React 19.2.8，renderFrames PNG）：
  25 张四角 alpha 全 0；整帧透明像素因卡片本体大小而异（16.1%~99.6%），剩余不透明像素均为卡片本体，属设计。
- 单元测试：`talkcraft-alpha.spec.ts` 重写为 9 个（试点 4 + 全量 5），9/9 通过。
- 全量：ui-conversation 636/642 通过；6 个失败为 `assembly-surfaces.client.spec.tsx` /
  `skeleton.client.spec.tsx` 的 UI composer 测试，已在干净树上验证为预先存在，与本次改动无关。

## 遗留缺口

1. 渲染分发层在叠加模式下应优先用 `alphaFile`，并把 `theme` 支持写进分发逻辑
   （暗视频场景默认走 dark，否则深色字仍不可读）——待渲染服务实现时接。
2. parallel-items-with-host / still-layout-relay 只验了单版式（面板是纯 CSS 包裹层，其余版式自动继承，未逐一渲染）。
3. 视频 props（hostSrc/src）用占位验证，真素材填入后几何位置不变。
4. 原库 PolyForm Noncommercial 1.0.0：商业授权待用户定夺（已记备忘）。

## Red lines respected

零付费模型调用；未碰 127.0.0.1:3080 与 ~/.dsh；未做 Desktop 部署；
`~/workspace/aizmt/.../video-talkcraft/` 原文件零修改（只读）。
