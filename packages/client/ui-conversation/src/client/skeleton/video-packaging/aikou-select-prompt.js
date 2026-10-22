/**
* Component-selection guide for the AI narration-packaging library (aikou).
* Distilled from the director's decision table ("口播在说什么 → 组件+状态").
* P0 opens only this library and only the 8 whitelisted components below.
* Injected into the suggestion system prompt by video-packaging-model.ts.
*/
export const AIKOU_SELECT_PROMPT = [
'【选组件指南 · AI口播包装库】',
'输出 PackagingProposal.libraryRef 时遵守以下规则：',
'',
'1. lib 固定写 "aikou"；componentId 只能是下面 8 个白名单之一：',
' tag, qa, stat, months, numlist, strips, counter, tiles',
'',
'2. 口播在说什么 → 选哪个（每段最多 1 个主组件）：',
' - 开头话题 / 钩子 → tag（话题标签，贴人物头旁，停约 5 秒）',
' - 提到软件 / 工具 / 产品名 → tag（带 icon：bolt/gem/task/user/warn）',
' - 时间 / 周期（半年、三个月、几年） → months（圆点月份块）',
' - 一问一答（"我是谁 → 让 AI 记住"） → qa（问答卡，可两张错落放在头顶与胸前）',
' - 数字上涨 / 越来越大 → stat（数据口播字，叠在人物两侧，不遮脸）',
' - 讲结论数字（"最高省 60%"） → counter（大数字）或 stat',
' - 清单 / 列几项 / 步骤 → strips（玻璃贴条清单，人物全屏，一条条贴）或 numlist（编号要点，说到一项出一项）',
' - 并排几个数据块 → tiles',
' - 普通叙述 / 过渡 / 铺垫 → 不用任何组件（只留字幕），省略 libraryRef',
'',
'3. params 按下面模板填空：只许填模板里列出的字段，不许自加字段；',
' 不许自填颜色/字号——样式全部走锁定预设，params 里只放文字/时间/位置。',
' - tag: { label: "中文标签", en: "EN CAPS", icon: "bolt|gem|task|user|warn", x: 40, y: 300}',
' icon 只能五选一；竖屏标签放 x≈40、y≈300。',
' - qa: { q: "问题", a: "回答", dir: -1|1, x: 50, y: 320}',
' dir=-1 贴左上，dir=1 贴右上。',
' - stat: { items: [ { x, y, label: "项目", from: 3, to: 9, unit: "个", at: 出现时刻, a: 计数开始, b: 计数结束}]}',
' 每个数字 a<b；at 用口播说出该数的时刻。',
' - months: { label: "使用 Obsidian", n: 6, unit: "个月", pre: "≈ ", a: 点亮开始, b: 点亮结束, x: 640, y: 240, w: 380}',
' n 个圆点从 a 到 b 依次点亮，a<b。',
' - numlist: { label: "清单标题", items: [ { no: "01", lines: [ { text: "…", at: 说到该项的时刻}]}], x: 1330, y: 230, w: 540}',
' 说到一项出一项，不要一次全亮。',
' - strips: { head: "标题", items: [ { k: "小字", v: "正文", en: "EN", at: 说到时刻, col: 0, row: 0}], cols: [ { x: 48, w: 520}], y: 128, h: 58, gap: 10}',
' - counter: { label: { text: "…", en: "…", x: 1142, y: 330, size: 54}, from: 86, to: 1313, c0: 计数开始, c1: 计数结束, at: 出现时刻, x: 1130, y: 60, size: 280}',
' - tiles: { tiles: [ …并排数据块，每块带 label/value…]}',
'',
'4. state 可选：A（人物全屏）/ B（真实界面，渐变底）/ C（数据/清单，深色底）/ D（对比数字，保留人物陪伴）。',
' 普通叙述不填 state、不输出 libraryRef。',
].join('\n')
