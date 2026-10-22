// ─── 改编来源 ───
// video-talkcraft (PolyForm Noncommercial 1.0.0) · https://github.com/Vincentwei1021/video-talkcraft
// 原卡: template/cards/split-compare-slider.tsx（只读来源，未修改原文件）
// 改动:
//  1. 根 AbsoluteFill 的整屏不透明底（#ffffff → 透明），改为透明叠加渲染用；
//  2. 整屏场景缩成浮动卡片：960×540 原场景（含原底色 #ffffff）整体缩至 880×495，
//     置于圆角 28px + 轻阴影的面板内居中悬浮（双满铺对比 → 浮动面板；圆角把对比滑杆收成小组件感，分割线/圆钮/标签机制不变）；
//     卡片本体（动效时序/CONFIG/props 接口/内部几何）逐字保留，未动。
import React from "react";
import { AbsoluteFill, Img, useCurrentFrame } from "remotion";

// split-compare-slider · 对比双分屏（滑动揭示）—— 自包含 Remotion 源码（与 demos/split-compare-slider/index.html 同画面）
// 两张同构图的图叠放，上层 clip-path 裁掉右侧，分割线与裁切边由同一个进度值驱动：揭示 → 停 → nudge → 近端 → 回中 → 停 → 退场。
// 复制本文件进你的工程即可用；真图经 srcBefore / srcAfter 注入（不传 = 同一块灰调占位两套滤镜，保证 100% 同构图）。
export const meta = { width: 960, height: 540, fps: 30, durationInFrames: 296 };   // END 9.48s + 0.4s 收尾

const FPS = meta.fps;

// ——————————————————————————————————————————————————————————
// 可摘走的核心参数（与 demo 的 CONFIG 同名同注释）
// 命门：① 上层 clip-path 裁切，不是移动两张图——两图机位不变，观众比"内容"不比"位置"
//      ② 分割线与裁切边由同一个进度值 p（左图露出的百分比）驱动，永不错位
//      ③ 分割线必须动过（揭示 → nudge → 近端 → 回中），但不来回扫不停
//      ④ 标签只在该侧露出 ≥40% 时才显示
// ——————————————————————————————————————————————————————————
const CONFIG = {
  lead: 0.6,        // 起手：左图整屏停 0.6s，让观众先看清"前"
  slide: 1.4,       // 分割线从右端滑到中线（power3.inOut）
  hold: 1.5,        // 到中线后的停留（≥1.5，观众要来回看两边）
  mid: 50,          // 中线位置 %
  nudge: 42,        // 强调"看右边"的 nudge 位置 %（50 → 42 → 50）
  nudgeDur: 0.45,   // nudge 单程时长（power2.inOut）
  farLeft: 8,       // 近端位置 %：几乎全露右图
  farDur: 1.0,      // 滑到近端 / 回中的单程时长（power3.inOut）
  tailHold: 1.0,    // 回中后的有意停留（成片按口播伸缩）
  exit: 0.4,        // 全部一起退场（错峰 0.04）
  push: 1.04,       // 两图共用一条极慢推 1 → 1.04，时长 = 镜头
  showAt: 40,       // 标签显示阈值：该侧露出 ≥40% 才亮
};
/* 时间表（s）：0.6–2.0 揭示到 50 · 2.0–3.5 停 · 3.5–3.95 nudge 到 42 · 4.0–4.45 回 50
   · 4.5–5.5 滑到 8 · 5.5–7.0 停 · 7.0–8.0 回 50 · 8.0–9.0 停 · 9.0–9.48 退场（标签 / 分割线 / 两图错峰 0.04，END 9.48） */
const T = (() => {
  const slide = CONFIG.lead;                                  // 0.6
  const nudge = slide + CONFIG.slide + CONFIG.hold;           // 3.5
  const nudgeBack = nudge + CONFIG.nudgeDur + 0.05;           // 4.0
  const far = nudgeBack + CONFIG.nudgeDur + 0.05;             // 4.5
  const farBack = far + CONFIG.farDur + CONFIG.hold;          // 7.0
  const exit = farBack + CONFIG.farDur + CONFIG.tailHold;     // 9.0
  const end = exit + 0.08 + CONFIG.exit;                      // 9.48
  return { slide, nudge, nudgeBack, far, farBack, exit, end };
})();

// —— 缓动与 tween helper（对照 GSAP 名字）——
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const tw = (t: number, t0: number, d: number, ease: (x: number) => number) => ease(clamp01((t - t0) / d));
const lerp = (a: number, b: number, p: number) => a + (b - a) * p;
const linear = (x: number) => x;
const power2In = (x: number) => x * x * x;
const power2InOut = (x: number) => (x < 0.5 ? 4 * x ** 3 : 1 - Math.pow(-2 * x + 2, 3) / 2);
const power3InOut = (x: number) => (x < 0.5 ? 8 * x ** 4 : 1 - Math.pow(-2 * x + 2, 4) / 2);

/** p(t)：左图露出的百分比（100 = 左图整屏，0 = 右图整屏）——五段不重叠的 tween 链式求值 */
const progressAt = (t: number) => {
  let p = 100;
  p = lerp(p, CONFIG.mid, tw(t, T.slide, CONFIG.slide, power3InOut));
  p = lerp(p, CONFIG.nudge, tw(t, T.nudge, CONFIG.nudgeDur, power2InOut));
  p = lerp(p, CONFIG.mid, tw(t, T.nudgeBack, CONFIG.nudgeDur, power2InOut));
  p = lerp(p, CONFIG.farLeft, tw(t, T.far, CONFIG.farDur, power3InOut));
  p = lerp(p, CONFIG.mid, tw(t, T.farBack, CONFIG.farDur, power3InOut));
  return p;
};

// —— 演示语境（不属于动效）：样式照搬 demo（类名加 scs- 前缀）——
const CSS = `
* { margin: 0; padding: 0; box-sizing: border-box; }
.scs-pane { position: absolute; inset: 0; overflow: hidden; }
.scs-ph { position: absolute; inset: 0; overflow: hidden; }
.scs-ph::before { content: ""; position: absolute; inset: 0; }
.scs-ph.t1::before { background: linear-gradient(160deg, #a4b0c6, #7d8aa3); }
.scs-ph svg { position: absolute; left: 50%; top: 50%; width: 84px; height: 72px; transform: translate(-50%, -56%); opacity: .35; }
.scs-ph.before { filter: saturate(.3) brightness(.82) contrast(.9) grayscale(.4); }
.scs-ph.after  { filter: saturate(1.25) contrast(1.06); }
.scs-divider { position: absolute; top: 0; bottom: 0; width: 3px; margin-left: -1.5px; background: #ffffff; box-shadow: 0 0 18px rgba(0,0,0,.6); }
.scs-knob { position: absolute; top: 50%; left: 50%; width: 46px; height: 46px; margin: -23px 0 0 -23px; border-radius: 50%; background: #ffffff; box-shadow: 0 6px 20px rgba(0,0,0,.4); }
.scs-knob svg { position: absolute; left: 50%; top: 50%; width: 26px; height: 26px; transform: translate(-50%, -50%); }
.scs-lbl { position: absolute; top: 48px; font-size: 20px; font-weight: 700; color: #ffffff; padding: 6px 16px; border-radius: 999px; background: rgba(0,0,0,.45); white-space: nowrap; }
.scs-lbl.l { left: 48px; } .scs-lbl.r { right: 48px; }
`;

const GLYPH = (
  <svg viewBox="0 0 48 40" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinejoin="round">
    <rect x="2" y="2" width="44" height="36" rx="4" /><circle cx="16" cy="14" r="4" /><path d="M4 34 L18 22 L27 30 L34 24 L44 34" />
  </svg>
);

/** 素材占位：灰调渐变 + 相框图标；传 src 则铺真图（object-fit cover）。grade = 是否套"前 / 后"两套滤镜 */
const Ph: React.FC<{ side: "before" | "after"; src?: string; grade: boolean; scale: number }> = ({ side, src, grade, scale }) => (
  <div className={`scs-ph t1 ${grade ? side : ""}`} style={{ transform: `scale(${scale})`, transformOrigin: "50% 50%" }}>
    {src ? <Img src={src} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} /> : GLYPH}
  </div>
);

type Props = {
  /** "前"图（左，上层被裁切）；不传用灰调占位 */
  srcBefore?: string;
  /** "后"图（右，下层）；不传用灰调占位。只传一张（或两张相同）时自动套"前 / 后"两套滤镜演示调色 */
  srcAfter?: string;
  /** 两枚标签文案 */
  labelBefore?: string;
  labelAfter?: string;
};

export default function SplitCompareSlider({ srcBefore, srcAfter, labelBefore = "调色前", labelAfter = "调色后" }: Props) {
  const t = useCurrentFrame() / FPS;
  const p = progressAt(t);
  const grade = !srcBefore || !srcAfter || srcBefore === srcAfter;   // 占位 / 同一张图 → 套滤镜做"前后"
  const before = srcBefore || srcAfter, after = srcAfter || srcBefore;
  const push = lerp(1, CONFIG.push, tw(t, 0, T.end, linear));        // 极慢推：时长 = 镜头

  // 字与画同收：标签 → 分割线 → 两图，错峰 0.04
  const opLbl = 1 - tw(t, T.exit, CONFIG.exit, power2In);
  const opDiv = 1 - tw(t, T.exit + 0.04, CONFIG.exit, power2In);
  const opPane = 1 - tw(t, T.exit + 0.08, CONFIG.exit, power2In);

  return (
    <AbsoluteFill style={{ background: "transparent", color: "#1d1d1f", overflow: "hidden", fontFamily: '"PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif' }}>
      <style>{CSS}</style>
      {/* —— 浮动卡片改编（见文件头改动 2）：整屏场景等比缩进圆角面板 —— */}
      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ width: 880, height: 495, borderRadius: 28, overflow: "hidden", position: "relative", boxShadow: "0 4px 12px rgba(0,0,0,.32)" }}>
          <div style={{ position: "absolute", left: 0, top: 0, width: 960, height: 540, transform: "scale(0.91667)", transformOrigin: "0 0", background: "#ffffff", overflow: "hidden" }}>
      {/* 右图（"后"）在下 */}
      <div className="scs-pane" style={{ opacity: opPane }}><Ph side="after" src={after} grade={grade} scale={push} /></div>
      {/* 左图（"前"）在上，clip-path 裁掉右侧 (100 − p)% */}
      <div className="scs-pane" style={{ opacity: opPane, clipPath: `inset(0 ${100 - p}% 0 0)` }}><Ph side="before" src={before} grade={grade} scale={push} /></div>
      {/* 分割线 + 圆钮：与裁切边同一个 p */}
      <div className="scs-divider" style={{ left: `${p}%`, opacity: opDiv }}>
        <div className="scs-knob">
          <svg viewBox="0 0 26 26" fill="none" stroke="#1d1d1f" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M10 8 L5 13 L10 18" /><path d="M16 8 L21 13 L16 18" /></svg>
        </div>
      </div>
      {/* 标签：该侧露出 ≥40% 才显示 */}
      <div className="scs-lbl l" style={{ opacity: opLbl, visibility: p >= CONFIG.showAt ? "visible" : "hidden" }}>{labelBefore}</div>
      <div className="scs-lbl r" style={{ opacity: opLbl, visibility: 100 - p >= CONFIG.showAt ? "visible" : "hidden" }}>{labelAfter}</div>
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
}
