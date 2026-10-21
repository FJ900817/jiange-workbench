# Agent Note: Xiaohongshu Radar Cover Resolution

Status: implemented

English | [中文](2026-10-06-xhs-radar-cover-resolution.md)

## Problem

小红书笔记卡片只能从少数上游封面字段读取图片；远程图片加载失败时，浏览器破图表现仍会出现在页面中。

## Decision

Host 适配器按 `urlDefault`、`url`、`urlPre`、首个可用的 `infoList[].url` 顺序解析有效 HTTP(S) 封面，并把相对协议 URL 规范化为 HTTPS。Renderer 始终预留 16:10 封面区域，封面缺失或加载失败时显示中性占位块。不使用图片代理，也不持久化图片字节。

## Alternatives considered

- **继续只读取单个封面字段，并仅隐藏缺失值**：这会漏掉上游已有的有效回退字段；远程请求失败时仍会显示浏览器破图表现。
- **新增 Host 图片代理**：当前没有可复用的安全图片代理；新建通用代理会扩大本次有限修复范围及其网络安全面。

## Consequences

更多上游封面字段无需改变笔记数据约定即可渲染；图片不可用时不再出现浏览器错误图标，卡片几何也保持稳定。远程直连仍受来源 CDN 与 WebView 策略影响；失败图片以低干扰占位形式呈现。

## Testing

Adapter 测试覆盖候选优先级、HTTP(S) 校验、相对协议 URL 规范化、`infoList` 回退和无有效候选。Client 测试确认缺失及加载失败的封面会显示占位块，并移除失败的 `<img>` 元素。
