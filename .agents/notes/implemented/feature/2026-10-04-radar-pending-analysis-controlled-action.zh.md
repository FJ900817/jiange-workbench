# Agent Note：Radar 受控处理待分析

状态：已实现

[English](2026-10-04-radar-pending-analysis-controlled-action.md) | 中文

## 问题

用户需要对已存在、处于 `pending_analysis` 的 AIHOT Article 执行明确且有上限的处理动作；V1.3 验证 runner 不是正式产品代码。

## 决策

Radar 只将用户选择的 Article ID 通过 Host 发送到独立 AIHOT 私有 action。服务端重新验证状态，将批次限制为最多三篇文章，并按文章数派生最多十五次付费请求；执行串行化，获取数据库 advisory lock，阻断受保护的 Receipt 20 和 26，并在处理后比较 canonical V2 fingerprint。普通模型访问仍关闭；只有 action 的异步请求作用域获得许可。人工 Review 仍独立。

Run、条目、幂等键、request fingerprint 及 PRE/POST 安全快照存入两张独立技术表，不加入 canonical V2 八张业务指纹表。API 启动时将未结束 Run 记录为 interrupted，不自动恢复。请求次数在 Provider 传输前持久化；持久化失败时 fail-closed。migration 尚未应用，持久化行为仍待隔离服务端测试验证。

## 后果

UI 可以提供选择、持久化进度和重连查询，不调用 shell runner，也不启动 Worker。部署需要单独的 `WORKBENCH_PROCESS_TOKEN`；Host 不复用读凭据或 Review 凭据。真实生产 action 仍须另行明确授权，本轮没有执行。

## 验证

Harness 聚焦测试与完整构建结果见 V1.4 输出报告。AIHOT 仓库依赖未安装，服务端测试和类型检查无法运行；migration 静态测试与 Node 语法检查通过，但 migration 未部署。正式 Desktop UI 验收、API 部署、凭据配置和真实运行仍待完成。
