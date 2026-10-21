# Agent Note: Xiaohongshu search browse controls

[English](2026-10-10-xhs-radar-search-browse-controls.md) | 中文

Status: implemented

## Problem

小红书搜索结果需要紧凑的浏览布局，并需要明确选择来源支持的排序方式。

## Decision

搜索表单默认使用来源的 `综合` 排序，并通过固定 Host 搜索请求传递所选 `sort_by`。已有搜索结果后切换排序会重新请求；Client 不会重新排列结果来模拟来源排序。普通桌面宽度使用三列，宽屏使用四列，窄屏使用两列，极窄屏使用一列。封面使用 3:4 展示框和 `object-fit: contain`。Renderer 展示本次请求映射返回的全部条目；Host 将响应限制为 40 条，来源 schema 没有分页输入。搜索失败保留原业务状态，并只携带封闭错误码、失败阶段、耗时和可选 HTTP 状态。Client 将传输层 Remote 失败映射为 `REMOTE_TRANSPORT_ERROR`；carrier 无法安全区分 Host 不可达与其他 Remote 传输失败。封面诊断只在开发构建中显示。

## Alternatives considered

**由 Client 排序结果。** 不采用，因为互动数或时间戳排序无法复现来源支持的排序语义。

**重复同一搜索来增加“加载更多”。** 不采用，因为来源 schema 没有页码或 cursor 字段，重复请求可能返回首批重复条目并伪装成分页。

**保留固定两列布局。** 不采用，因为桌面空间利用不足，也不能适应可用视口宽度。

## Consequences

搜索排序由来源决定；用户在已有结果后切换排序会发起一次新搜索。首批响应保持有界；来源提供真实分页参数前，界面不展示分页。低于两列断点时，卡片改为单列。搜索错误会标明安全失败阶段，但不会展示原始异常或来源响应文本。

## Testing

Host adapter 测试验证精确的 `filters.sort_by` 请求、25 条返回记录不会被静默截断为 20 条，以及来源超时、不可用、上游错误和响应映射诊断。Client 测试验证默认与选中排序、切换排序后重新请求、Host 与 Remote 错误详情安全显示、响应式 CSS 断点、3:4 contain 图片框，以及生产构建不显示诊断面板。
