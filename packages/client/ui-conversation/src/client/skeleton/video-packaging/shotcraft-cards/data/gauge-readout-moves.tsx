// ─── 改编来源 ───
// video-shotcraft (Apache License 2.0) · https://github.com/Vincentwei1021/video-shotcraft
// 原卡: demos/data/gauge-readout-moves/
//   - NeedleSweepSelftest.tsx（指针自检扫表）
//   - TapeScrollFixedPointer.tsx（刻度带滚动定针）
// 参考: references/shots/data/gauge-readout-moves.md
// 改动:
//  1. 两式合一文件，variant 参数切换：'needle-sweep-selftest' | 'tape-scroll-fixed-pointer'
//  2. 硬编码文案提为带默认值的 props：title（A 标题）/ node（A 节点名）/
//     sensors（A 传感器数）/ metric（B 指标名）/ brand
//  3. 去掉 video-shotcraft 品牌（ShotcraftMark → 中性圆点；BRAND.name → brand prop）
//  4. 去掉 Backdrop/Stage，改为透明底；A 为暗场设计宜叠暗画面，B 为浅场设计宜叠浅画面
//  5. 节奏命门保持常量（A：指针扫表自检时序；B：刻度带滚动定针时序）
//  6. duration prop：两变体尾 8f 淡出跟 duration 走（不传则无淡出）

import React from 'react';
import { AbsoluteFill, spring, useCurrentFrame } from 'remotion';
import { Backdrop, EASE, FONT, Grain, mix, ramp, softShadow, tracking } from '../_fixtures/Polish';
import { EASE, FONT, SpeedBlur, bezier, mix, ramp, velocity } from '../_fixtures/Polish';
import { LOOKS, Stage, TextReveal, alpha, type } from '../_fixtures/Look';

export const NEEDLE_SWEEP_SELFTEST_DURATION = 140; // f60 后真静止 80f

const AMBER = '#f59e0b';
const AMBER_HI = '#fcd34d';
const RED = '#ef4444';
const INK1 = '#f3f4f7';
const INK3 = '#737885';

const CARD_W = 1500;
const CARD_H = 640;
const CARD_X = (1920 - CARD_W) / 2;
const CARD_Y = (1080 - CARD_H) / 2 + 10;

const GA_W = CARD_W / 3; // 每表盘占位宽
const R = 148;
const CX = GA_W / 2;
const CY = 220;

// 表盘角 d∈[0,270] → SVG 角 a = 135 + d（0=右，顺时针，y 向下）
const polar = (a: number, r: number): [number, number] => [
  CX + r * Math.cos((a * Math.PI) / 180),
  CY + r * Math.sin((a * Math.PI) / 180),
];

const arcPath = (d0: number, d1: number, r: number): string => {
  const [x0, y0] = polar(135 + d0, r);
  const [x1, y1] = polar(135 + Math.max(d0 + 0.01, d1), r);
  const large = d1 - d0 > 180 ? 1 : 0;
  return `M ${x0.toFixed(2)} ${y0.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
};

// 三表：点火 f12，错峰 4f
const GAUGES = [
  { start: 12, target: 190, name: 'CPU' },
  { start: 16, target: 120, name: 'GPU' },
  { start: 20, target: 235, name: 'Network' },
];

// 回程弹簧：按"落过头 8°"反算阻尼比 ζ（超调比 p = 8/行程，ζ = -ln p / √(π² + ln² p)）
const STIFF = 120;
const dampingFor = (target: number) => {
  const p = Math.min(0.5, 8 / (270 - target));
  const lp = Math.log(p);
  const zeta = -lp / Math.sqrt(Math.PI * Math.PI + lp * lp);
  return 2 * zeta * Math.sqrt(STIFF);
};

const needleAngle = (frame: number, s: number, target: number): number => {
  if (frame <= s) return 0;
  if (frame <= s + 12) return 270 * ramp(frame, s, 12, (x) => 1 - Math.pow(1 - x, 3)); // 去程：甩满全弧，起步猛
  if (frame >= s + 46) return target; // 真静止：直接锁死常数
  const k = spring({ frame: frame - (s + 12), fps: 30, config: { stiffness: STIFF, damping: dampingFor(target), mass: 1 } });
  return mix(270, target, k);
};

const Gauge: React.FC<{ start: number; target: number; name: string }> = ({ start, target, name }) => {
  const frame = useCurrentFrame();
  const d = needleAngle(frame, start, target);
  const dPrev = needleAngle(frame - 1, start, target);
  const settle = start + 32;
  const value = Math.round((target / 270) * 100);

  const pop = ramp(frame, settle, 9, EASE.overshoot);
  const popOp = ramp(frame, settle, 4, EASE.out);
  const nameOp = ramp(frame, settle + 3, 10, EASE.out);

  // 表盘点亮：点火时表面与外环亮起
  const on = ramp(frame, start - 4, 10, EASE.out);
  // 去程扫过的刻度依次点亮，满弧后 24f 内回落到常态亮度
  const swept = frame <= start + 12 ? d : 270;
  const calm = ramp(frame, start + 12, 24, EASE.smooth);

  const ticks: React.ReactNode[] = [];
  for (let k = 0; k <= 30; k++) {
    const dd = k * 9;
    const major = k % 3 === 0;
    const a = 135 + dd;
    const [x0, y0] = polar(a, R - 10);
    const [x1, y1] = polar(a, major ? R - 30 : R - 20);
    const lit = swept >= dd - 0.5 ? 1 - calm : 0;
    const red = dd >= 225;
    const base = red ? 0.55 : 0.22;
    ticks.push(
      <line
        key={k}
        x1={x0}
        y1={y0}
        x2={x1}
        y2={y1}
        stroke={red ? RED : '#ffffff'}
        strokeOpacity={(base + (red ? 0.4 : 0.6) * lit) * on}
        strokeWidth={major ? 3 : 1.6}
        strokeLinecap="round"
      />,
    );
    if (major) {
      const [lx, ly] = polar(a, R - 52);
      ticks.push(
        <text
          key={`l${k}`}
          x={lx}
          y={ly}
          textAnchor="middle"
          dominantBaseline="central"
          fontFamily={FONT.sans}
          fontSize={16}
          fontWeight={500}
          fill={red ? '#f87171' : '#ffffff'}
          fillOpacity={(red ? 0.7 : 0.38 + 0.4 * lit) * on}
          style={{ fontVariantNumeric: 'tabular-nums' }}
        >
          {(k / 3) * 10}
        </text>,
      );
    }
  }

  // 锥形指针（局部坐标：沿 +x 指向 0° 方向，再整体 rotate）
  const needle = (deg: number, opacity: number, key?: string) => {
    const [tx, ty] = polar(135, R - 13);
    const len = Math.hypot(tx - CX, ty - CY);
    return (
      <g key={key} transform={`rotate(${(135 + deg).toFixed(3)} ${CX} ${CY})`} opacity={opacity}>
        <path
          d={`M ${CX - 34} ${CY - 5} L ${CX + len} ${CY - 1.6} Q ${CX + len + 3.5} ${CY} ${CX + len} ${CY + 1.6} L ${CX - 34} ${CY + 5} Z`}
          fill="url(#nssNeedle)"
        />
      </g>
    );
  };
  const dv = d - dPrev;
  const ghosts = Math.abs(dv) > 4 ? [1, 2, 3, 4].map((g) => needle(d - (dv * g) / 4, 0.16 * (1 - g / 5), `gh${g}`)) : null;

  return (
    <div style={{ width: GA_W, height: 500, position: 'relative' }}>
      <svg width={GA_W} height={420} style={{ overflow: 'visible' }}>
        <defs>
          <linearGradient id="nssNeedle" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#b45309" />
            <stop offset="0.55" stopColor={AMBER} />
            <stop offset="1" stopColor={AMBER_HI} />
          </linearGradient>
          <radialGradient id="nssHub" cx="0.38" cy="0.32" r="0.7">
            <stop offset="0" stopColor="#6b7080" />
            <stop offset="1" stopColor="#1c1d23" />
          </radialGradient>
          <radialGradient id="nssFace" cx="0.5" cy="0.42" r="0.6">
            <stop offset="0" stopColor="#ffffff" stopOpacity={0.05} />
            <stop offset="1" stopColor="#ffffff" stopOpacity={0.01} />
          </radialGradient>
          <filter id="nssGlow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="6" />
          </filter>
        </defs>
        {/* 表面：淡径向 + 发丝外环 */}
        <circle cx={CX} cy={CY} r={R + 20} fill="url(#nssFace)" stroke="#ffffff" strokeOpacity={0.07 * on} strokeWidth={1} opacity={on} />
        {/* 弧形轨道 + 红区 */}
        <path d={arcPath(0, 270, R)} fill="none" stroke="#ffffff" strokeOpacity={0.07} strokeWidth={8} strokeLinecap="round" />
        <path d={arcPath(225, 270, R)} fill="none" stroke={RED} strokeOpacity={0.45 * on} strokeWidth={8} strokeLinecap="round" />
        {/* 跟随指针的琥珀亮弧（柔光层 + 实线层） */}
        {d > 0.5 && (
          <>
            <path d={arcPath(0, d, R)} fill="none" stroke={AMBER} strokeOpacity={0.45} strokeWidth={10} strokeLinecap="round" filter="url(#nssGlow)" />
            <path d={arcPath(0, d, R)} fill="none" stroke={AMBER} strokeWidth={8} strokeLinecap="round" />
          </>
        )}
        {ticks}
        {/* 指针：角向拖影 + 发光 + 本体 */}
        {ghosts}
        <g filter="url(#nssGlow)" opacity={0.55}>
          {needle(d, 1)}
        </g>
        {needle(d, 1)}
        <circle cx={CX} cy={CY} r={19} fill="url(#nssHub)" stroke="#ffffff" strokeOpacity={0.12} strokeWidth={1} />
        <circle cx={CX} cy={CY} r={6} fill={AMBER} />
      </svg>
      {/* 落定同帧弹出的数值 + 指标名 */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: 340,
          textAlign: 'center',
          opacity: popOp,
          transform: `scale(${mix(0.4, 1, pop).toFixed(4)})`,
          fontFamily: FONT.sans,
          whiteSpace: 'nowrap',
        }}
      >
        <span style={{ fontWeight: 700, fontSize: 64, color: INK1, letterSpacing: tracking(64), fontVariantNumeric: 'tabular-nums' }}>{value}</span>
        <span style={{ fontWeight: 600, fontSize: 30, color: INK3, marginLeft: 6 }}>%</span>
      </div>
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: 424,
          textAlign: 'center',
          opacity: nameOp,
          transform: `translateY(${mix(6, 0, nameOp)}px)`,
          fontFamily: FONT.sans,
          fontSize: 22,
          fontWeight: 600,
          letterSpacing: tracking(22, true),
          textTransform: 'uppercase',
          color: INK3,
        }}
      >
        {name}
      </div>
    </div>
  );
};

export const NeedleSweepSelftest: React.FC<{
  title?: string; node?: string; sensors?: string; brand?: string; duration?: number;
}> = ({ title = '{title}', node = 'render-node-02', sensors = '3 sensors', brand = 'Studio', duration }) => {
  const frame = useCurrentFrame();
  const tailFade = duration ? 1 - ramp(frame, duration - 8, 8, EASE.out) : 1;
  const inP = ramp(frame, 0, 12, EASE.snappy);
  const done = ramp(frame, 60, 8, EASE.out); // 全部落定后状态切换
  const pulse = 0.5 + 0.5 * Math.cos((frame / 14) * Math.PI);
  return (
    <AbsoluteFill style={{ background: 'transparent', overflow: 'hidden', fontFamily: FONT.sans, opacity: tailFade }}>
      <div
        style={{
          position: 'absolute',
          left: CARD_X,
          top: CARD_Y,
          width: CARD_W,
          height: CARD_H,
          background: 'linear-gradient(180deg, #1a1c22 0%, #141519 100%)',
          border: '1px solid rgba(255,255,255,0.07)',
          borderRadius: 26,
          boxSizing: 'border-box',
          boxShadow: `inset 0 1px 0 rgba(255,255,255,0.06), ${softShadow(40, { color: '#000000', strength: 2.2 })}`,
          opacity: inP,
          transform: `translateY(${mix(18, 0, inP).toFixed(2)}px)`,
        }}
      >
        {/* 卡头：标题 + 自检状态胶囊 */}
        <span style={{ position: 'absolute', left: 40, top: 30, width: 62, height: 62, borderRadius: '50%', background: '#3a3f4a', opacity: 0.6, display: 'inline-block' }} />
        <div style={{ position: 'absolute', left: 122, top: 36 }}>
          <div style={{ fontSize: 32, fontWeight: 650, color: INK1, letterSpacing: tracking(32) }}>{title}</div>
          <div style={{ marginTop: 7, fontSize: 19, fontWeight: 500, color: INK3 }}>
            <span style={{ fontWeight: 600, color: '#a3a8b4' }}>{brand}</span> · {node} · {sensors}
          </div>
        </div>
        <div
          style={{
            position: 'absolute',
            right: 44,
            top: 42,
            height: 40,
            padding: '0 16px 0 13px',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            borderRadius: 20,
            background: done > 0.5 ? 'rgba(52,211,153,0.10)' : 'rgba(245,158,11,0.10)',
            border: `1px solid ${done > 0.5 ? 'rgba(52,211,153,0.25)' : 'rgba(245,158,11,0.25)'}`,
            fontSize: 18,
            fontWeight: 600,
            color: done > 0.5 ? '#6ee7b7' : '#fbbf24',
            whiteSpace: 'nowrap',
          }}
        >
          <span
            style={{
              width: 9,
              height: 9,
              borderRadius: 5,
              background: done > 0.5 ? '#34d399' : AMBER,
              opacity: done > 0.5 ? 1 : 0.45 + 0.55 * pulse,
            }}
          />
          {done > 0.5 ? 'Ready to render' : 'Running self-test…'}
        </div>
        {/* 分隔发丝线 */}
        <div style={{ position: 'absolute', left: 44, right: 44, top: 122, height: 1, background: 'rgba(255,255,255,0.06)' }} />
        <div style={{ position: 'absolute', left: 0, top: 136, display: 'flex' }}>
          {GAUGES.map((g, i) => (
            <Gauge key={i} start={g.start} target={g.target} name={g.name} />
          ))}
        </div>
      </div>
      <Grain opacity={0.07} blend="soft-light" />
    </AbsoluteFill>
  );
};


export const TAPE_SCROLL_FIXED_POINTER_DURATION = 150;

const L = LOOKS.porcelain;
const PXU = 5; // px / 单位：每 10 单位一刻 = 50px
const BCY = 540; // 指针中线（屏幕 y）
const TAPE_X = 1000; // 刻度带左缘
const TAPE_W = 520;
const TICK_R = TAPE_X + TAPE_W - 40; // 刻度右端（向左伸）
const NUM_R = TAPE_X + 310; // 数字右对齐线
const WIN_X = TAPE_X - 30; // 读数窗
const WIN_W = 400;
const WIN_H = 150;
const OLD_LIMIT = 140; // 旧上限 140k ×3 = 新上限 420k（▲200%）
const NEW_LIMIT = 420;

const SPRINT = bezier(0.55, 0, 0.25, 1); // 冲刺：猛加速、长刹车
// 回摆弹簧：444 → 420，回摆到 416（超调 4/24 ≈ 17%）→ 反算阻尼
const SET_STIFF = 140;
const SET_DAMP = (() => {
  const lp = Math.log(4 / 24);
  return 2 * (-lp / Math.sqrt(Math.PI * Math.PI + lp * lp)) * Math.sqrt(SET_STIFF);
})();

// 读数时间线（纯帧函数，全部钳位）
const valueAt = (f: number): number => {
  if (f <= 10) return 60;
  if (f <= 48) return mix(60, 122, ramp(f, 10, 38, EASE.swift));
  if (f <= 56) return 122;
  if (f <= 61) return mix(122, 117, ramp(f, 56, 5, EASE.smooth));
  if (f <= 83) return mix(117, 444, SPRINT((f - 61) / 22));
  if (f >= 110) return NEW_LIMIT;
  return mix(444, NEW_LIMIT, spring({ frame: f - 83, fps: 30, config: { stiffness: SET_STIFF, damping: SET_DAMP, mass: 1 } }));
};

export const TapeScrollFixedPointer: React.FC<{
  metric?: string; brand?: string; duration?: number;
}> = ({ metric = 'frames / hour', brand = 'Studio', duration }) => {
  const frame = useCurrentFrame();
  const tailFade = duration ? 1 - ramp(frame, duration - 8, 8, EASE.out) : 1;
  const v = valueAt(frame);
  const vy = velocity((f) => valueAt(f) * PXU, frame); // 刻度带速度（px/帧）
  const speed = Math.abs(vy);
  const yOf = (u: number) => BCY + (v - u) * PXU; // 单位 u 的屏幕 y（大数在上）

  // 刻度（只画视野内的）
  const ticks: React.ReactNode[] = [];
  const uMin = Math.floor((v - 130) / 10) * 10;
  for (let u = Math.max(0, uMin); u <= v + 130; u += 10) {
    const y = yOf(u);
    const major = u % 50 === 0;
    ticks.push(
      <div key={`t${u}`} style={{
        position: 'absolute', left: TICK_R - (major ? 150 : 70), top: y - (major ? 2 : 1), width: major ? 150 : 70, height: major ? 4 : 2,
        borderRadius: 2, background: major ? L.ink : alpha(L.ink, 0.32),
      }} />,
    );
    if (major) {
      // 数字滑到读数窗背后前淡出（不从窗沿露出半截）
      const near = Math.min(1, Math.max(0, (Math.abs(y - BCY) - WIN_H / 2 - 36) / 30));
      ticks.push(
        <div key={`n${u}`} style={{ opacity: near,
          position: 'absolute', left: NUM_R - 260, width: 260, top: y - 40, height: 80, lineHeight: '80px', textAlign: 'right',
          ...type(64, 600), letterSpacing: '-0.03em', color: alpha(L.ink, 0.82),
        }}>{u}</div>,
      );
    }
  }

  // 旧上限线：52f 断开淡出（两半各自向外滑开）
  const brk = ramp(frame, 52, 14, EASE.out);
  const oldY = yOf(OLD_LIMIT);
  // 新上限 bug：随带滚动，落定后 bug 与指针重合时亮起
  const newY = yOf(NEW_LIMIT);
  const locked = ramp(frame, 104, 10, EASE.out);

  const head = ramp(frame, 0, 20, EASE.snappy);
  const push = 1 + 0.025 * ramp(frame, 90, 60, EASE.smooth);
  const readBlur = Math.min(6, speed * 0.06);
  const chip = ramp(frame, 108, 14, EASE.overshoot);
  const recap = ramp(frame, 114, 16, EASE.out);
  const glowK = Math.min(1, speed / 60); // 冲刺时读数窗的钴蓝外发光

  return (
    <AbsoluteFill style={{ fontFamily: FONT.sans, overflow: 'hidden' , opacity: tailFade }}>
      <div style={{ position: 'absolute', inset: 0, transform: `scale(${push.toFixed(4)})`, transformOrigin: '62% 50%' }}>
        {/* ── 世界层：刻度带（整体在动）── */}
        <div style={{
          position: 'absolute', left: TAPE_X, top: 0, width: TAPE_W, height: 1080,
          WebkitMaskImage: 'linear-gradient(180deg, transparent 0%, #000 22%, #000 78%, transparent 100%)',
          maskImage: 'linear-gradient(180deg, transparent 0%, #000 22%, #000 78%, transparent 100%)',
        }}>
          {/* 带面：微渐变白 + 左右发丝线 */}
          <div style={{
            position: 'absolute', inset: 0, background: `linear-gradient(90deg, ${alpha('#ffffff', 0.35)} 0%, ${alpha('#ffffff', 0.85)} 60%, ${alpha('#ffffff', 0.6)} 100%)`,
            borderLeft: `1px solid ${L.line}`, borderRight: `1px solid ${L.line}`,
          }} />
        </div>
        <div style={{
          position: 'absolute', inset: 0,
          WebkitMaskImage: 'linear-gradient(180deg, transparent 2%, #000 24%, #000 76%, transparent 98%)',
          maskImage: 'linear-gradient(180deg, transparent 2%, #000 24%, #000 76%, transparent 98%)',
        }}>
          <SpeedBlur vx={0} vy={vy} amount={0.12} max={12}>
            {ticks}
            {/* 旧上限：虚线 + 标签，升级后断开 */}
            {brk < 1 && oldY > -40 && oldY < 1120 && (
              <>
                <div style={{
                  position: 'absolute', left: TAPE_X - 10 - brk * 80, top: oldY - 1.5, width: TAPE_W / 2 + 10, height: 3, opacity: 1 - brk,
                  backgroundImage: `repeating-linear-gradient(90deg, ${L.ink2} 0 14px, transparent 14px 24px)`,
                }} />
                <div style={{
                  position: 'absolute', left: TAPE_X + TAPE_W / 2 + brk * 80, top: oldY - 1.5, width: TAPE_W / 2 - 16, height: 3, opacity: 1 - brk,
                  backgroundImage: `repeating-linear-gradient(90deg, ${L.ink2} 0 14px, transparent 14px 24px)`,
                }} />
                <div style={{
                  position: 'absolute', left: TAPE_X + TAPE_W + 28, top: oldY - 22, opacity: 1 - brk, whiteSpace: 'nowrap',
                  ...type(32, 600, { caps: true }), letterSpacing: '0.1em', color: L.ink2,
                }}>Old limit</div>
              </>
            )}
            {/* 新上限 bug：钴蓝三角，贴在刻度右缘 */}
            {newY > -60 && newY < 1140 && (
              <>
                <svg width={44} height={56} style={{ position: 'absolute', left: TICK_R + 6, top: newY - 28, overflow: 'visible' }}>
                  <path d="M 4 28 L 40 6 L 40 50 Z" fill={L.accent} stroke={L.accent} strokeWidth={6} strokeLinejoin="round" />
                </svg>
                <div style={{
                  position: 'absolute', left: TAPE_X + TAPE_W + 28, top: newY - 22, whiteSpace: 'nowrap',
                  ...type(32, 700, { caps: true }), letterSpacing: '0.1em', color: L.accent,
                  opacity: 0.55 + 0.45 * locked,
                }}>New limit</div>
              </>
            )}
          </SpeedBlur>
        </div>

        {/* ── 固定层：读数窗 + 指针缺口（针不动）── */}
        <div style={{
          position: 'absolute', left: WIN_X, top: BCY - WIN_H / 2, width: WIN_W, height: WIN_H, borderRadius: 26,
          background: `linear-gradient(180deg, ${L.accent} 0%, #2448d8 100%)`,
          boxShadow: `inset 0 1px 0 rgba(255,255,255,0.35), 0 24px 50px -16px ${alpha(L.shadow, 0.45)}, 0 4px 10px ${alpha(L.shadow, 0.16)}, 0 0 ${(30 + 50 * glowK).toFixed(1)}px ${alpha(L.accent, 0.18 + 0.32 * glowK)}`,
          overflow: 'hidden', opacity: head,
        }}>
          {/* 窗内读数（冲刺时按速度纵向模糊） */}
          <div style={{
            position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, display: 'flex', alignItems: 'baseline', justifyContent: 'flex-end',
            paddingRight: 48, paddingTop: 10, boxSizing: 'border-box', color: L.onAccent, whiteSpace: 'nowrap',
          }}>
            <span style={{ ...type(128, 700), letterSpacing: '-0.04em', lineHeight: '140px', filter: readBlur > 0.4 ? `blur(${readBlur.toFixed(2)}px)` : undefined }}>
              {Math.round(v)}
            </span>
            <span style={{ ...type(48, 600), marginLeft: 10, opacity: 0.75 }}>k</span>
          </div>
          {/* 窗面上沿高光 */}
          <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: '45%', background: 'linear-gradient(180deg, rgba(255,255,255,0.16), rgba(255,255,255,0))' }} />
        </div>
        {/* 指针：读数窗右侧伸向刻度的钴蓝细针 + 三角 */}
        <div style={{ position: 'absolute', left: WIN_X + WIN_W - 2, top: BCY - 2, width: TICK_R - (WIN_X + WIN_W) + 2, height: 4, background: L.accent, opacity: head, borderRadius: 2 }} />
        <svg width={40} height={44} style={{ position: 'absolute', left: WIN_X + WIN_W - 6, top: BCY - 22, overflow: 'visible', opacity: head }}>
          <path d="M 2 4 L 30 22 L 2 40 Z" fill={L.accent} stroke={L.accent} strokeWidth={4} strokeLinejoin="round" />
        </svg>
      </div>

      {/* ── 左侧排版 ── */}
      <div style={{ position: 'absolute', left: 150, top: 300, width: 760 }}>
        <div style={{ ...type(26, 650, { caps: true }), letterSpacing: '0.24em', color: L.accent, opacity: head, display: 'flex', alignItems: 'center', gap: 16 }}>
          <span style={{ width: 36, height: 3, background: L.accent, borderRadius: 2 }} />
          <span><span style={{ fontWeight: 700, textTransform: 'none', letterSpacing: '0.03em' }}>{brand}</span> · {metric}</span>
        </div>
        <div style={{ marginTop: 34, ...type(124, 750), color: L.ink }}>
          <TextReveal text="Throughput" by="word" variant="rise" start={2} each={18} gap={5} />
        </div>
        <div style={{ ...type(124, 750), color: L.accent, height: 130 }}>
          <TextReveal text="tripled." by="char" variant="rise" start={98} each={14} gap={1.6} />
        </div>
        <div style={{ marginTop: 40, height: 60, display: 'flex', alignItems: 'center', gap: 24 }}>
          <div style={{
            height: 60, padding: '0 24px', borderRadius: 30, display: 'flex', alignItems: 'center', background: alpha(L.accent2, 0.12),
            border: `1px solid ${alpha(L.accent2, 0.35)}`, color: '#00866f', ...type(34, 700), whiteSpace: 'nowrap',
            opacity: Math.min(1, chip * 1.5), transform: `scale(${mix(0.6, 1, chip).toFixed(4)})`, transformOrigin: '0% 50%',
          }}>▲ 200%</div>
          <div style={{ ...type(36, 500, { mono: true }), color: L.ink2, opacity: recap, transform: `translateX(${mix(-16, 0, recap).toFixed(2)}px)`, whiteSpace: 'nowrap' }}>
            140k → 420k
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};


export const GAUGE_READOUT_MOVES_DURATION = 150; // 两式中最长的 B；A=140

export interface GaugeReadoutMovesProps {
  /** 两式切换 */
  variant?: 'needle-sweep-selftest' | 'tape-scroll-fixed-pointer';
  /** A 的标题 */
  title?: string;
  /** A 的节点名 */
  node?: string;
  /** A 的传感器数 */
  sensors?: string;
  /** B 的指标名 */
  metric?: string;
  /** 字标 */
  brand?: string;
  /** 总时长（帧，30fps）；尾 8f 淡出 */
  duration?: number;
}

export const GAUGE_READOUT_MOVES_DEFAULTS: Required<GaugeReadoutMovesProps> = {
  variant: 'needle-sweep-selftest',
  title: 'Render node health',
  node: 'render-node-02',
  sensors: '3 sensors',
  metric: 'frames / hour',
  brand: 'Studio',
  duration: GAUGE_READOUT_MOVES_DURATION,
};

export const GAUGE_READOUT_MOVES_SCHEMA = [
  { type: 'select', key: 'variant', label: '两式', default: 'needle-sweep-selftest',
    options: ['needle-sweep-selftest', 'tape-scroll-fixed-pointer'], required: true },
  { type: 'text', key: 'title', label: '标题（A）', default: 'Render node health' },
  { type: 'text', key: 'node', label: '节点名（A）', default: 'render-node-02' },
  { type: 'text', key: 'sensors', label: '传感器（A）', default: '3 sensors' },
  { type: 'text', key: 'metric', label: '指标名（B）', default: 'frames / hour' },
  { type: 'text', key: 'brand', label: '字标', default: 'Studio' },
  { type: 'number', key: 'duration', label: '总时长', default: GAUGE_READOUT_MOVES_DURATION, min: 80, max: 400, step: 1, unit: '帧' },
] as const;

export const GaugeReadoutMoves: React.FC<GaugeReadoutMovesProps> = (props) => {
  const p = { ...GAUGE_READOUT_MOVES_DEFAULTS, ...props };
  switch (p.variant) {
    case 'tape-scroll-fixed-pointer':
      return <TapeScrollFixedPointer metric={p.metric} brand={p.brand} duration={p.duration} />;
    case 'needle-sweep-selftest':
    default:
      return <NeedleSweepSelftest title={p.title} node={p.node} sensors={p.sensors} brand={p.brand} duration={p.duration} />;
  }
};
