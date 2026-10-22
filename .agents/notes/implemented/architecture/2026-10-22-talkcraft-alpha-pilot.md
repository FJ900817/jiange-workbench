# Agent Note: talkcraft 透明化试点（4 张卡）

Status: implemented

Extends: `notes/2026-10-22-p1-talkcraft.md` §1（透明通道 FAIL 缺口①"逐卡背景剥离"）
——本试点验证了缺口① 的解法可行，原 P1 缺口对剩下 25 张卡仍然有效。

## Problem

P1 实测（~/workspace/p1b-verify/VERDICT.md）结论：talkcraft 29 张真 props 卡根节点
画死整屏不透明底（`#ffffff` / `#f5f5f7`），透明叠加路线按当前形态走不通。
用户拍板走 A 路线（抠白底做透明叠加），但"做一点"——先试点 3–5 张，不全改。

## Decision

1. **试点选 4 张**（标题/数据/清单/信息卡各一，均为最可能当叠加用的）：
   - `title-demote-to-label`（标题类：标题降格成左上标签）
   - `unit-grid-proportion`（数据类：点阵比例图）
   - `filmstrip-conveyor`（清单类：传送带列举）
   - `info-card-assemble`（信息卡：VERDICT 基准卡，对比方便）
2. **改编不改原**：复制到 `talkcraft-cards/`（与 `shotcraft-cards/` 同例），
   只去掉根 `AbsoluteFill` 的整屏底（→ `background: "transparent"`），
   卡片本体（动效时序/CONFIG/props 接口）逐字保留。原文件零修改。
3. **注册表标记**：`talkcraft-components.js` 给 4 张加 `alphaFile` 字段
   （`talkcraft-cards/<slug>.tsx`），其余 25 张无标记；lint 参数校验不受影响
   （componentId 与 params 接口未变）。
4. **豁免**：`.oxlintrc.json` / `.oxlintrc.staged.json` / tsconfig exclude
   照抄 `shotcraft-cards` 加 `**/talkcraft-cards/**`。

## Verification

- 渲染（~/workspace/talkcraft-render/，Remotion 4.0.519 + React 19.2.8，
  renderFrames PNG）：4 张四角 alpha=0（背景 100% 去掉）；
  整帧透明像素 Tdl 84.4% / Ugp 83.8% / Fsc 71.3% / Ica 58.0%
  （剩余不透明像素为卡片本体，属设计；>95% 对大卡片不现实）。
- FFmpeg 叠加演示：4 张 PNG 叠到测试视频上，截图
  `~/workspace/p1b-verify/pilot/overlay-Pilot{Tdl,Ugp,Fsc,Ica}.png`——
  白底消失，卡片如贴纸浮在视频上，中文无走样。
- 单元测试：新增 `talkcraft-alpha.spec.ts` 5/5；
  相关 4 文件 39/39 全过（talkcraft-lint 14 + alpha 5 + aikou-lint 9 + shotcraft-lint 11）。

## Remaining gaps

- 剩下 25 张卡未改：每张都是同样的"去根底"手术，单张约 10 分钟量级；
  但改前需逐张确认卡片本体在透明底上是否成立（深色字在暗视频上可读性）。
- talkcraft-lint 校验的是 params 合法性，不区分透明版/原版——渲染分发层
  在叠加模式下应优先用 `alphaFile`（待渲染服务实现时接）。
- 原库 PolyForm Noncommercial 1.0.0：商业授权待用户定夺（已记备忘）。

## Red lines respected

零付费模型调用；未碰 127.0.0.1:3080 与 ~/.dsh；未做 Desktop 部署；
`~/workspace/aizmt/.../video-talkcraft/` 原文件零修改（只读）。
