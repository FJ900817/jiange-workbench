/**
* huashu-motion style guide (4th library): "借设计不借引擎".
*
* huashu-motion is an "agent shoots the whole film" workflow — we do NOT
* take its runtime/cli/studio engine. We take its 20 motion-language design
* docs + the talking-head / kinetic-type templates and turn them into:
* (1) the legal animation vocabulary for PackagingProposal.animation,
* (2) per-language one-liners mapping 口播 content -> animation choice,
* (3) locked style presets the AI must copy verbatim (防 AI 味).
*
* Sources (read-only, never modified):
* ~/workspace/huashu-motion/skills/huashu-motion/references/library/languages/ (20 docs)
* ~/workspace/huashu-motion/templates/talking-head/template.json
* ~/workspace/huashu-motion/templates/kinetic-type/template.json
*
* Self-contained ESM: no imports (same convention as the lint modules).
*/

/**
* Legal animation values for PackagingProposal.animation.
* Renderer note (editor.js): any value other than 'none' renders as a fade;
* only 'fadeUp' adds the upward offset. New values therefore degrade
* gracefully until the renderer learns them — the guide records INTENT.
*/
export const HUASHU_ANIMATIONS = Object.freeze([
'fadeUp', // 淡入上移（默认；名牌式，克制）
'fade', // 柔和淡入（编辑器下拉已提供）
'none', // 无动画（普通叙述留白）
'slam', // 重拍砸入（kinetic-type expo.out；金句/关键词）
'countUp', // 数字滚动到数（talking-head 数字卡 / data-story）
'wordSwap', // 句中换词（kinetic-type "Not just ___"）
'wipe', // 色带划过切场（kinetic-type 章节切换）
'spring', // 弹性入场（OM.spring；清单/卡片 playful）
])
const HUASHU_ANIMATION_SET = new Set(HUASHU_ANIMATIONS)

/**
* The 20 motion languages, distilled. Each entry tells the AI:
* what it says, when to use it for 口播 packaging, and which animation
* intent to pick. Languages marked avoidPackaging:true are NOT for
* overlay packaging (wrong register) — listed so the AI knows to skip them.
*/
export const HUASHU_LANGUAGES = Object.freeze([
{ id: 'talking-head', says: '真人站在后面，包装只做点缀', useWhen: '口播包装默认语言', animation: 'fadeUp', componentType: 'title', note: '节制铁律：约 4 秒上一个元素，别堆'},
{ id: 'kinetic-type', says: '字就是演员，砸出主张', useWhen: '金句/口号/单数字/章节卡', animation: 'slam', componentType: 'highlight', note: '一屏一个主张；expo.out 重拍'},
{ id: 'data-story', says: '数字会动，证据在变', useWhen: '趋势/对比/结果，先提问再上图', animation: 'countUp', componentType: 'highlight', note: '数到精确值，停在节拍上；不许编数据'},
{ id: 'card-montage', says: '一步一张卡，做完收工', useWhen: '3-6 个清晰步骤/卖点', animation: 'spring', componentType: 'info', note: '每卡只做一件事；步骤条给切换理由'},
{ id: 'editorial-collage', says: '这是真的，看这行', useWhen: '引用/案例/有出处的话', animation: 'wipe', componentType: 'highlight', note: '荧光笔划线式强调；必须有真实出处'},
{ id: 'modular-grid', says: '精确、有秩序、可扩展', useWhen: '清单/规格/技术向', animation: 'slam', componentType: 'info', note: 'power4.inOut 果断；禁用弹性'},
{ id: 'hand-drawn', says: '笔在思考，真人感', useWhen: '讲解/推演/亲民品牌', animation: 'spring', componentType: 'info', note: 'OM.spring(0.2) 弹性；一两种墨水色'},
{ id: 'cursor-demo', says: '产品是真的，就这么用', useWhen: '功能演示（真实界面）', animation: 'fade', componentType: 'info', note: '包装场景少用；用时保持克制'},
{ id: 'mechanism', says: '原理看得见', useWhen: '讲"怎么运作"', animation: 'fade', componentType: 'info', note: '慢而稳 power2.inOut；一次只讲一个变化'},
{ id: 'system-diagram', says: '部件怎么连，数据怎么走', useWhen: '多步骤流程/架构', animation: 'fade', componentType: 'info', note: '动的是流，不是家具；一次聚焦一处'},
{ id: 'liquid-glass', says: '高级、现代、好用的消费品', useWhen: '消费级产品', animation: 'spring', componentType: 'title', note: '轻微过冲的弹性；玻璃元素宜少'},
{ id: 'photo-led', says: '真实世界，产品活在其中', useWhen: '有实拍/真图时', animation: 'fade', componentType: 'info', note: '图要调色一致；字别压在乱处'},
{ id: 'retro-digital', says: '懂文化的极客味', useWhen: '开发者工具/游戏', animation: 'wipe', componentType: 'title', note: '像素溶解/扫描线切场；别满屏 glitch'},
{ id: '3d-object', says: '贵气、有质感，纵深即价值', useWhen: '发布会式开场', animation: 'fade', componentType: 'title', note: '3D 里字难读清，慎用', avoidPackaging: true},
{ id: 'art-styles', says: '文化、惊喜，不止是工具', useWhen: '品牌片', animation: 'fade', componentType: 'title', note: '会破坏包装的品牌一致性，慎用', avoidPackaging: true},
{ id: 'character', says: '有情绪、有性格', useWhen: '故事/社交传播', animation: 'spring', componentType: 'title', note: '产品里没吉祥物时别用', avoidPackaging: true},
{ id: 'continuous-morph', says: '一套系统，一气呵成', useWhen: '片头 sting / 循环', animation: 'fade', componentType: 'title', note: '工艺片，不做日常叠加', avoidPackaging: true},
{ id: 'flat-world', says: '好奇心，看看里面', useWhen: '科普/教育', animation: 'fade', componentType: 'info', note: '与口播包装不是一个画风', avoidPackaging: true},
{ id: 'generative-field', says: '智能、涌现、氛围', useWhen: '背景/转场氛围', animation: 'none', componentType: 'title', note: '别拿它代替产品展示', avoidPackaging: true},
{ id: 'showreel', says: '看我多全能', useWhen: '能力展示', animation: 'fade', componentType: 'title', note: '讲的是制作者不是用户，别用', avoidPackaging: true},
])

/**
* talking-head template's 5 card elements -> componentType + animation.
* From templates/talking-head/template.json: "a name plate, count-up number
* cards, keyword 花字, a chapter card and a corner badge, each landing on a
* spoken word", exported "as transparent ProRes 4444".
*/
export const HUASHU_CARD_ELEMENTS = Object.freeze([
{ element: 'name-plate', cn: '名牌', componentType: 'title', animation: 'fadeUp', note: '人名/身份，贴人物旁'},
{ element: 'count-up-card', cn: '数字卡', componentType: 'highlight', animation: 'countUp', note: '数到口播说出的精确数字'},
{ element: 'keyword-huazi', cn: '关键词花字', componentType: 'highlight', animation: 'slam', note: '一句话只砸一个词'},
{ element: 'chapter-card', cn: '章节卡', componentType: 'title', animation: 'wipe', note: '段落切换，一屏一个主张'},
{ element: 'corner-badge', cn: '角标', componentType: 'info', animation: 'fade', note: '小信息，别抢戏'},
])

/**
* Locked style presets distilled from huashu templates.
* Same color discipline as 'neutral-editorial' (white / gold accent / dark):
* the AI copies all four values verbatim, never invents colors or sizes.
* Merged into STYLE_PRESETS by packaging-plan.js.
*/
export const HUASHU_STYLE_PRESETS = Object.freeze({
// talking-head: cards over a real recording — slightly larger than neutral
// for readability over video, same disciplined palette.
'huashu-talking-head': Object.freeze({
title: Object.freeze({ fontSize: 56, color: '#ffffff', accent: '#e6b94e', background: '#1f2728'}),
highlight: Object.freeze({ fontSize: 40, color: '#ffffff', accent: '#e6b94e', background: '#1f2728'}),
info: Object.freeze({ fontSize: 30, color: '#ffffff', accent: '#e6b94e', background: '#1f2728'}),
}),
// kinetic-type: scale contrast — one big punch word per screen.
'huashu-kinetic': Object.freeze({
title: Object.freeze({ fontSize: 96, color: '#ffffff', accent: '#e6b94e', background: '#1f2728'}),
highlight: Object.freeze({ fontSize: 44, color: '#ffffff', accent: '#e6b94e', background: '#1f2728'}),
info: Object.freeze({ fontSize: 30, color: '#ffffff', accent: '#e6b94e', background: '#1f2728'}),
}),
})
export const HUASHU_STYLE_PRESET_IDS = Object.freeze(['huashu-talking-head', 'huashu-kinetic'])

/** True when the animation value is in the legal vocabulary. */
export function isLegalAnimation(value) {
return HUASHU_ANIMATION_SET.has(value)
}

/**
* Style guide prompt section, injected into the AI suggestion system prompt
* by video-packaging-model.ts (after the three library card guides).
*/
export const HUASHU_STYLE_PROMPT = [
'【风格指南 · huashu-motion 设计语言】',
'style / animation 不许自由发挥，只能从下面取值（防 AI 味）：',
'',
'1. animation 只能是这 8 个之一：',
' fadeUp 淡入上移（默认，名牌式克制）/ fade 柔和淡入 / none 无动画 /',
' slam 重拍砸入（金句/关键词）/ countUp 数字滚动（数到精确值）/',
' wordSwap 句中换词 / wipe 色带划过（章节切换）/ spring 弹性入场（清单/卡片）',
'',
'2. 口播在说什么 → 用什么动效：',
' - 标题/人名/章节名牌 → fadeUp',
' - 数字上涨、滚动到数 → countUp',
' - 金句、关键词砸出来 → slam',
' - 章节切换、承上启下 → wipe',
' - 清单/步骤逐项出现 → spring',
' - 句中换一个词强调 → wordSwap',
' - 普通叙述/过渡 → fade 或 none（留白，不抢戏）',
'',
'3. 节制铁律（talking-head）：真人出镜时约 4 秒才上一个元素，别堆；',
' 一屏只讲一个主张；数字不许编造。',
'',
'4. style 四个值必须从锁定预设一字不差地抄：',
' neutral-editorial（默认）/ huashu-talking-head（口播卡片）/ huashu-kinetic（大字主张）；',
' 不许自填颜色、字号、背景。',
].join('\n')
