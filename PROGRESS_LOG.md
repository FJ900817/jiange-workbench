# P0 V3-03R 进度日志（分支 p0-v3-03r）

> 人话版给简哥，技术细节沉这里。验收门禁按 V3.0 十一级如实标注。

## 阶段 0：基线确认（2026-10-21）

- **目标**：确认云端基线内容，定位 V3-03。
- **改动**：无（只读）。
- **验证**：
  - main @ 4c4f9a5，commit 与远端一致。
  - 基线含 business-workbench 业务层 + Studios media-studio（10-18）基础。
  - **关键发现**：基线中没有 V3-03 的 AI智能包装代码；V3-03 独立候选位于
    `candidates/Studios-V3-03-2026-10-20/source/`（只读，未修改）。
- **结果**：基线可用；V3-03R 需先移植 V3-03 基础。

## 阶段 1：移植 V3-03 基础（2026-10-21/22）

- **目标**：把 V3-03 已验收的 Video Packaging 基础（Host 域 + Client 面板）并入主树，不重做 UI。
- **改动**（分支 p0-v3-03r）：
  - Host 新增：`src/video-packaging.ts`（832 行，工程/素材/渲染域）、
    `src/video-packaging-render.ts`、`tests/video-packaging.spec.ts`。
  - Host 修改（均为纯新增，0 行删除）：`src/types.ts`（VideoPackagingAiModel/
    VideoPackagingAsset/Project/RenderTask 类型）、`src/index.ts`、
    `tests/helpers.ts`、`tests/service.spec.ts`。
  - Client 新增：`skeleton/VideoPackagingEditor.tsx`、「AI 智能包装」面板
    `skeleton/video-packaging/`（editor.html/css/js、packaging-plan.js、
    模型主题、素材检索）、`StudiosSelect.tsx`、`StudiosWorkspaceHome.tsx`、
    `tests/video-packaging-plan.spec.ts`、`tests/studios-select.client.spec.tsx`。
  - Client 修改（V3-03 专属变更）：`apply.ts`、`contract/slots.ts`、
    `ConversationRoot.tsx`、`StudiosSurface.tsx(.css)`、`MediaCreationStudio.tsx(.css)`、
    4 个 client 测试文件。
- **验证**：`pnpm install` + `pnpm run build`（进行中，见下）。
- **结果**：待构建确认。

## 阶段 2：V3-03R 受限模型入口（2026-10-22 进行中）

- **目标**（18.5 A/B/C）：
  1. 新增 Host 受限模型执行入口：输入=授权视频信息+SRT/VTT+创作要求+模式+
     组件+画布+已批准素材摘要；输出=结构化 Packaging Plan Schema 建议；
     模型只出建议，不写工程、不渲染、不批素材。
  2. 模型状态四级：注册 / 已配置 / 路由可调用 / 不可调用原因（升级 V3-03 的
     `VideoPackagingAiModel`，当前全为不可调用）。
  3. 认证状态核实（不读密钥明文）；重试/费用边界举证（跨 Gateway/SDK/网络层
     maxRetries）；证不出则 MODEL READY=NO；调用默认关闭。
- **改动**（分支 p0-v3-03r）：
  - 新增 `src/video-packaging-model.ts`：四级分级 `gradeVideoPackagingModel()`、
    重试举证 `proveVideoPackagingRetryBounds()`、受限入口 `requestVideoPackagingAiPlan()`
    （默认拒绝，零请求）、输入边界校验、系统提示词（建议专用）。
  - `src/types.ts`：`VideoPackagingAiModel` 升级四级；新增
    `RunVideoPackagingPlanRequest`/`VideoPackagingAiPlanSuggestion`/
    `VideoPackagingRetryEvidence`。
  - `src/errors.ts`：新增 `VIDEO_PACKAGING_AI_DISABLED` /
    `VIDEO_PACKAGING_AI_INPUT_TOO_LARGE`。
  - `src/index.ts`：`listVideoPackagingAiModels` 改用四级分级；新增 Remote
    `requestVideoPackagingAiPlan`（拒绝式入口）、`describeVideoPackagingRetryBounds`。
  - Client `slots.ts` bridge 补 `runPlan`（修复 V3-03 悬空引用）；
    `apply.ts` 实现 `runPlan`（调 Host Remote，透传拒绝错误）；
    `ui-conversation/package.json` 补 react-dom 类型（dev）。
  - 新增测试 `tests/video-packaging-model.spec.ts`（9 项）。
- **验证**：
  - Host tsc：通过；Host tsdown 构建：通过（218 包，Typert Remote 类型已重生成）。
  - Client tsc：通过；Client tsdown 构建：通过（145 包）。
  - V3-03R 单元测试：9/9 通过（分级/重试举证/输入边界/默认关闭/零请求）。
  - V3-03R 集成测试：1/1 通过（隔离 Harness 走真实 Remote：list 模型/
    重试举证 unknown 诚实返回/调用拒绝 VIDEO_PACKAGING_AI_DISABLED）。
  - V3-03 回归测试：Host（video-packaging.spec.ts + service.spec.ts）9/9；
    Client（video-packaging-plan.spec.ts）2/2。
  - Agent Note 三件套已写（.agents/notes/implemented/feature/2026-10-22-…）。
- **红线**：零真实模型请求（Provider Request=0）；MODEL REAL=NOT RUN；
  未碰 127.0.0.1:3080 与 ~/.dsh；未做 Desktop 部署；candidates/ 未修改。
- **浏览器验证**：云端无 Chromium，不可执行 → BROWSER 门禁如实标注 NOT RUN。
  Host Remote 级验证已通过隔离 Harness 完成（见集成测试）。

## 门禁状态（诚实版）

| 门禁 | 状态 | 说明 |
|---|---|---|
| SOURCE/CODE | 进行中 | V3-03 移植完成；V3-03R 入口待实现 |
| HOST REMOTE | 待验证 | 隔离 Host 验证待跑 |
| MODEL CONFIG | 待验证 | 注册表发现待在隔离 Host 复核 |
| MODEL INVOCATION READY | 默认为 NO | 需举证重试边界后才可能改 |
| BROWSER INTERACTION | 待验证 | 需隔离 Chromium 走完整流程 |
| TIMELINE/PERSISTENCE/RENDER | 待验证 | V3-03 已 PASS，本分支需回归 |
| MODEL REAL | NOT RUN | 本轮必须保持 |
| DESKTOP | NOT RUN | 本轮必须保持 |

## 2026-10-22 P1 组件库接入（分支 p1-components，已推送 d5a52714）

- 施工单 schema 新增 libraryRef{lib, componentId, params, state?}；style 锁死
  neutral-editorial（AI 只许换文字/时间/位置）
- 接入 AI口播包装库 8 组件（tag/qa/stat/months/numlist/strips/counter/tiles，
  白名单；库本身只读未改动）
- 导演手册决策表注入提示词；aikou-lint 校验施工单引用
- 渲染双轨：预览用 HTML，Host PNG 导出用 Canvas 2D（SVG foreignObject 在
  Chromium 下污染画布，已改掉）
- 测试 23/23；云端真机 19/19（隔离 Host + headless Chromium，成片抽帧确认
  tag 烤进画面）
- 红线：零付费模型调用（总闸仍断开）；未碰 3080/~/.dsh；未做 Desktop 部署
- Agent Note: .agents/notes/implemented/architecture/2026-10-22-p1-components-libraryref.md
- 待简哥拍板：是否做一次真实 AI 点名测试（需另行授权调模型）

## 2026-10-22 P1/P2 组件库排接（分支 p2-more-components）

- P1 talkcraft：29 张真 props 卡注册表 + lint 白名单 + 26 词表选卡提示词；
  库只读未改动；单元测试 14/14
- 透明通道实测结论：**FAIL** —— 卡根节点画死整屏不透明底，整段渲染 + 透明
  叠加路线当前形态走不通（证据 ~/workspace/p1b-verify/VERDICT.md）；渲染链路
  记为阻塞，待简哥拍板是否做逐卡透明化改造
- P2 shotcraft：typography/ui-entrance/data 三类 31 张卡参数化改造 + 语义索引
  + lint 白名单；单元测试 11/11；库原文件未改动
- shotcraft 渲染实测：中文 PASS（无走样）；ProRes 4444 alpha PASS；
  WebM VP9 alpha FAIL —— alpha 交付走 ProRes 4444
- 核心门禁：LIBRARY_ALLOWLIST 开放 talkcraft + shotcraft（huashu 仍为设计资产
  未开放）；内嵌 packagingPlanJs 同步再生；38/38 测试全绿
- 红线：零付费模型调用；未碰 127.0.0.1:3080 与 ~/.dsh；未做 Desktop 部署
- Agent Notes: notes/2026-10-22-p1-talkcraft.md, notes/2026-10-22-p2-shotcraft.md
- 待简哥拍板：① talkcraft 透明化改造做不做 ② 是否做一次真实 AI 点名测试
  （需另行授权调模型）

## 2026-10-22 P2 收尾接线：三库选卡提示词 + lint 进生产校验链路（分支 p2-more-components）

- video-packaging-model.ts：VIDEO_PACKAGING_SUGGESTION_SYSTEM_PROMPT 追加
  TALKCRAFT_SELECT_PROMPT + SHOTCRAFT_SELECT_PROMPT（三库同一提示词注入架构）
- packaging-plan.js：validatePackagingPlan 接入三个 lint 校验器（按 lib 过滤
  后调用）；非法 componentId 抛中文错；无 libraryRef 提案跳过
- 浏览器 bundle：embedded-editor.ts 新增 aikouLintJs/talkcraftLintJs/
  shotcraftLintJs 内联串（转义 round-trip 已验证）；VideoPackagingEditor.tsx
  的 buildDocument 用 IIFE 包裹 lint 模块（解决三文件 fail/
  validateLibraryRef/KNOWN_PARAMS 重名冲突），packagingPlanJs 同步再生
- 测试：新增 video-packaging-library-wiring.spec.ts（6 项）；旧 plan spec
  的 componentId:'x' 占位改为每库真实合法引用 + 新增非法 ID 拒绝测试；
  model spec +1（三个提示词标记均注入）
- 全绿：client 5 文件 45/45，business 13/13，tsc 干净，oxlint staged 0 警告
- 红线：零付费模型调用；未碰 127.0.0.1:3080 与 ~/.dsh；未做 Desktop 部署；
  三套库原文件未改动（只读）
- Agent Note: .agents/notes/implemented/architecture/2026-10-22-p2-library-wiring.md
