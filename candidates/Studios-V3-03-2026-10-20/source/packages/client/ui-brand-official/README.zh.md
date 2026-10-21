# @deepseek-ai/dsh-client-ui-brand-official

[English](README.md) | 中文

本包不占用侧栏品牌 slot。主界面由 shell 通过 `sidebar.brand.mark`、`sidebar.brand.name`、`sidebar.brand.glyph` 与 `sidebar.brand.short-name` 提供可替换产品身份；应用身份、Bundle ID、CLI、Runtime 与仓库命名保持独立。空会话 Hero 标记 slot 仍可由部署提供，本包不填充该 slot，因此显示当前所选 Workspace 身份。

浏览器入口不注册内容，因为官方 Harness 标记与字标不是主界面的产品品牌。本包不保留运行时状态。node 半边是空的 Loader seat；浏览器标题仍属于本包之外的构建环境事项。

## 模型体验

无，因为本包只贡献浏览器呈现；这里没有任何内容进入模型请求。

#### KV Cache 影响

无；本包既不组装也不发送 provider 请求。

## 已知限制与暂缓事项

- **本包只提供一组 occupant** —— 其他呈现应由占用相同 slot 的另一个 Cordis 包提供。
- **浏览器标题相互独立** —— `DSH_CLIENT_TITLE` 在构建期选择标题文字，而不经过 UI slot。
