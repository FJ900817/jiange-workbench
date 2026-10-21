# Agent Note: Studios 媒体创作会话

Status: implemented

[English](2026-10-18-studios-media-creation-sessions.md) | 中文

## Problem

隔离版 Studios P2.1 已验证连续 Mock 创作与版本历史，但其 JSON 文件不适合作为 Harness 正式数据权威，预览服务器也不属于 Host 集成。

## Decision

Business Workbench 拥有独立的 `business_workbench_media_studio` Domain schema v1，并通过固定 Host Remote 提供已声明模型读取、会话读取、创建轮次、任务轮询和取消操作。Store 将每个创作会话持久化为聚合记录，包含不可变轮次、任务、作品和版本边。它不修改小红书 `business_workbench` schema，也不导入隔离 P2 文件。

首个 Provider 实现固定为 Mock。它校验已声明的模型参数，创建不含媒体字节的 opaque `mock-result://` 引用，并报告 Provider 网络请求数为零。生成数量按模型声明的单任务上限拆分，同时保持在同一轮次。选择旧作品会记录其父作品和修改意图；视频谱系明确标记为提示词驱动的重新生成，不冒充精确编辑。

Client 只访问固定的 `remote.businessWorkbench` 操作，不接收 Provider URL、任意工具名、凭据或远程生成命令。XHS 样本投影只门控依赖样本的生产路线；独立媒体创作路线只要求注入媒体 Remote。正式 Desktop 与真实 Provider 执行仍未验证。

## Alternatives considered

- 将 P2.1 JSON 文件直接用于正式存储：拒绝，因为它是隔离原型存储，不是 Harness Host 持久层。
- 新建独立媒体服务：拒绝，因为 Business Workbench 已拥有 Host 存储和受限业务 Remote。
- 本阶段加入真实模型适配器：拒绝，因为凭据复用、上传权限和生成费用需要另行授权与验证。
- 复用或复制 Obsidian 插件实现：拒绝，因为其包标记为 private/unlicensed，复用权利尚未确认。

## Consequences

- Host 持久化不依赖 Client 路由挂载，并与隔离 PoC 目录分离。
- 现有 P2 JSON 保持不变，旧 PoC 仍可读取；本阶段未实现自动导入。
- 当前 UI 可以验证会话切换、父作品选择、Mock 版本创建和 Host 任务轮询，但不能展示生成媒体。
- 服务已进入源码与测试 Host 构建；运行中的正式 Host 未重启，Desktop 尚未进行运行时验证。
- 未取得权利许可前，不得在公开发布或分发包中包含私人 Obsidian 代码或第三方素材。
