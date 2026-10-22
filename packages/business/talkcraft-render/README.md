# talkcraft-render（隔离渲染器）

把一张 talkcraft Remotion 卡（`export default` 组件 + `export const meta = { width, height, fps, durationInFrames }`）
渲染成**带透明通道的 RGBA PNG**。这是 talkcraft 透明化接线的一块：视频包装台 Host 渲染服务直接调用
`render-card.mjs`，拿到透明 PNG 再叠加到视频时间轴上。

本包是私有隔离包（`"private": true`），不发布；只依赖 Remotion 官方包 + React，不碰仓库其他代码，
也不改任何 talkcraft 卡原文件。

## 安装

仓库根目录执行（pnpm 11.x；若不在 PATH，用 `~/workspace/.tools/pnpm-11/bin/pnpm`）：

```sh
pnpm install
```

`pnpm-workspace.yaml` 已包含 `packages/*/*`，本包会被自动收录，无需额外配置。

## 用法

```sh
node packages/business/talkcraft-render/render-card.mjs \
  --card /abs/path/card.tsx \
  --props '{"title":"第一章","theme":"dark"}' \
  --width 960 --height 540 --fps 30 \
  --frame 45 \
  --out /abs/out.png
```

- `--card`（必填）：卡片 tsx 的**绝对路径**。
- `--props`（可选）：JSON 对象，作为卡片组件的 props（即 Composition 的 `defaultProps`）。不传 = `{}`。
- `--width` / `--height` / `--fps`（可选）：输出尺寸与帧率；**不传时取卡片 `meta` 里的值**，传了则覆盖。
  总帧数永远取 `meta.durationInFrames`。
- `--frame`（必填）：要渲染的帧号；超出范围会被钳制到 `[0, durationInFrames-1]`（stderr 会提示）。
- `--out`（必填）：输出 PNG 的**绝对路径**（父目录不存在会自动创建）。
- 成功 exit 0；失败 exit 非 0，stderr 输出中文原因。

## Chromium 说明

- 默认：`@remotion/renderer` 自带浏览器管理。首次运行若本机没有，会自动下载
  chrome-headless-shell 到仓库根 `node_modules/.remotion/`（约 150MB，需要联网一次），之后复用。
- 已有浏览器想直接用：设置环境变量 `TALKCRAFT_CHROMIUM_PATH` 指向 Chromium 可执行文件，例如：

  ```sh
  TALKCRAFT_CHROMIUM_PATH=/opt/meta-chromium/chrome node render-card.mjs --card ... --out ...
  ```

  也可以用 playwright/puppeteer 缓存里的 chromium（本机实测存在 `~/.cache/ms-playwright/chromium-1248/`）。
  路径不存在会直接报错退出。

## 实现要点

- 每次渲染生成一份临时入口 tsx（`import` 卡片 default 组件 + `meta`，注册
  `<Composition id="Card" … defaultProps={props} />`），渲染完删除。
- `bundle()` 时用 `webpackOverride` 把 `react` / `react-dom` / `remotion` alias
  到本包自己的 `node_modules`，卡片放在哪个包目录下都能解析成功。
- `renderStill({ imageFormat: 'png' })` 输出 RGBA PNG；卡片根节点用透明底
  （`background: "transparent"`）即得到透明通道。
