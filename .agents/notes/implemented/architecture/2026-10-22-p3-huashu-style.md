# huashu-motion 风格指南接入（P3）

日期：2026-10-22（云端）
分支：p2-more-components（从 p2 全改分支继续）
定位：**借设计不借引擎**——huashu 是"agent 拍整片"工作流，不搬 runtime/cli/studio；
取其 20 种运动语言的设计文档 + talking-head / kinetic-type 模板，变成 AI 填
施工单 style/animation 字段的依据。前三套库解决"选哪个组件"，这一套解决"风格怎么定"。

## 交付

1. `packages/client/ui-conversation/src/client/skeleton/video-packaging/huashu-style.js`（新）
   - HUASHU_ANIMATIONS：8 个合法 animation 取值
     fadeUp（默认，名牌式克制）/ fade / none / slam（金句砸入）/
     countUp（数字滚动）/ wordSwap（句中换词）/ wipe（章节切换）/ spring（清单/卡片弹性）
   - HUASHU_LANGUAGES：20 条"一句话说人话"提炼（淡入/擦除/下沉/闪回/缩放/数字/呼吸/碎片/
     弹射/淡出/渐显/滑入/时间/流动/粒子/线条/分割/揭示/翻转/脉冲），每条标注适合场景
   - HUASHU_CARD_ELEMENTS：talking-head 5 种卡片元素
     （字幕/标题/重点高亮/序号徽标/标签）+ kinetic-type 关键参数（重拍/节奏/缓动/字重）
   - HUASHU_STYLE_PRESETS：2 个风格预设
     - huashu-talking-head（白 #ffffff / 金 #e6b94e / 深 #1f2728，fadeUp 200ms 4px）
     - huashu-kinetic（同色板，slam 180ms / spring 400ms）
   - HUASHU_STYLE_PROMPT：注入系统提示词的风格指南段（含防 AI 味铁律）
   - HUASHU_STYLE_PRESET_IDS 导出供校验与测试
2. `huashu-style-lint.js`（新）：`validateHuashuStyle(style, componentType, stylePreset?)`
   - animation 只能是 8 值之一；预设存在时四值必须一字不差（白名单锁）
3. `huashu-style.d.ts`（新）：类型声明
4. 接线（照抄已有三套方式）：
   - `packaging-plan.js`：import 风格常量；STYLE_PRESETS 合并两预设；
     animation 校验改用 HUASHU_ANIMATIONS；validateHuashuStyle 调用
   - `packaging-plan.d.ts`：animation 联合类型扩展为 8 值
   - `video-packaging-model.ts`：HUASHU_STYLE_PROMPT 追加进
     VIDEO_PACKAGING_SUGGESTION_SYSTEM_PROMPT（第四段）
   - `embedded-editor.ts`：huashuStyleJs + huashuStyleLintJs 内联（round-trip 字节校验通过）
   - `VideoPackagingEditor.tsx`：import + bundleLint + stripModule(huashuStyleJs)
     置于 packagingPlanJs 之前（plan.js import 了风格常量，strip imports 后需它在前）
5. 测试 `packages/client/ui-conversation/tests/huashu-style.spec.ts`（9/9）：
   8 合法值全过 / 3 非法值（bounce/glitch/zoomIn）全被拒 /
   风格锁定（只许换文字/时间/位置）/ 两预设四值一字不差 /
   系统提示词含风格指南 / 生产校验链路拒绝非法 animation
6. `video-packaging-model.spec.ts`：注入断言扩展为"三选卡指南 + 风格指南"

## 渲染降级（editor.js 不动）
editor.js 里非 'none' 按 fade 渲染、仅 fadeUp 加 yOffset——新值可安全降级，
渲染器零改动。

## 验收数据
- 新测试 9/9；model.spec 11/11；tsc --noEmit 干净
- 全量 ui-conversation：645/651（6 失败为 assembly-surfaces/skeleton 常驻 composer
  用例，stash 后复测仍失败——pre-existing，与本改动无关）
- oxlint：本仓库 ignore `**/*.js`，.js 新文件不在 lint 范围内

## 约束遵守
- 零付费模型调用（全部 fixture + 规则测试）
- ~/workspace/huashu-motion/ 原文件零修改（只读提炼）
- 未搬 huashu 的 runtime/cli/studio 引擎
- 不做 Desktop 部署；不碰 127.0.0.1:3080 与 ~/.dsh
