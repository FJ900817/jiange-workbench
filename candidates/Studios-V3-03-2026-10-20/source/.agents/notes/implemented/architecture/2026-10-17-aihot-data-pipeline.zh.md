# Agent Note: AIHOT 有界数据处理复用公共读取器

Status: implemented

[English](2026-10-17-aihot-data-pipeline.md) | 中文

## Problem

AIHOT 公共 Item 和 Story 读取器负责校验官方响应并管理 HTTP 缓存，但后续消费者需要可复用的批次投影，用于安全分页、保留来源信息、比较快照，并在不启动第二套采集器或保存本地镜像的前提下区分已确认事件关联与候选关联。

## Decision

`packages/client/ui-conversation/src/client/skeleton/aihot-data-pipeline.ts` 组合 `loadAihotItems` 和已有公共记录类型。调用方指定有限页数、请求间隔及断点有效期；实现将单次运行上限限制为十页，检测重复 Cursor，并在中断或 API 失败时返回已成功读取的记录及内存断点。断点保留精确查询身份和 Cursor，因此不能用不同筛选条件恢复；它不是供后续滚动时间窗同步使用的持久 Cursor。

标准化 Item 保留 API 字段来源、`publishedAt`、`discoveredAt`，以及独立的客户端 `observedAt`。公共 Item 的 `score` 作为官方数值字段保留，不赋予未由公开 Schema 定义的比较含义。只有 Story 报道 ID 等于 Item ID，或原文链接完全相同时，才确认 Item 与 Story 的关联；调用方提供的候选关联保持 `needs_review`。相同 Item ID 折叠为最后观察到的记录；相同原文链接会在规范文章投影中计数，但不同官方 Item 记录仍保留供增量比较。

两个快照按官方身份分类新增、未变化和已变化的 Item 与 Story。由于公共滚动时间窗不是完整稳定的镜像，比较不会仅因记录缺席就推断其被删除。该模块不包含持久化、调度器、Worker、模型调用、UI 路由或数据库写入。

## Alternatives considered

**新建另一套 HTTP Client 或采集器包。** 否决。A1 已负责 endpoint 校验、查询绑定 Cursor、缓存行为和安全 API 错误；第二个读取器可能偏离官方 Schema 并重复请求。

**将 Cursor 和快照持久化到现有数据库。** 否决。本阶段没有授权改动数据库或建立持久镜像，并且七天查询窗会滚动。

**根据相似标题推断 Story 身份。** 否决。标题相似不能证明官方事件关联；这类候选必须保持未确认状态。

## Consequences

消费者可以复用同一份保留来源信息的标准化结果，为搜索、分析或后续内容系统提供数据，同时 A1 仍是唯一网络读取器。配置有效期内，有界读取可以从已成功页面继续；断点过期后，调用方必须发起新查询。该模块不提供长期变化历史、删除检测或后台同步服务。

## Verification

聚焦测试覆盖超过 100 条记录的双页读取、重复 ID、页数上限及续读、API 失败恢复、Cursor 循环、取消、节流、查询不匹配、断点过期、精确 Story 关联、未确认候选关联以及 Item／Story 快照比较。通过现有 Adapter 的真实读取完成了官方两页查询，共取得 200 个唯一 Item ID；这是有界读取，不是全量目录镜像。
