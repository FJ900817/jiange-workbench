# library-render（隔离渲染器）

把视频包装台的组件库组件渲染成**带透明通道的 RGBA PNG**，供 Host 渲染服务叠加。
三条链：

- `render-card.mjs` — Remotion 卡渲染器。两种形态：
  - talkcraft 形态：`export default` 组件 + `export const meta`
    （不传 `--export-name`；`--width/--height/--fps` 不传则取 meta）。
  - shotcraft 形态：具名 export 组件（`--export-name` 指定，如 `BlurSlide`）；
    `--duration-export` 指定总帧数导出名（必填），`--defaults-export` 指定默认
    props 导出名（可选，与 `--props` 合并，CLI 优先）；`--width/--height/--fps` 必填。
- `render-aikou.mjs` — aikou（AI口播包装库）HTML 组件渲染器。用 headless
  Chromium（playwright-core）加载内联后的 `aikou-components.js`，调用
  `renderAikouOverlayPng` 画到整幅画布，导出 PNG。aikou 按整幅画布绝对坐标
  绘制，输出即整幅画布尺寸，FFmpeg 叠加时定位 (0,0)。
- `resolve-chromium.mjs` — 共享的 Chromium 解析：环境变量
  `LIBRARY_RENDER_CHROMIUM_PATH`（兼容旧名 `TALKCRAFT_CHROMIUM_PATH`）优先，
  其次本包 `node_modules/.remotion` 下已下载的浏览器，再次
  `~/.cache/ms-playwright` 缓存；都找不到时中文报错。

本包是私有隔离包（`"private": true`），不发布；只依赖 Remotion 官方包 +
React + playwright-core，不碰仓库其他代码，也不改任何组件库原文件。
（由 `talkcraft-render` 更名而来，见 Agent Note；旧环境变量名仍兼容。）

## 安装

仓库根目录执行（pnpm 11.x；若不在 PATH，用 `~/workspace/.tools/pnpm-11/bin/pnpm`）：

```sh
pnpm install
```

`pnpm-workspace.yaml` 已包含 `packages/*/*`，本包会被自动收录，无需额外配置。

## 用法

```sh
# talkcraft 卡
node packages/business/library-render/render-card.mjs \
  --card /abs/path/card.tsx \
  --props '{"title":"第一章","theme":"dark"}' \
  --width 960 --height 540 --fps 30 \
  --frame 45 \
  --out /abs/out.png

# shotcraft 卡（具名 export）
node packages/business/library-render/render-card.mjs \
  --card /abs/path/blur-slide.tsx --export-name BlurSlide \
  --defaults-export BLUR_SLIDE_DEFAULTS --duration-export BLUR_SLIDE_DURATION \
  --props '{"title":"标题"}' \
  --width 1920 --height 1080 --fps 30 \
  --frame 45 \
  --out /abs/out.png

# aikou 组件
node packages/business/library-render/render-aikou.mjs \
  --module /abs/path/aikou-components.js \
  --ref '{"lib":"aikou","componentId":"tag","params":{"label":"标题","x":40,"y":300}}' \
  --width 1920 --height 1080 --time 1.5 \
  --out /abs/out.png
```

- `--card` / `--module` / `--ref` / `--out` 必须用**绝对路径**（`--out` 除外是文件路径要求）。
- `--frame` 会被钳制到 `[0, durationInFrames-1]`（stderr 会提示）。
- `--time` 是 aikou 组件内时间（秒），0 = 组件起始。
- 成功 exit 0；失败 exit 非 0，stderr 输出中文原因。

## Chromium 说明

- 解析顺序：`LIBRARY_RENDER_CHROMIUM_PATH` → `TALKCRAFT_CHROMIUM_PATH`（旧名兼容）
  → 本包 `node_modules/.remotion` 下已下载的浏览器 → `~/.cache/ms-playwright` 缓存。
- 都找不到时，`render-card.mjs` 会尝试用 `@remotion/renderer` 的 `ensureBrowser()`
  自动下载（约 150MB，需要联网一次），之后复用；`render-aikou.mjs` 同理。
- 已有浏览器想直接用：设置环境变量，例如：

  ```sh
  LIBRARY_RENDER_CHROMIUM_PATH=/opt/meta-chromium/chrome node render-card.mjs --card ... --out ...
  ```

## 实现要点

- `render-card.mjs`：每次渲染生成一份临时入口 tsx（注册
  `<Composition id="Card" … defaultProps={props} />`），渲染完删除。
- `bundle()` 时用 `webpackOverride` 把 `react` / `react-dom` / `remotion` alias
  到本包自己的 `node_modules`，卡片放在哪个包目录下都能解析成功。
- `renderStill({ imageFormat: 'png' })` 输出 RGBA PNG；卡片根节点用透明底
  （`background: "transparent"`）即得到透明通道。
- `render-aikou.mjs`：把 `aikou-components.js` 顶层 `export` 逐行剥离后内联进页面
  （与 `embedded-editor.ts` 同约定），调用其导出的 `renderAikouOverlayPng`，
  经 `page.evaluate` 取回 PNG 字节。页面背景透明，画布即整幅画布。
