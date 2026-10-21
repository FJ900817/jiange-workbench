# dsh-business-workbench

[English](README.md) | 中文

## 媒体创作

Image Studio 与 Video Studio 的创作记录使用独立的 `business_workbench_media_studio` Domain schema v1，不改写现有 `business_workbench` 小红书 schema。固定 Host Remote 只开放已声明的五种模型及有界会话/任务操作。当前适配器仅为 Mock：通过 Host storage service 持久化会话、轮次、任务、作品和版本记录，报告 Provider 请求数为零，并使用不含媒体字节的 opaque `mock-result://` 引用。隔离 P2 JSON 文件保持原样；正式 Host 不扫描或导入这些文件。

Business Layer V0.1 的 Host-only 持久化权威。`ctx.businessWorkbench` 负责单 Job 与四参与 Job Batch、执行租约、中断恢复、冻结执行包、精确 Skill 快照、受限单轮 Agent 执行、不可变 Attempt 历史、文本 Artifact、权威 XHS 输出 bundle 与确定性 XHS L1 Validation。它通过范围受限的 Host Remote 向 Client 投影只读本地 AIHOT 与小红书数据；本包不增加模型可见工具、UI、Workflow、语义 Validation 或 Obsidian writer。

## 配置

```yaml
- name: '@deepseek-ai/dsh-business-workbench'
  config:
    dshHome: /optional/isolated/dsh-home
    readRoots:
      xhs: /existing/xhs-project-root
      sharedProductTruth: /optional/existing/product-truth-root
    xhsProductionSource:
      vaultRoot: /existing/formal-vault-root
    leaseDurationMs: 30000
    commentAnalysis:
      provider: deepseek-official
      model: deepseek-v4-flash
    restrictedAgent:
      provider: deepseek-official
      model: deepseek-chat
      reasoningEffort: low
      maxTokens: 1024
      timeoutMs: 20000
```

`leaseDurationMs` 是必填部署策略。`dshHome` 可选；省略时依次使用 `DSH_HOME` 和 `~/.dsh`。`readRoots` 整体可选；一旦提供，`xhs` 必填，`sharedProductTruth` 仍可选。resolver 将 `xhs/**` 与 `shared/product-truth/**` 映射到这些物理 root，不向调用方暴露绝对路径。未挂载读取策略时，创建执行包和读取输入以 `READ_ROOT_UNAVAILABLE` 失败；请求未挂载的 logical root 则以 `READ_DENIED` 失败。

`restrictedAgent` 是可选的部署配置。省略后 Phase 1 与 Phase 2 API 仍然可用，但 Agent 执行以 `AGENT_RUNTIME_UNAVAILABLE` 失败。其 timeout 必须短于执行租约。业务状态使用 `business_workbench` storage domain；Artifact 字节位于 `<dshHome>/business-workbench/v0.1/`。

`commentAnalysis` 是获批的无 Session 小红书评论分析 Remote 的独立路由。它必须配置为 `deepseek-official` / `deepseek-v4-flash`；路由缺失、路由值不同或注册表中不可用时，分别返回不含内容的 `COMMENT_ANALYSIS_ROUTE_NOT_CONFIGURED`、`COMMENT_ANALYSIS_ROUTE_INVALID` 或 `COMMENT_ANALYSIS_ROUTE_UNAVAILABLE`。它不会读取或回退到 Host 默认选择。Web Profile 会显式配置此路由；其他部署需在自己的 Workbench 行中加入相同配置。分析失败时只返回并记录已配置的 Provider/Model、错误码、失败阶段、是否调用 `llm.stream()`、三态 Provider 请求状态、是否观察到响应、HTTP 状态、耗时、stream 事件数和响应字符数。现有分析区域显示这些字段；评论正文和原始模型输出不会进入诊断信息。

`xhsProductionSource` 是可选配置，并要求 `readRoots.xhs` 精确指向 `vaultRoot` 下的正式 XHS Project。该配置启用仅 Host 可用的 `xhs-production-source-v1` resolver。Resolver 读取指定正式入口与基线，根据账号/月/周/note 推导唯一任务卡路径，校验已确认的系统二真源链路，按 `note_type` 路由唯一的版本化 V3.0 规则与黄金样稿，并生成唯一账号 S3 snapshot。在系统二到机器投影边界，系统二当前正式推荐型标识 `干货推荐型（soft_plant）` 会被确定性映射为规范机器值 `干货推荐型（recommendation）`；TaskCard compiler 与 resolver 仍拒绝旧值或推断出的机器值。它不执行目录发现、模糊匹配、归档查询或 fallback。

## 执行与恢复

Batch 创建仍可恢复。`single` 请求只生成一个参与 Job，`quad` 请求生成恰好四个相互独立的参与 Job。迁移后的 V4 Batch 保持为 `legacy-fixed4`：四个历史 Job 全部保留，但会明确列出具有持久参与证据的一或四个 Job。`createAttempt` 创建 `pending` Attempt，Job 仍为 `ready`；只有 `acquireExecutionLease` 会把两者变为 `running`。续租、释放、普通完成、提交 Artifact 和执行受限 Agent 都要求相同 owner 与当前 Job 状态。启动和显式恢复会完成已经失去执行 owner 且拥有已验证权威输出 bundle 的 XHS 执行；其他失去 owner 的执行变为 `interrupted`。恢复不会自动重试模型工作。

执行包冻结精确输入路径、hash 与大小、Workflow 版本、读取 root/file allow-list、请求的 capability/Skill 列表，以及完整的 winning Skill 定义及其 origin 与内容 hash。每个正式 XHS Workflow 都声明封闭的 Skill requirement：First Pass、Revision 和 Retry 必须恰好包含一个账号 S3 snapshot，Contract Repair 则必须不包含 Skill。缺失声明、缺失必需 snapshot，以及 Skill-free package 意外携带 snapshot，都会在模型 I/O 前失败。正式生产输入只允许来自 `xhs/` 或 `shared/product-truth/` 下的精确冻结文件；第二轮执行包还可以精确引用 Host 挂载的 `business-artifacts/` 下不可变文件。绝对路径、路径穿越、反斜杠、无关 Project、未列出文件、非普通文件、symlink 逃逸、输入漂移、Skill 漂移和未批准 Skill origin 都会在模型 I/O 前失败。

Phase 3 唯一 action 是 Project `xhs` 的 `fixture-agent-run`。Host policy 允许 `restricted-agent`、`fixture-writing` 与 `fixture-truth-check`；执行包声明只能进一步收窄该固定策略。adapter 创建一个全新 Harness Agent Session，用冻结输入与 Skill 正文替换 ambient prompt context，不发布任何 tool schema，安装 deny-all tool execution guard，以部署固定模型执行一次，然后销毁 live Session。它不暴露 Skill discovery、filesystem、shell、Workspace 或 subagent operation。

`xhs-body-prepare-v0` 具有显式 `fixture` 与 `production` route。它的 package 恰好包含 `taskCard`、由任务卡选择的 V3.0 `writingRule` 与对应 `goldenSample`；账号专属 S3 指令是一个精确 Skill 快照，不是输入文件。每个账号映射到一个合法 Host adapter id 与一个正式 `.agents/skills/S3-笔记写作-账号X/SKILL.md` 来源。该 action 不允许目录读取、工具、发现操作、subagent、动态 Skill 选择或动态模型选择。

`createXhsProductionExecutionPackage` 把不含正文内容的控制文件、真源链路、路由与 S3 来源证据随 package 持久化。`production` route 要求该 manifest，匹配其中的账号与正文类型，在模型 I/O 前重新读取全部精确来源，并且只接受 resolver 持有的 `project-agents / business-xhs-production-v1` S3 快照。入口、基线、系统二真源、任务卡、规则或样稿漂移以 `INPUT_DRIFT` 失败；S3 来源或正文漂移以 `SKILL_DRIFT` 失败。使用新来源必须创建新的 Attempt 与 snapshot。

V0.1 第二轮采用追加式记录。`createXhsReviewArtifact` 在新的 single Job revision Attempt 上记录经过 hash 校验的 `PASS`、`MODIFY` 或 `FAIL` 审核，不改变来源 Job。Review version 2 会记录精确 Output Bundle、Draft 路径与 hash，并标明结构完整来源是 First Pass、Revision 还是成功 Retry；version 1 First-Pass Review 无需迁移即可继续读取。`xhs-body-revise-v0` 只接受 `MODIFY` Review、当前被审核候选稿、原冻结生产真值与 S3 snapshot，revision number 由 lineage 确定：First Pass 与 Retry 候选稿生成 Revision 1，Revision 1 生成 Revision 2，Revision 2 再次修稿则以 `MAX_REVISION_REACHED` 拒绝。模型指令只允许处理 `required_changes`，在兼容时保留 `preserve`，并把 `quality_suggestions` 作为可选建议。每个新 Output Bundle 都指向直接被审核候选稿及其 Review，使不可变链路最终可追溯到 First Pass，同时不覆盖任何候选稿。

`xhs-body-retry-v0` 与 Revision 明确分离。它只允许对空输出或确定性的 `FORMAT_CONTRACT_FAIL` 进行一次调用方批准的 Retry，不适用于普通 Hard Contract 或内容质量问题。Retry package 不包含失败稿字节，只记录来源 Job、Attempt 与封闭的失败原因，并继续使用相同冻结任务身份、生产输入、账号 S3、输出格式与 Validator。成功且结构完整的 Retry 会成为可审核候选稿，并可产生 Revision 1；Retry 与 Revision 都不能再次进入 Retry。系统不会自动 Retry。

`xhs-body-contract-repair-v0` 与业务 Revision 明确分离。只有 hash 绑定的 Review 记录 `PASS`、候选稿符合当前 Draft Format，且对应 Validation 只包含封闭 repair 词汇可表示的确定性失败时，同一候选稿才允许进行一次 Repair。V0.1 只允许标题/正文字数、精确关键词次数或标题位置、自报字符数 metadata，以及精确话题真值集合不变时的话题顺序。评论修改、话题集合变化、产品路由、业务判断、Leo 经历与一般性优化都不是调用方可选择字段，并会 fail closed。无 Skill 的 package 只暴露 TaskCard、候选稿、PASS Review 与对应 Hard Validation；package 创建、持久化解析、公开校验、Host policy 与 Agent preflight 都执行相同的 `none` requirement。Lineage 记录两份证据 Artifact、失败项、repair number 1 和修复字段。Provider 调用前的 package verification 失败不消耗唯一一次执行额度；被中断 Attempt 保持不可变，恢复后必须创建新 Attempt。Repair 结果不能进入 Repair 2，也不能再次进入业务 Revision。

`xhs-body-length-repair-v0` 是更窄的 V0.2A 路径，只接受业务审核为 `PASS`、格式完整，且确定性失败仅为 `titleRange` 或 `bodyRange` 的候选稿。无 Skill 的 package 只暴露 TaskCard、精确候选稿、绑定的 PASS Review 与对应 Hard Validation。模型最多返回三个标题候选和三组明确的局部正文 `old_text` 到 `new_text` patch；严格 JSON 解析会拒绝完整稿、额外字段、多行 patch、来源中不存在或重复的文本，以及相互重叠的 patch。Host 从不可变来源独立应用每个方案，以 `countXhsFullCharacters` 重建字符 metadata，重新执行当前格式与 Hard Contract Validator，保护评论、话题和 Review 中每个可精确核对的 `preserve` 内容，并按 Unicode 编辑距离最小确定性选择通过方案。没有方案通过时，结果为 `LENGTH_REPAIR_UNSATISFIED`，保留 proposal evidence 但不创建候选稿。一次已启动 Agent Run 即消耗唯一 Repair 额度。机器通过后仍为 `CANDIDATE_READY`，只有独立的人类 Patch Approval 可记录 `APPROVE / PROMOTION_ELIGIBLE` 或 `REJECT / STOP`；两种决定都不会启动新 Repair 或写入 Obsidian。

已完成但没有可见文本的 Agent turn，如果由 `max-tokens` 结束且报告的 reasoning token 数大于零，则以 `REASONING_BUDGET_EXHAUSTED` 失败；其他情况仍以 `EMPTY_AGENT_OUTPUT` 失败。诊断 version `2` 会记录 provider、model、请求的 reasoning effort 与 output cap、Agent Run/Session id、规范化后的 assistant/text/reasoning/tool/final-event 数量、content field 类型、final-text bytes、可用的 finish reason 与 token usage、时长和失败阶段，但不记录 prompt 或 response 正文。同一份 JSON 诊断会追加到现有持久 Agent Run `failureReason`；schema version `5` 没有增加诊断字段。如果 Session event 词汇不携带某字段，该字段就保持缺失。空输出不会触发 retry，reasoning block 也绝不会成为正文。新鲜成功结果还会在非持久 execution metrics 中报告规范化 finish reason。

成功的 fixture action 会结算一个 `intermediate` Artifact。成功的 XHS action 会验证并暂存 `draft.md`、`draft-metadata.json` 与 `provenance.json`，发布其不可变目录，再通过一次 Job CAS 使一个输出 bundle 成为权威事实。缺文件、非法 JSON、关系不一致、hash/size/origin 不一致都会在该状态更新前失败。重试会返回唯一权威结果；同一 Attempt 的第二个成功 bundle 会被拒绝。CAS 前遗留的 staging 或 published 字节可通过只读 reconciliation 发现，但绝不会自动成为业务事实。

模型请求前，Host 将冻结正式 TaskCard 严格编译为 `xhs-task-card-contract-v2`。结果记录 compiler 与生产身份、确认状态、标题/正文范围、note type、精确关键词及要求位置、正文结构标签、产品模块、评论数量、按顺序排列的精确话题值与明确禁止项。缺少 compiler 身份、旧 note type、重复字段或话题、声明数量与实际话题不一致、缺失关键词策略以及互相冲突的 SEO 关键词声明都会 fail closed。对于生产真源，系统二任务卡与系统一 TaskCard 必须都处于已确认状态，并在创建执行包前包含顺序完全一致的十个唯一话题。只有 `SEO高亮词：无` 能显式表示精确关键词要求为空；字段缺失绝不会被当成空要求。最终 user instruction 尾部会追加简短的 `【本篇执行硬合同】` checklist，其中只重复编译结果里的规则，包括全部必需 hashtag。

模型返回后，`xhs-hard-contract-l1-v3` 首先要求 `xhs-draft-markdown-v1`：一个位于开头的 H1 标题、紧随其后的合并模型自报字符数行，以及按顺序排列的 `置顶评论`、`非置顶评论`、`关联话题` H2 section。格式失败时记录 `FORMAT_CONTRACT_FAIL`，实际计数为 null，各项检查为 `NOT_EVALUATED`，不会猜测内容区间。解析成功后，Validator 独立于模型自报数字计算标题与正文的 Unicode code point 数量，记录关键词精确 offset，检查标题关键词、关键词最低总次数、评论数量，并将最终 hashtag 按顺序逐词与 TaskCard 对比。缺失、新增、重复、换序或第十一个话题都会返回 `HARD_CONTRACT_FAIL`，并记录 `expected_topics`、`actual_topics`、`missing_topics` 与 `unexpected_topics`；不接受别名、文本归一化或语义相似。由于尚无机器边界，开头/中段/末尾关键词位置、正文结构含义、产品模块含义与文本禁止项只保留为 deferred evidence。Validation result version 4 在不改变 version-5 Business Artifact 的情况下记录这些区别。Validator 不修改 Draft，也不调用模型。输出 bundle 与一个不可变 `validation` Artifact 在同一次 Job CAS 中成为权威事实，因此重启与幂等重放会共同保留原始 First-Pass Draft 及其确定性结果。

`replayXhsHistoricalDraft` 是格式契约上线前 Draft 的只读证据路径。它保留原稿的格式失败，仅在一种已知历史布局能够无歧义确定标题、正文、评论和话题时输出硬规则证据；它不会让旧布局成为未来生产 Run 的合法格式。

人工确认正文终稿后，`buildXhsCoverHandoffArtifact` 产生独立的 `xhs-cover-handoff-v0.1` 不可变 Artifact，不写回 Obsidian 正文。它绑定正文路径、SHA-256、终稿状态、`note_type`、完整 `title_pair_contract`、逐字段来源、人工决策来源、创建时间和任务 lineage；缺失五字段、正文 hash 漂移、终稿标题冲突或主数字不在正文中都会在 S15 前失败。`buildXhsSearchSolutionCoverPlan` 将干货搜索型固定路由到 `V2_1_Swiss_Purple_QingYa`，固定 P1-P8 模板顺序、共享 Swiss 标题容量、`SENSE / JUDGE / ACT` 节点及仅 P5 一张图片的槽位，不调用模型或图片服务。

XHS 策略 `xhs-body-prepare-policy-v2-text` 接受 Markdown final text，不接受模型生成的 JSON 包装。Host 最多去除一个初始 BOM，保留其余全部正文字节，再通过 `JSON.stringify` 编码严格的内部 `{draft: string}` 包装。以 JSON 容器或代码围栏开头、空文本、内嵌 BOM/NUL、超大正文以及明确报告 `max-tokens` 结束都会被拒绝。不进行提取、JSON 修复、围栏去除或第二次模型调用。`XHS_BODY_OUTPUT_INVALID` 携带不含正文的 `xhsOutputDiagnostics`，记录分类、阶段、UTF-8 字节数、hash 与观测到的结束原因；现有持久 `failureReason` 保存该 JSON，不改变 V5。缺失的结束证据不会被推断。

storage domain schema version 为 `5`。每个 Batch 记录 `single`、`quad` 或迁移专用的 `legacy-fixed4` 参与语义，以及明确的参与 Job id。每个 Attempt 可持有 production-source manifest 与一个可空的权威输出 bundle，completed Agent Run 必须且只能引用 Artifact 或输出 bundle 之一。Version 0 到 4 与任何未知版本都会在普通打开时被拒绝且不修改原文件。包内只提供一条显式、hash-gated、由 operator 执行的 V4→V5 JSON migration；Runtime 启动绝不会调用它。

## Host API

已验证的 Breakout CLI 列表响应是一个对象，主题记录位于 `records`。Adapter 映射 `topicId`、`title`、`content`、`createdAt`、`url` 及已观察到的作者和互动数字段；空标题有效，可选字段缺失时保留为空值。`images` 可以是 URL 数组或 JSON 编码的 URL 数组。CLI 进程、超时、输出上限、JSON 解析、来源权限和 schema 映射错误使用不同的安全错误码；原始 CLI 输出不会跨越私有通道。

macOS Desktop Shell 另提供仅供 AI 破局俱乐部 Radar 读取的私有 Unix Domain Socket，不属于 Typert Remote 或 HTTP 路由。Shell 只接受来自 `http://127.0.0.1:3080` 主 WebKit Frame 的消息；每次 App 启动都会生成新的随机令牌，令牌不进入 Renderer 消息。令牌环境变量只传给 Host 启动进程，不传给普通 Command 子进程。Host 在 Workbench 服务初始化时消费启动环境中的令牌并立即从 `process.env` 删除，随后在当前用户专属的 `~/Library/Application Support/DeepSeek Harness/aipoju-ipc/` 目录中绑定本次启动专属 Socket；目录权限为 `0700`，Socket 权限为 `0600`。通道只接受 `topic.list`、`topic.search` 和 `topic.detail`，通过参数数组、`shell: false`、环境变量白名单调用固定路径 `/Users/jane/.npm-global/bin/breakout`；同时最多运行一个进程，超时为 20 秒，stdout/stderr 合计上限为 2 MiB。首页按已验证的 `--page`、`--size` 参数每页读取 20 条，达到 50 条不同候选或累计读取 100 条后停止；返回近 7 天本地排序的最多 8 条精选，以及按来源时间排序且与精选去重的最多 12 条最新主题。首页内存快照有效期 15 分钟并记录获取时间；刷新失败时保留上次成功结果和安全错误码。搜索最多返回 20 条，Renderer 不接收分页参数。主题 ID 必须是数字字符串，返回字段在跨入 Renderer 前经过选择与校验。Host 不记录 CLI 原始输出或内容型错误详情，Socket 随 Host 服务关闭而清理。

`readXhsSwissContext` 为固定的账号 2 Swiss 样本提供只读投影。它读取已配置的 XHS 源目录、Business Artifact 根目录中的不可变封面证据，以及现有 XHS Job；不会创建 Project、Work、Job、Review、Artifact 或 Asset。不一致证据标记为 partial；必需文件缺失或格式错误时会 fail closed。只有通过路径包含关系与 SHA-256 校验的候选图片字节才会返回，投影只暴露逻辑来源路径，不暴露 Host 文件系统路径。

`listLocalAIHOTIntelligence` 与 `readLocalAIHOTIntelligenceDetail` 通过 Host 凭据引用调用仅 loopback 可访问的 AIHOT 私有 API。Client 只收到经过校验的 Article/Analysis 投影；缺少凭据、本地服务失败或响应无效时统一返回 `unavailable`。投影不暴露 prompt、provider response、凭据，也不提供 PostgreSQL 直连。

`getXhsLoginStatus` 与 `getXhsLoginQrCode` 是仅有的两个小红书登录 Remote。它们使用 Host-only token 调用固定 loopback 登录端点；token 来自 `$DSH_HOME/secrets/xhs-mcp-token`，Host 会拒绝非所有者文件或权限不是 `0600` 的文件。状态结果只返回登录布尔值。二维码结果仅允许有大小上限的内联 PNG data URL 与过期时间，Host 不会持久化二维码。

`getXhsSourceStatus`、`searchXhsFeeds`、`getXhsFeedDetail` 与 `getXhsCoverAsset` 是小红书 Radar Remote。搜索只使用 `POST http://127.0.0.1:18060/api/v1/feeds/search`，请求体为 `{ keyword, filters: { sort_by } }`，默认 `sort_by` 为 `综合`，并读取 `success`、`data.feeds` 与 `data.count`。其他排序值为 `最新`、`最多点赞`、`最多评论`、`最多收藏`；Client 将选项传给 Host，不模拟来源排序。Host 每次最多映射 40 条，来源 schema 没有 page 或 cursor 输入；Renderer 显示本次响应返回的全部条目。搜索使用独立的 75 秒 Host 请求超时且不自动重试。失败结果只携带封闭错误码、失败阶段、耗时和可选 HTTP 状态；对于非 2xx 响应，Host 只在内存中检查顶层 `code`、`error` 和 `details` 以识别已知错误模式，原始响应文本与异常不会跨越 Remote 或写入日志。明确识别的浏览器/导航故障与上游响应故障分别返回 `MCP_BROWSER_ERROR` 和 `MCP_UPSTREAM_ERROR`；无法匹配的故障保留通用或未知错误码。登录状态与默认详情为 35 秒。用户明确请求加载评论时，详情 Remote 向固定 `/api/v1/feeds/detail` endpoint 发起 120 秒请求、不展开回复且最多返回 10 条评论；笔记和评论分别从 `response.data.data.note` 与 `response.data.data.comments.list` 读取。空评论列表仍是成功详情。搜索封面和详情图片只通过进程内不透明引用跨越 Remote，Client 不能提交 URL。Host 只获取五个精确的小红书图片主机，重定向必须留在原始主机，不发送来源凭据，单次总时限为 10 秒、图片上限为 2 MiB，只接受 JPEG、PNG、WebP 或 AVIF，且不将图片写入磁盘。成功图片使用最多 50 项的进程内 LRU 缓存，失败结果不缓存，最多同时下载 4 张图片。Remote 只返回图片 MIME type、Base64 图片字节、不透明缓存键与缓存命中状态。Client 使用 3:4 contain 框展示搜索封面，详情图片保持原始比例，并在图片 payload 变化或组件卸载时释放 Blob URL；引用缺失或取图失败时显示中性占位。封面诊断只在开发构建中显示。搜索与评论均由用户触发，结果和来源访问 token 只保留在页面内存，不暴露任何写操作 MCP tool。

`getScysSourceStatus`、`connectScys`、`searchScysContent`、`getScysContentDetail`、`searchScysProjects`、`getScysProjectDetail` 和 `loadScysComments` 构成固定的 SCYS 产品 API。Host 使用官方 MCP 地址执行 OAuth discovery 与 PKCE，授权 state 和 verifier 只保留在内存中；最终授权记录通过 `workbench-scys` 凭据 scope 路由到 macOS Keychain。Renderer 只收到连接状态和规范化后的内容、项目或评论字段。Adapter 在读取 `tools/list` 后只选择 11 个只读 allowlist 中的精确工具名；它不会把上游工具注册到全局工具表，也不接受 Client 提供的工具名。文章详情与评论必须使用来源提供的 `entityType` 和 `entityId`；身份缺失或不受支持时，在调用 MCP 前失败。SCYS 内容/项目最多返回 20 条，每页评论最多 20 条，且不会调用写工具。可信 Desktop 私有通道只允许 `scys.recent`、`scys.hot` 和 `scys.digested`；Host 自行构造 `searchTopic` 参数，使用 7 天 Unix 秒时间窗，每次最多读取两页、每页 10 条、单次调用超时 12 秒，并按来源时间排序及通过 `entityType`/`entityId` 去重。信息流投影不包含文章正文。每种模式的成功结果在 Host 内存缓存 15 分钟；固定布尔刷新参数会跳过有效缓存，同一模式的并发请求共享一次调用，刷新失败时返回上次成功数据及安全状态码。热门/精华结果会区分“服务端接受筛选条件”和“逐篇官方标记证据”。本次不新增 HTTP 或 Typert Remote 路由，信息流查询仍只通过私有通道进行。

已保存授权的重连诊断在调用 `connect()` 前区分凭据路由、Keychain 原生读取、记录解码与校验、回调 URI 检查和 MCP Client 创建。状态响应只包含固定错误码与安全提示；仅当原生 Keychain OSStatus 命中白名单时才返回该数值，不返回凭据值或原始异常文本。

已保存授权的重连复用 OAuth 客户端注册信息中的回调 URI，让 MCP SDK 在不打开浏览器的情况下通过交互式客户端流程刷新被拒绝的 Access Token。缺少可用的已注册回调 URI 时返回需要重新授权；重连不会编造回调 URI，也不会静默清除持久化凭据。

已保存授权的临时重连失败只会在后续来源状态请求到达且 Host 内存冷却期结束后重试。白名单中的临时网络错误及 HTTP 408、425、429 或 5xx 使用两分钟、四分钟、八分钟、最长十五分钟的有界间隔；授权、授权记录缺失、凭据结构错误及回调注册错误不会自动重试。并发状态请求共享同一次重连，连接成功后清除退避状态，重试不会打开 OAuth 浏览器。

已保存授权的重连失败包含不带 URL 的 HTTP 观测，以及有界的 `tokens()` 回调阶段记录；记录只包含阶段结果和白名单错误元数据。

`analyzeXhsComments` 是一项仅适用于单篇笔记和最多十条已加载评论、且已明确批准的无 Session 例外。它通过独立的 `commentAnalysis` 路由调用 `ctx.llm.stream()`，不创建 Agent 或 Session，也不传 `sessionId` 或 tools。模型只收到笔记标题、正文和临时 `C01`–`C10` 引用对应的评论文本。Host 校验分类、文本长度和证据引用，计算可信度，并且只返回已验证结论。路由和 Provider 故障会返回不含内容的错误码及数值诊断；Prompt、原始响应和评论文本不会被记录。Prompt 与原始响应只在请求期间留于内存；最多 50 项的进程内 LRU 只保存已清理结论，并以单向 fingerprint 作为键。本功能会把评论文本发送给已配置的模型提供方；它不声称评论只留在本机。分析路径不会把 Prompt、原始响应或评论正文写入 Harness Session 日志或普通应用日志。

本地情报投影会把 Article 标记为待分析、待判断、已保留、一般、已丢弃、已阻断或分析失败。只有当前 Analysis 的输入版本与 Article 版本一致、相关性通过、摘要非空，且已保存正文或 Feed 摘录时，内容才可人工判断。列表只暴露有长度上限的摘录预览；详情只暴露有长度上限的正文或摘录。若 Article 不再满足该规则，私有 API 会拒绝人工判断写入。

`finalizeXhsOutputBundle(jobId, attemptId)` 验证最新 Attempt、completed XHS Agent Run、权威 bundle 字节、冻结包 provenance 与确定性 Validation 后释放租约。能够解析的候选稿即使普通 Hard Contract 失败，也以 `review-ready` 原因完成；结构格式失败则以 `failed` 与可重试原因结束。重复收尾不增加 receipt、revision 或 Artifact。这只是执行结算，不是内容批准，也不是资产 Finalize/Promote。

XHS bundle 结算前，Host 在 Business root 下 fsync 仅所有者可访问的 write-once `execution-observations/<sha256(agentRunId)>.json` 记录。它在保持 V5 Job schema 不变的前提下保存可获得的 token 用量、结束原因、运行时耗时、模型选择以及精确 Draft 字节数和 hash。缺失观测保持 absent 或 null，并标为 `incomplete`；恢复不能从 `off` 推断 reasoning token 为零。观测记录不能让未被 Job 引用的输出成为权威结果。`countXhsFullCharacters` 按 Unicode code point 计数，不加权、不 trim。标题观测排除 Markdown 的 `# ` 前缀，单独记录模型自报数量，绝不改写 Draft 字节。这些计数不是完整内容 Validation。

- `createBatch`、`getBatch`、`listBatches`、`getJob` 与 `listJobs`
- `businessBatchParticipation`，用于生成不会计入 legacy 占位 Job 的 metrics 投影
- `transitionJob`、`createAttempt`、`acquireExecutionLease`、`renewExecutionLease`、`releaseExecutionLease` 与 `completeAttempt`
- `createExecutionPackage`、`createXhsProductionExecutionPackage`、`createXhsRevisionExecutionPackage`、`createXhsRetryExecutionPackage`、`createXhsContractRepairExecutionPackage`、`createXhsLengthRepairExecutionPackage`、`readExecutionInput`、`verifyExecutionPackage`、`getExecutionStatus` 与 `recoverInterruptedExecutions`
- `createXhsReviewArtifact`、`createXhsLengthRepairApproval`、`preflightXhsRevision`、`preflightXhsRetry`、`preflightXhsContractRepair`、`preflightXhsLengthRepair` 与 `preflightXhsLengthRepairSource`
- `runRestrictedAgent`、`finalizeXhsOutputBundle`、`getOutputBundle` 与 `reconcileOutputBundles`
- `assertXhsBodyPrepareExecutionPackage`、`assertXhsOutputBundle` 与 `xhsBodyPrepareIdempotencyKey`
- `commitArtifact`、`getArtifact`、`verifyArtifacts` 与 `reconcileArtifacts`

## Model Experience

### 受限 fixture Agent 请求

#### What the model sees

每个受限 action 都提供一个 complete system prompt，其中只有 Host 固定 action 指令与获准 Skill 快照；随后的一条 user message 包含 action metadata 与冻结输入字节。生成 Draft 的 XHS action 会在尾部追加 TaskCard 投影得到的 execution checklist 和固定 `xhs-draft-markdown-v1` 结构。Revision 还会获得当前被审核的不可变候选稿及其 Review；Retry 永远不会获得失败稿字节。Contract Repair 会获得候选稿、PASS Review 与对应 Hard Validation，但不会获得 Skill、写作规范或黄金样稿。Length Repair 获得相同的四项冻结证据输入，但只返回受限 JSON patch proposal，既不返回完整 Draft，也不填写字符 metadata。其他 Draft action 只返回由一个 H1 标题、合并自报字符数行、正文、按顺序排列的评论 section 与话题 section 组成的纯 Markdown，不得带 JSON、代码围栏或外层报告。Host 生成 metadata、provenance 与 L1 Validation，不请求提供方原生 JSON mode。Session 不接收 preset、历史消息、runtime context、discovery result 或 callable tool。其他 API 不产生模型请求。

#### Token effect

一次请求包含完整 selected Skill 正文、输入文件与固定 metadata，因此成本随冻结 package 字节增长；临时 Session 不产生后续 turn。

#### KV Cache effect

每次调用使用全新 Session，并从不可变 package 内容组装 complete prompt。具有相同 package 与部署策略的请求可能共享 provider-side prefix，但本包不维护应用缓存，也不承诺 cache 行为。

### 无 Session 的小红书评论需求分析

小红书评论需求分析是 Session 可重建规则的一项限定例外。它直接调用现有 `ctx.llm.stream()`，不经过 Agent、Session、`sessionId`、tools 或 `SessionPersistence`，并在每次请求中明确设置 `reasoningEffort=off` 和 `maxTokens=4096`。这样可避免部署默认值消耗共享输出预算，同时保留有限的 completion 上限。Prompt 和 Host 校验均限制每类最多 3 条、总计最多 15 条、每条不超过 120 字。请求只包含笔记标题、正文和最多十条非空评论文本，并附带临时证据引用。原始 Prompt 与 completion 只留在本次请求内存中，Host 校验后即丢弃；只有已验证结论可以进入有界内存缓存。评论文本会发送给模型提供方；“不写入 Harness Session”不表示“评论不会离开本机”。

Host 会收集 `text-delta`；仅当某文本块没有非空增量时，才使用其完成态 `block-end`。Reasoning、tool、usage 和 finish 事件不会被当作模型回答。正常结束但无正文返回 `EMPTY_RESPONSE`；Provider finish 错误报告该码时返回 `PROVIDER_EMPTY_RESPONSE`，max-token finish 返回 `PROVIDER_MAX_TOKENS`，超大输出返回 `ANALYSIS_RESPONSE_TOO_LARGE`，非空但无法解析的文本返回 `ANALYSIS_PARSE_ERROR`。

### AIHOT 证据分析 Session

内部 `AihotAnalysisRunner` 通过 `HarnessRestrictedAgentRuntime` 提交一份有界 A3-03 Evidence Pack。它会创建独立且持久化的 Agent Session，不包含环境 Session 历史，也不提供工具，并要求已挂载 `SessionPersistence`；标准 checkpoint policy 会在请求发往 Provider 前持久化完整请求。Session 的 request header 记录精确系统指令与模型路由，user message 包含序列化的 Evidence Pack 快照，Session 还记录模型响应及回合结果。取消通过 `Agent.cancel` 执行；超时复用相同的 Agent 取消路径。Runner 返回前由 A3-03 validator 校验响应。已保存响应可从 Session 日志重新校验；派生的校验结论本身不会作为独立 Session 事件保存。该 Runner 没有 Remote、UI 或自动调用方，也未通过真实 Provider 验证。

#### Token effect

一次配置好的 Provider 请求会接收一个 UTF-8 不超过 32,000 字节的 Evidence Pack，以及有界指令封套。真实调用可能产生配置中 Provider 的常规用量费用；测试使用 fixture adapter。

#### KV Cache effect

每次运行使用全新 Session；不提供应用级 Prompt 缓存或复用保证。

## Known Limitations and Deferred Work

- **单 Runtime writer**——同一个 `DSH_HOME` 只能由一个 Runtime 挂载该 domain；本阶段不新增跨进程 lock。
- **只支持一条显式 migration**——operator-run V4→V5 JSON migration 是唯一支持的迁移；schema 0 到 3 与未知版本仍不兼容。
- **封闭 Batch 数量**——新 Batch 只能是 `single` 或 `quad`；不支持任意 N Job 调度，`legacy-fixed4` 只由迁移产生。
- **无 Human Gate UI**——Review Artifact 与最多两次受控 Revision execution 已存在，但审核录入尚无 UI，获批资产 finalization 与 promotion 仍不存在。
- **无自动重试**——一次结构性 Retry 只能通过显式 Host API 准备；中断和其他 provider failure 仍由调用方控制。
- **无 orphan 清理**——reconciliation 只读。
- **AIHOT 分析尚无产品调用方**——内部 Runner 要求配置 restricted-Agent 模型和 Session persistence，但没有 Remote 或 UI，也尚未使用真实 Provider 验证。
