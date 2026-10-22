# Agent Note · P1 video-talkcraft 接入（2026-10-22）

施工员：P1 talkcraft 子任务。分支 `p2-more-components` 上工作，未 commit，未碰 PROGRESS_LOG.md。

## 1. 透明通道实测（任务1）→ FAIL

详见 `~/workspace/p1b-verify/VERDICT.md`。一句话：**卡根节点画死整屏不透明底（`#f5f5f7`），渲出的片段零透明像素**；叠加演示截图（`p1b-verify/shots/overlay-demo-frame.png`）显示卡以实心矩形盖住底视频。次要坑：本机 libvpx-vp9 对 yuva420p 静默降级、Remotion CLI 的 prores 写死 `-profile:v 3`（YUV-only）——alpha 编码要走 renderFrames + 手动 ffmpeg 拼装才行，但前提是先有透明像素。

结论：**路线 A（整段渲染 + 透明叠加）当前形态阻塞**。缺口：① 29 张卡逐卡背景剥离/透明化改造（动源码）；② alpha 编码链路需隔离渲染服务手工拼装。

## 2. 29 张真 props 卡接入（任务2）→ 完成

29 张 = 库 `references/cards-index.json` 里 `hardcoded=false` 的全部（官方定义，与 DESIGN 的"29 张"一致；79 张 ◦ 卡排除）。

新增文件（`packages/client/ui-conversation/src/client/skeleton/video-packaging/`）：

- `talkcraft-components.js` / `.d.ts`（530 行）：`TALKCRAFT_COMPONENT_IDS`（29 slug 白名单）+ `TALKCRAFT_COMPONENTS` 注册表。每张卡含 propsSchema（参数名/kind/是否必填/默认值/说明，说明取自 tsx Props 的 JSDoc 中文注释）、meta（960×540/30fps/总帧数/秒数）、semanticWords（26 词表子集）、inputType。另有 `getTalkcraftComponent()` 与 `describeTalkcraftReference()`（人话摘要，供面板/日志）。Self-contained ESM 无 import，与 aikou-*.js 同约定。
- `talkcraft-lint.js` / `.d.ts`（218 行）：`validateTalkcraftLibraryRefs(plan)`。校验链：29 白名单 → lib 必须为 talkcraft → 未知 param 拦截 → **主内容必填**拦截（每张卡 1–3 个主内容参数，不填=原样渲染库 demo 文案，视为非法）→ **样式锁死**（accent/swatches/chipBg/itemBg，AI 填写直接打回，DESIGN §1 全局规则）→ 枚举（两种 layout）→ 类型轻校验（string/number/array/object）。首个违规抛中文错。79 张 ◦ 卡点名会被拦截并提示"改文案需源码复刻，不走施工单"。
- `talkcraft-select-prompt.js` / `.d.ts`（86 行）：`TALKCRAFT_SELECT_PROMPT`。26 词表全文 + card_match.py 四步选卡逻辑（语义匹配→输入过滤→P0 优先→版式轮换）+ 29 张卡速查行（slug—中文名—语义—输入—优先级—主内容参数模板）。另有一条铁律：**素材类参数（src/srcs/hostSrc/docSrc）AI 一律不填、不许编造 URL**，留空走灰调占位。
- `tests/talkcraft-lint.spec.ts`：14 个用例（合法引用通过/◦ 卡拦截/错 lib 拦截/未知 param 拦截/缺必填拦截/空数组拦截/样式锁定拦截/非法 layout 拦截/类型错误拦截/29 白名单精确断言/注册表完整性逐卡断言/未知卡抛错/人话摘要/提示词含 26 词+29 卡）。

生成方式：`/tmp/gen_talkcraft.py` 从只读库提取（frontmatter + tsx Props 解析），人工复核了全部 29 张的字段/kind/默认值。库原文件零修改。

用法：`{ lib: 'talkcraft', componentId: '<slug>', params: { ... } }`，params 即 Remotion props 整包透传。

## 3. 验证（任务3）

- 施工单点名 → lint 校验：14/14 单元测试全绿（`npx vitest run packages/client/ui-conversation/tests/talkcraft-lint.spec.ts`）。
- 渲染 alpha 片段 → FFmpeg 叠加 → 截图：链路走完，但透明 FAIL，故截图展示的是"问题本身"（实心卡盖视频），产物在 `~/workspace/p1b-verify/`（webm/png/mp4 + ffprobe 汇总）。
- 真机渲染：Remotion 4.0.519 + React 19.2.8，216 帧 960×540 卡渲染成功（约 40 秒，云端 headless Chrome），说明**渲染本身没问题**，问题只在透明。

## 4. 遗留缺口

1. 渲染链路阻塞（见 §1）：要么逐卡做透明化改造（动源码，超出 P1"只读引用"范围，需简哥拍板），要么 talkcraft 在施工单里暂按"整段画面"（整屏替换）而非"透明叠层"使用。
2. `validateTalkcraftLibraryRefs` 与 `TALKCRAFT_SELECT_PROMPT` 尚未接入 `video-packaging-model.ts`（等 P1 开工指令，目前是独立模块+测试）。
3. 29 张卡里需要人/图/V/截图/界/场的，params 留空走灰调占位——真素材接入是后续事。
4. 云端缺中文字体（PingFang/微软雅黑），渲染出的中文字形为回退字体——与 DESIGN §5 风险第 4 条一致，正式用之前要做字体回验。
5. 许可证：PolyForm Noncommercial 1.0.0（非商业免费，商业使用需作者事先授权）——已在 DESIGN §6 记录，接入前请简哥定夺。
