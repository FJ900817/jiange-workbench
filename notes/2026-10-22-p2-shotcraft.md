# P2 shotcraft 接入 · Agent Note（2026-10-22）

施工员：P2 shotcraft（与 P1 talkcraft 并行，同一分支 `p2-more-components`）
源库：`~/workspace/video-shotcraft/`（Apache 2.0，只读，未修改）
交付物目录：`packages/client/ui-conversation/src/client/skeleton/video-packaging/shotcraft-cards/`

## 改造清单（做了，31 个 componentId）

### typography（20）
marker-underline-title、blur-slide、outline-word-fill、gradient-word-sweep、
lead-word-zoom-assemble、brace-expand、countdown-arc-scatter、paper-title-card、
pill-slot-cycle、pill-chip-slot-cycle-handled、glitch-cycle、
text-column-converge、title-demote-to-label、type-assembly-moves（三变体合一：
split-text-stagger / letterform-drift / text-on-path）、type-entrance-moves
（LetterDropPhysics 落体）、type-rhythm-sync（两变体合一：
font-weight-pump / karaoke-fill-sync）、typewriter-moves、
vertical-word-roll-blur-cycle、word-relay-filmstrip、word-relay-geometry。

### ui-entrance（6）
list-reveal、avatar-bracket-carousel、product-card-progressive-assemble、
research-card-stack-scroll、draw-svg-trace、wall-reveal-moves（两变体合一：
bento-light-up / wireframe-draw-on）。

### data（5）
before-after-slider-scrub、chart-live-moves（三变体合一：
axis-rescale-shock / oscilloscope-stream / unit-dot-swarm-regroup）、
gauge-readout-moves（两变体合一：needle-sweep-selftest /
tape-scroll-fixed-pointer）、scroll-brake-moves（两变体合一：
brake-reticle-lock / changelog-scroll-brake）、timeline-travel。

## 跳过清单（没做 + 原因）
- typography：brand-ink-open（自家品牌开场）、flying-words（全屏循环背景，非组件）、
  document-typewriter-reveal（纹理依赖 + 整页场景）。
- ui-entrance：clipcard-looping（需真实 mp4）、deck-deal-flyin /
  document-typewriter-reveal / list-stack-press / row-embed / page-waterfall-wall
  （纹理 `live-layout.json` / 截图依赖）、bezier-source-converge-merge（整屏机制镜头）、
  card-stack、carousel-3d（循环展示）、cloner-depth-echo、integration-hub-map、
  neon-frame-forerun、neon-frame-orbit-drop（整屏登场场景）、element-body-moves、
  radial-wave、value-stagger-gradient（技法/装饰演示）、doc-park-left-pill-deal（双栏场景镜头）。

## 改造范式（每张卡照抄）
1. 硬编码文案/数字 → 带默认值 props（原 demo 文案作默认值）。
2. 去 video-shotcraft 品牌（ShotcraftMark → 中性圆点；BRAND.name → brand prop，默认 'Studio'）。
3. 去掉不透明 Backdrop/Stage → 透明底（alpha 叠加路线）。
4. 节奏命门保持常量不暴露（入场时长/缓动/相机穿越/急停帧）。
5. 新增 `duration` prop；尾 8f 淡出 = `1 - ramp(frame, duration - 8, 8, EASE.out)`
   （⚠️ 曾踩坑写成 `ramp(...)` 导致全程透明）。
6. 每张卡导出：组件 `React.FC<Props>`、`XXX_DURATION`、`XXX_DEFAULTS`、`XXX_SCHEMA`
  （字段类型 text/textarea/number/slider/color/select/boolean）。
7. 多子 variant 合并为一个 componentId，用 `variant` select 参数切换。
8. 词列表类 params 类型为 `string[] | string`，组件内归一化。
9. 依赖 props 的模块级常量（定时表/STEPS/WORD.length 等）必须移入组件内。
10. 组件内 props 合并变量命名避让（原组件已有 `const p` 时改用 `cfg`）。
11. 暗场卡注明"宜叠暗画面"、浅场卡注明"宜叠浅画面"。
12. import 路径是 `../_fixtures/X`（卡在 `shotcraft-cards/<category>/` 下只有一层）。
13. `*词*` 强调 DSL：支持中文无空格的 inline 解析，下划线 SVG 用
    `preserveAspectRatio="none"` + `width:100%` 自适应词宽。

## 新增文件清单
- `shotcraft-cards/typography/*.tsx`（20）、`shotcraft-cards/ui-entrance/*.tsx`（6）、
  `shotcraft-cards/data/*.tsx`（5）
- `shotcraft-cards/_fixtures/`：Polish.tsx、Look.tsx、Motion.tsx（原样拷贝+文件头）、
  Fixtures.tsx（改编：去 Brand 依赖，品牌名→可选 brand prop）
- `shotcraft-cards/shotcraft-index.json`（31 卡：name/summary/use/duration/energy/
  category/componentId/propsSchema；由 `~/workspace/component-integration/gen-shotcraft-index.py` 生成）
- `shotcraft-cards/shotcraft-select.js` + `.d.ts`（`SHOTCRAFT_SELECT_PROMPT`，
  由 `/tmp/gen_select_lint.py` 从 index 生成，6689 字符）
- `shotcraft-cards/shotcraft-lint.js` + `.d.ts`（`SHOTCRAFT_COMPONENT_IDS` 31 白名单 +
  `validateShotcraftLibraryRefs`：白名单/未知参数/缺必填/select 选项域校验）
- `tests/shotcraft-lint.spec.ts`（11 用例，自建 plan 对象）
- 唯一碰过的现有文件：`packages/client/ui-conversation/tsconfig.json`
  （exclude 加一行 `src/client/skeleton/video-packaging/shotcraft-cards`，
  卡是 Remotion 渲染管线源码不进客户端 bundle；diff 仅 +1 行）

## 渲染实测（`~/workspace/p2b-verify/shotcraft-render/`，remotion 4.0.484）
- 中文渲染：PASS。云端有 Noto Sans CJK SC（fc-match 确认），
  `shots/marker-cn-44.png` 显示"剪出你的高光时刻"字形正确、无走样、无 tofu。
- 透明底：PASS。PNG 序列约 97% 像素透明。
- WebM VP9 alpha：FAIL。Remotion CLI `--codec=vp9` 输出 `yuv420p`；
  PNG 序列 + `ffmpeg -c:v libvpx-vp9 -pix_fmt yuva420p` 仍被 mux 为 yuv420p，
  `alphaextract` 报 "Requested planes not available"。
  证据：`out/marker-cn-alpha.webm`、`out/marker-cn-alpha2.webm`。
- ProRes 4444 alpha：PASS。`out/marker-cn-alpha.mov` 为 `yuva444p12le`，
  alpha 平面完好。与 DESIGN.md 中 huashu 已验证的 `--transparent` →
  ProRes 4444 路线一致。**alpha 交付走 ProRes 4444，不要走 VP9。**
- 本轮抽查截图（全部正常渲染）：
  - `shots/spot4-S4-ba.png`（before-after）、`spot4-S4-cl{a,b,c}.png`（chart 三变体）
  - `shots/spot5-S5-{ga,gb,sa,sb,tt}.png`（gauge 两变体 / scroll-brake 两变体 / timeline）
  - 另有 S2（typography 后 8 张）、S3（ui-entrance 6 张）、TAS（type-assembly 三变体）

## 测试数据
- `npx vitest run packages/client/ui-conversation/tests/shotcraft-lint.spec.ts`：
  **11/11 全绿**（白名单 31 个、合法 ref 通过、无 ref 跳过、未知 id/他库 ref/
  未知参数/缺必填/非法 variant 选项/缺 params 包/缺 proposals 列表，均按预期抛错）。
- aikou 现有文件未碰；P1 并行提交的 talkcraft-* 文件未碰。

## 遗留缺口
1. brace-expand 换长文案需调小字号（schema 已注明）。
2. 暗场卡透明底后宜叠暗画面、浅场卡宜叠浅画面（各文件头已注明）。
3. VP9 alpha 走不通，alpha 交付走 ProRes 4444 路线。
4. pill-chip-slot-cycle-handled、lead-word-zoom-assemble 无尾部淡出
   （原设计即 hold 结束，可接受）。
5. 卡内注释为中文（源库风格，改编注记需中文说明"改了什么"），与 AGENTS.md
   "code comments are English" 冲突——已决定沿用源库中文注释风格。
6. `~/workspace/video-shotcraft` 未修改；`git commit` 与 `PROGRESS_LOG.md` 未碰，
   由 parent 统一提交。

## 红线遵守情况
- 未调用付费模型；未做 Desktop 部署；未碰 127.0.0.1:3080 与 ~/.dsh；
  未改 video-shotcraft 原文件；未 git commit；未碰 PROGRESS_LOG.md；
  未碰 talkcraft-* 与 aikou-* 文件。
