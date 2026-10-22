// ─── 改编来源 ───
// video-shotcraft (Apache License 2.0) · https://github.com/Vincentwei1021/video-shotcraft
// 原卡: demos/data/chart-live-moves/
//   - AxisRescaleShockV2.tsx（坐标轴爆表重定标）
//   - OscilloscopeStreamV2.tsx（示波器实时流）
//   - UnitDotSwarmRegroupV2.tsx（点群重组）
// 参考: references/shots/data/chart-live-moves.md
// 改动:
//  1. 三式合一文件，variant 参数切换：'axis-rescale-shock' | 'oscilloscope-stream' | 'unit-dot-swarm-regroup'
//  2. 硬编码文案提为带默认值的 props：data（A 数值序列）/ labels（A 月份）/
//     metric+period（A 眉题）/ caption（B 眉题副行）/ groups+values（C 分组名与数值）/ brand
//  3. 去掉 video-shotcraft 品牌（ShotcraftMark → 中性圆点；BRAND.name → brand prop）
//  4. 去掉 Stage，改为透明底；A/C 为浅场设计宜叠浅画面，B 为暗场设计宜叠暗画面
//  5. 节奏命门保持常量（A：SHOCK 爆表/重定标时序；B：写入头流速；C：M1/M2/M3 分组时序）
//  6. duration prop：三变体尾 8f 淡出跟 duration 走（不传则无淡出）

import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { EASE, bezier, mix, ramp } from '../_fixtures/Polish';
import { LOOKS, Stage, TextReveal, alpha, type } from '../_fixtures/Look';
import { EASE, FONT, mix, ramp } from '../_fixtures/Polish';
import { LOOKS, Stage, alpha, type } from '../_fixtures/Look';
import { AbsoluteFill, spring, useCurrentFrame } from 'remotion';
import { EASE, mix, ramp } from '../_fixtures/Polish';

export const AXIS_RESCALE_SHOCK_V2_DURATION = 168;

const L = LOOKS.sand;
const ACC = L.accent; // 赤陶：只给爆表段 / 事件
const INK = L.ink;

// 版式网格
const M = 96;
const X0 = 268; // 绘图区左
const X1 = 1800; // 绘图区右（Dec）
const PW = X1 - X0;
const CEIL = 362; // 天花板规线
const BASE = 902; // 基线
const PH = BASE - CEIL;
const SHOCK_TOP = CEIL - 226; // 冲出天花板 226px，扎进标题行

const DATA_FALLBACK = [22, 30, 26, 38, 35, 47, 44, 58, 55, 66, 72, 340];
/* N 改由组件内按 data 计算 */
const MONTHS_FALLBACK = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const DRAW0 = 14;
const DRAW1 = 56;
const WARN = 50;
const SHOCK0 = 62;
const SHOCK1 = 76;
const BEAT = 94;
const RESCALE1 = 108;
const MARK = 106;

// 冲顶：起步慢、越冲越快，到顶微过冲
const easeShock = bezier(0.7, 0, 0.36, 1.06);

/* xOf 改由组件内按 N 计算 */

export const AxisRescaleShockV2: React.FC<{
  data?: number[]; labels?: string[]; metric?: string; period?: string; brand?: string; duration?: number;
}> = ({ data = DATA_FALLBACK, labels = MONTHS_FALLBACK, metric = 'Renders', period = 'FY2026', brand = 'Studio', duration }) => {
  const frame = useCurrentFrame();
  const DATA = data.length >= 2 ? data : DATA_FALLBACK;
  const N = DATA.length;
  const MONTHS = labels.length ? labels : MONTHS_FALLBACK;
  const xOf = (i: number) => X0 + (i / (N - 1)) * PW;
  const tailFade = duration ? 1 - ramp(frame, duration - 8, 8, EASE.out) : 1;

  const rescaleP = ramp(frame, BEAT, RESCALE1 - BEAT, EASE.snappy);
  const range = mix(100, 400, rescaleP);
  const yOf = (v: number) => BASE - (v / range) * PH;

  // 历史段写入
  const drawT = ramp(frame, DRAW0, DRAW1 - DRAW0, EASE.swift) * (N - 2);
  const pts: Array<[number, number]> = [];
  for (let i = 0; i <= Math.floor(drawT); i++) pts.push([xOf(i), yOf(DATA[i])]);
  if (drawT < N - 2 && drawT > Math.floor(drawT)) {
    const i = Math.floor(drawT);
    const f = drawT - i;
    pts.push([mix(xOf(i), xOf(i + 1), f), mix(yOf(DATA[i]), yOf(DATA[i + 1]), f)]);
  }
  const lineD = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(2)},${y.toFixed(2)}`).join(' ');

  // 爆表段
  const shockT = ramp(frame, SHOCK0, SHOCK1 - SHOCK0, easeShock);
  const nx = xOf(N - 2);
  const ny = yOf(DATA[N - 2]);
  const topY = mix(SHOCK_TOP, yOf(DATA[N - 1]), rescaleP);
  const hx = mix(nx, X1, Math.min(1, shockT));
  const hy = mix(ny, topY, shockT);
  const shockOn = frame >= SHOCK0;

  // 面积（含爆表段）
  const all: Array<[number, number]> = shockOn ? [...pts, [hx, hy]] : pts;
  const areaD = all.length > 1
    ? `M${all[0][0]},${BASE} ` + all.map(([x, y]) => `L${x.toFixed(2)},${y.toFixed(2)}`).join(' ') + ` L${all[all.length - 1][0].toFixed(2)},${BASE} Z`
    : '';

  // 穿透天花板：线段与 y=CEIL 的交点
  const crossX = nx + ((ny - CEIL) / (ny - SHOCK_TOP)) * (X1 - nx);
  const pierced = shockOn && hy <= CEIL + 0.5 && rescaleP < 0.02;
  // 穿透帧（求一次）：shockT 使 hy 过 CEIL 的帧
  let PIERCE = SHOCK1;
  for (let f = SHOCK0; f <= SHOCK1; f += 0.25) {
    if (mix(ny, SHOCK_TOP, ramp(f, SHOCK0, SHOCK1 - SHOCK0, easeShock)) <= CEIL) { PIERCE = f; break; }
  }
  const sinceP = frame - PIERCE;
  const crack = sinceP >= 0 ? ramp(frame, PIERCE, 8, EASE.snappy) * (1 - ramp(frame, BEAT, 14, EASE.smooth)) : 0;

  // 图表震：阻尼正弦，穿透帧起 12f
  const kick = sinceP >= 0 && sinceP < 14 ? 10 * Math.exp(-sinceP / 3.4) * Math.sin(sinceP * 1.8) : 0;
  // KPI 被撞：冲到顶（SHOCK1）时向上一颤
  const sinceTop = frame - (SHOCK1 - 2);
  const kpiKick = sinceTop >= 0 && sinceTop < 16 ? -14 * Math.exp(-sinceTop / 3.8) * Math.cos(sinceTop * 1.5) : 0;

  const warn = ramp(frame, WARN, 10, EASE.out) * (1 - ramp(frame, BEAT, 12, EASE.out));
  const hang = shockOn ? ramp(frame, SHOCK1 - 4, 8, EASE.out) * (1 - ramp(frame, BEAT, 14, EASE.out)) : 0;
  const shockW = mix(12, 7, ramp(frame, BEAT, 16, EASE.out));

  const markS = ramp(frame, MARK, 12, EASE.overshoot);
  const ripple = ramp(frame, MARK + 2, 20, EASE.out);
  const valS = ramp(frame, MARK + 4, 14, EASE.overshoot);
  const totalP = ramp(frame, MARK + 2, 20, EASE.snappy);

  const rule = (d: number) => ramp(frame, d, 20, EASE.snappy);
  const cam = mix(1, 1.018, ramp(frame, 0, AXIS_RESCALE_SHOCK_V2_DURATION, EASE.smooth));

  const OLD = ['25k', '50k', '75k', '100k'];
  const NEW = ['100k', '200k', '300k', '400k'];
  const tickY = (i: number) => BASE - ((i + 1) / 4) * PH;

  // 碎屑（两片规线残段从穿透点弹飞）
  const shard = (k: number) => {
    if (sinceP < 0 || sinceP > 32) return null;
    const t = sinceP / 32;
    const dir = k % 2 === 0 ? -1 : 1;
    const sp = [1, 0.75, 0.55][k];
    const x = crossX + dir * (18 + 190 * sp * EASE.out(t));
    const y = CEIL - (170 - k * 40) * EASE.out(t) + 300 * t * t;
    const w = [40, 30, 18][k];
    return (
      <rect key={k} x={x - w / 2} y={y - 2} width={w} height={4} fill={ACC} opacity={1 - EASE.exit(t)}
        transform={`rotate(${dir * (240 - k * 50) * t} ${x} ${y})`} />
    );
  };

  return (
    <AbsoluteFill style={{ background: L.bg[1], overflow: 'hidden' , opacity: tailFade }}>

      <div style={{ position: 'absolute', inset: 0, transform: `scale(${cam})`, transformOrigin: '60% 45%' }}>
        {/* 标题行 */}
        <div style={{ position: 'absolute', left: M, top: 92, display: 'flex', alignItems: 'center', gap: 12, ...type(32, 650, { caps: true }), color: L.ink2, opacity: ramp(frame, 0, 12, EASE.out) }}>
          <span style={{ width: 38, height: 38, borderRadius: '50%', background: L.ink3, opacity: 0.5, display: 'inline-block', marginTop: -2 }} />
          <span style={{ fontWeight: 700, textTransform: 'none', letterSpacing: '0.03em', color: INK }}>{brand}</span>
          <span><span style={{ color: L.ink3 }}>·</span> {metric} <span style={{ color: L.ink3 }}>· {period}</span></span>
        </div>
        <div style={{ position: 'absolute', left: M - 6, top: 140, ...type(124, 850), color: INK }}>
          <TextReveal text="Monthly renders" by="word" variant="rise" start={2} each={18} gap={5} />
        </div>

        {/* 右上 KPI：爆表段会冲进这里 */}
        <div style={{ position: 'absolute', right: 1920 - 1824, top: 92, textAlign: 'right', opacity: ramp(frame, 6, 14, EASE.out) }}>
          <div style={{ ...type(32, 650, { caps: true }), color: totalP > 0.5 ? ACC : L.ink2 }}>FY total</div>
        </div>
        <div style={{
          position: 'absolute', right: 1920 - 1824, top: 140, ...type(124, 850), textAlign: 'right',
          color: totalP > 0.5 ? ACC : INK, transform: `translateY(${kpiKick.toFixed(2)}px)`, opacity: ramp(frame, 8, 14, EASE.out),
        }}>
          {Math.round(mix(493, 833, totalP))}k
        </div>

        {/* 图表组（震动只作用在这里） */}
        <div style={{ position: 'absolute', inset: 0, transform: `translateY(${kick.toFixed(2)}px)` }}>
          {/* 刻度 */}
          <div style={{ position: 'absolute', left: M, top: BASE - 48, width: 200, ...type(32, 500), color: L.ink2, opacity: rule(4) }}>0</div>
          {OLD.map((v, i) => {
            const sw = ramp(frame, BEAT + (3 - i) * 2, 12, EASE.snappy);
            const top = i === 3;
            return (
              <div key={i} style={{ position: 'absolute', left: M, top: tickY(i) - 48, width: 200, height: 40, opacity: rule(4 + i * 2) }}>
                <div style={{
                  position: 'absolute', inset: 0, ...type(32, top ? mix(500, 750, warn) : 500),
                  color: top && warn > 0.02 ? ACC : L.ink2, opacity: 1 - sw, transform: `translateY(${(sw * 46).toFixed(2)}px)`,
                  filter: sw > 0.02 && sw < 0.98 ? `blur(${(Math.sin(Math.PI * sw) * 3).toFixed(2)}px)` : undefined,
                }}>{v}</div>
                <div style={{
                  position: 'absolute', inset: 0, ...type(32, 500), color: L.ink2,
                  opacity: sw, transform: `translateY(${((sw - 1) * 46).toFixed(2)}px)`,
                  filter: sw > 0.02 && sw < 0.98 ? `blur(${(Math.sin(Math.PI * sw) * 3).toFixed(2)}px)` : undefined,
                }}>{NEW[i]}</div>
              </div>
            );
          })}

          {/* 月份 */}
          {MONTHS.map((m, i) => (
            <div key={m} style={{
              position: 'absolute', left: xOf(i) - 50, top: BASE + 22, width: 100, textAlign: 'center',
              ...type(32, i === N - 1 && shockOn ? 750 : 500), color: i === N - 1 && shockOn ? ACC : L.ink2,
              opacity: ramp(frame, 6 + i, 12, EASE.out),
            }}>{m}</div>
          ))}

          <svg width={1920} height={1080} style={{ position: 'absolute', inset: 0, overflow: 'visible' }}>
            <defs>
              <pattern id="arsHatch" width={12} height={12} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <line x1={0} y1={0} x2={0} y2={12} stroke={INK} strokeOpacity={0.16} strokeWidth={2} />
              </pattern>
              <filter id="arsGlow" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="10" />
              </filter>
            </defs>

            {/* 网格：基础 3 根 + 重标加密 4 根 */}
            {[0, 1, 2].map((i) => (
              <line key={`g${i}`} x1={M} x2={mix(M, 1824, rule(2 + i * 2))} y1={tickY(i)} y2={tickY(i)} stroke={INK} strokeOpacity={0.14} strokeWidth={1.5} />
            ))}
            {[0, 1, 2, 3].map((k) => {
              const d = ramp(frame, BEAT + 1 + k * 2, 12, EASE.snappy);
              const y = BASE - ((2 * k + 1) / 8) * PH;
              return d > 0 ? <line key={`d${k}`} x1={M} x2={mix(M, 1824, d)} y1={y} y2={y} stroke={INK} strokeOpacity={0.08} strokeWidth={1.5} strokeDasharray="2 8" /> : null;
            })}

            {/* 面积：45° 排线 */}
            {areaD && <path d={areaD} fill="url(#arsHatch)" />}

            {/* 基线 */}
            <line x1={M} x2={mix(M, 1824, rule(0))} y1={BASE} y2={BASE} stroke={INK} strokeWidth={3} />

            {/* 天花板规线：预警转赤陶，被穿透处裂开 */}
            {(() => {
              const c = warn > 0.02 ? ACC : INK;
              const xr = mix(M, 1824, rule(2));
              const gap = 26 * crack;
              const op = 0.85 + 0.15 * warn;
              if (crack <= 0.001) return <line x1={M} x2={xr} y1={CEIL} y2={CEIL} stroke={c} strokeOpacity={op} strokeWidth={3} />;
              return (
                <>
                  <line x1={M} x2={crossX - gap} y1={CEIL} y2={CEIL} stroke={c} strokeOpacity={op} strokeWidth={3} />
                  <line x1={crossX + gap} x2={xr} y1={CEIL} y2={CEIL} stroke={c} strokeOpacity={op} strokeWidth={3} />
                </>
              );
            })()}
            {shard(0)}
            {shard(1)}
            {shard(2)}

            {/* 历史折线 */}
            {lineD && <path d={lineD} fill="none" stroke={INK} strokeWidth={6} strokeLinejoin="round" strokeLinecap="round" />}
            {/* 历史段数据点 */}
            {pts.map(([x, y], i) => (i < pts.length - (drawT < N - 2 ? 1 : 0) ? <circle key={i} cx={x} cy={y} r={6} fill={L.bg[0]} stroke={INK} strokeWidth={3.5} /> : null))}
            {/* 写入笔尖 */}
            {frame >= DRAW0 && frame < DRAW1 + 1 && pts.length > 0 && (
              <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r={9} fill={INK} />
            )}
            {/* 预警脉冲：Nov 点 */}
            {frame >= WARN && frame < SHOCK0 + 6 && (() => {
              const t = ramp(frame, WARN, 16, EASE.out);
              return <circle cx={nx} cy={ny} r={mix(10, 46, t)} fill="none" stroke={ACC} strokeWidth={3} opacity={0.7 * (1 - t)} />;
            })()}

            {/* 爆表段 */}
            {shockOn && (
              <>
                {hang > 0.01 && <line x1={nx} y1={ny} x2={hx} y2={hy} stroke={ACC} strokeWidth={shockW + 16} strokeLinecap="round" opacity={0.35 * hang} filter="url(#arsGlow)" />}
                <line x1={nx} y1={ny} x2={hx} y2={hy} stroke={ACC} strokeWidth={shockW} strokeLinecap="round" />
                {markS <= 0 && <circle cx={hx} cy={hy} r={12} fill={L.bg[0]} stroke={ACC} strokeWidth={5} />}
              </>
            )}
            {pierced && sinceP < 10 && (
              <circle cx={crossX} cy={CEIL} r={mix(8, 70, ramp(frame, PIERCE, 10, EASE.out))} fill="none" stroke={ACC} strokeWidth={2.5}
                opacity={0.8 * (1 - ramp(frame, PIERCE, 10, EASE.out))} />
            )}

            {/* 端点标记 */}
            {markS > 0 && (
              <>
                {ripple < 1 && <circle cx={hx} cy={hy} r={mix(16, 64, ripple)} fill="none" stroke={ACC} strokeWidth={3} opacity={0.6 * (1 - ripple)} />}
                <circle cx={hx} cy={hy} r={15 * markS} fill={ACC} stroke={L.bg[0]} strokeWidth={5 * markS} />
              </>
            )}
          </svg>

          {/* 真值标签 */}
          {valS > 0 && (
            <div style={{
              position: 'absolute', left: hx - 40 - 330, top: hy - 70, width: 330, height: 140,
              transform: `scale(${valS.toFixed(4)})`, transformOrigin: '100% 50%', opacity: Math.min(1, valS * 1.6),
            }}>
              <div style={{
                position: 'absolute', inset: 0, background: ACC, borderRadius: 6, color: L.onAccent,
                display: 'flex', flexDirection: 'column', justifyContent: 'center', paddingLeft: 30,
                boxShadow: `0 18px 40px -12px ${alpha(L.shadow, 0.45)}`,
              }}>
                <div style={{ ...type(76, 850) }}>{DATA[DATA.length - 1]}k</div>
                <div style={{ ...type(32, 600), opacity: 0.9 * ramp(frame, MARK + 10, 10, EASE.out), marginTop: 4 }}>▲ 372% vs Nov</div>
              </div>
              <div style={{ position: 'absolute', right: -10, top: 60, width: 20, height: 20, background: ACC, transform: 'rotate(45deg)' }} />
            </div>
          )}
        </div>
      </div>
    </AbsoluteFill>
  );
};


export const OSCILLOSCOPE_STREAM_V2_DURATION = 165;

const BL = LOOKS.midnight;
const TRACE = BL.accent; // 电光蓝
const HOT = '#ff6b5b'; // 事件色：珊瑚红（只给尖峰）

// 绘图区
const PX = 96;
const BPW = 1728;
const PY = 404;
const BPH = 520;
const HEAD = Math.round(BPW * 0.86); // 写入头位置（绘图区内 x）

const SPEED = 8;
const FREEZE0 = 104;
const FREEZE1 = 118;
const OFFSET = 1400; // 世界坐标偏移：第 0 帧时窗口里已有完整历史

// 有效时间（世界 x）：匀速，FREEZE 段 out-cubic 刹停；刹车距离 = SPEED×dur/3（初速连续）
const worldAt = (f: number) => {
  if (f <= FREEZE0) return OFFSET + f * SPEED;
  const brake = (SPEED * (FREEZE1 - FREEZE0)) / 3;
  return OFFSET + FREEZE0 * SPEED + brake * ramp(f, FREEZE0, FREEZE1 - FREEZE0, (x) => 1 - Math.pow(1 - x, 3));
};

// 尖峰：写入头在 f46 起经过 worldX [S0, S0+SW]；主峰是一记尖锐的高斯脉冲（+2.2× 常态振幅），
// 前后各带一个小的前兆 / 余震，峰段内原波形抖动加倍
const S0 = OFFSET + 46 * SPEED;
const SW = 176;
const SC = S0 + SW * 0.5;
const gauss = (x: number, c: number, w: number) => Math.exp(-Math.pow((x - c) / w, 2));
const bump = (x: number) => 2.2 * gauss(x, SC, 26) + 0.45 * gauss(x, SC - 62, 18) + 0.6 * gauss(x, SC + 48, 20);
const burstK = (x: number) => Math.min(1, bump(x) / 2.2);
const wave = (x: number) =>
  0.34 * Math.sin(x * 0.019) + 0.27 * Math.sin(x * 0.047 + 1.7) + 0.18 * Math.sin(x * 0.011 + 4.2) + 0.11 * Math.sin(x * 0.083 + 2.3);
const inSpike = (x: number) => gauss(x, SC, SW * 0.45);
const signal = (x: number) => wave(x) * (1 + 0.6 * inSpike(x)) + bump(x);
const valueOf = (x: number) => 1350 + signal(x) * 560; // fps（渲染帧 / 秒）
const MAXV = 3000;
const yOf = (x: number) => BPH - (valueOf(x) / MAXV) * BPH;

const PEAK_X = (() => {
  let best = S0;
  for (let x = S0; x <= S0 + SW; x += 0.5) if (signal(x) > signal(best)) best = x;
  return best;
})();

const fmt = (n: number) => Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
const hexMix = (a: string, b: string, t: number) => {
  const p = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const A = p(a);
  const B = p(b);
  return `rgb(${A.map((v, i) => Math.round(v + (B[i] - v) * t)).join(',')})`;
};

export const OscilloscopeStreamV2: React.FC<{ brand?: string; caption?: string; duration?: number }> = ({
  brand = 'Studio', caption = 'render-farm · prod · fps', duration,
}) => {
  const frame = useCurrentFrame();
  const tailFade = duration ? 1 - ramp(frame, duration - 8, 8, EASE.out) : 1;
  const T = worldAt(frame); // 写入头的世界 x
  const worldOf = (px: number) => T - (HEAD - px);

  // 迹线采样（写入头以左）
  const STEP = 4;
  const pts: Array<[number, number, number]> = [];
  for (let px = 0; px <= HEAD; px += STEP) pts.push([px, yOf(worldOf(px)), worldOf(px)]);
  if (pts[pts.length - 1][0] !== HEAD) pts.push([HEAD, yOf(T), T]);
  const toD = (a: Array<[number, number, number]>) => a.map(([x, y], i) => `${i ? 'BL' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const lineD = toD(pts);
  const areaD = `${lineD} BL${HEAD},${BPH} L0,${BPH} Z`;
  const spike = pts.filter(([, , w]) => w >= S0 + 10 && w <= Math.min(T, S0 + SW - 10));
  const spikeD = spike.length > 1 ? toD(spike) : '';
  const headY = yOf(T);
  const freshD = toD(pts.filter(([x]) => x >= HEAD - 284));

  // 读数：每 3 帧采样保持（真仪表的刷新感）；尖峰包络驱动放大 + 变色
  const held = worldAt(Math.floor(frame / 3) * 3);
  // 读数热度：写入头附近 ±40px 的尖峰强度（峰前两帧就开始升温，峰后缓降）
  const spikeK = Math.max(burstK(T), 0.8 * burstK(T - 30), 0.5 * burstK(T - 60));
  const hot = EASE.out(Math.min(1, spikeK * 1.6));
  const readScale = 1 + 0.08 * spikeK;
  const p99 = Math.round(42 + 84 * spikeK + 2 * Math.sin(frame / 5));
  const errRate = (0.02 + 0.12 * spikeK).toFixed(2);

  const live = 1 - ramp(frame, FREEZE0, FREEZE1 - FREEZE0, EASE.out);
  const pulse = 0.5 + 0.5 * Math.cos((frame / 24) * Math.PI * 2);

  // 事件标签：写入头越过峰顶后弹出，钉在峰顶随流向左
  const peakPx = HEAD - (T - PEAK_X);
  const peakY = yOf(PEAK_X);
  const passF = (PEAK_X - OFFSET) / SPEED;
  const tagIn = ramp(frame, passF + 3, 14, EASE.overshoot);

  // 屏幕点亮
  const on = ramp(frame, 0, 16, EASE.snappy);
  const headIn = ramp(frame, 2, 16, EASE.out);

  // 刹停后缓推向尖峰
  const push = ramp(frame, FREEZE1 - 4, 165 - FREEZE1 + 4, EASE.smooth);
  const cam = mix(1, 1.025, push);
  const camOX = PX + mix(HEAD, peakPx, 0.6);
  const camOY = PY + BPH * 0.45;

  const gridV = 12;
  const gridH = 6;

  return (
    <AbsoluteFill style={{ background: BL.bg[1], overflow: 'hidden' , opacity: tailFade }}>

      <div style={{ position: 'absolute', inset: 0, transform: `scale(${cam.toFixed(5)})`, transformOrigin: `${camOX}px ${camOY}px` }}>
        {/* 眉题 + LIVE */}
        <div style={{ position: 'absolute', left: PX, top: 92, display: 'flex', alignItems: 'center', gap: 22, opacity: headIn }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ width: 40, height: 40, borderRadius: '50%', background: BL.ink3, opacity: 0.5, display: 'inline-block' }} />
            <span style={{ ...type(32, 700), letterSpacing: '0.03em', color: BL.ink }}>{brand}</span>
          </span>
          <span style={{ ...type(32, 500, { caps: true }), color: BL.ink3 }}>{caption}</span>
          <span style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '6px 16px 6px 12px', borderRadius: 99,
            background: live > 0.5 ? alpha(BL.accent2, 0.12) : alpha('#ffffff', 0.06),
            border: `1px solid ${live > 0.5 ? alpha(BL.accent2, 0.35) : alpha('#ffffff', 0.12)}`,
            ...type(26, 750, { caps: true }), color: live > 0.5 ? BL.accent2 : BL.ink3,
          }}>
            <span style={{
              width: 12, height: 12, borderRadius: 6, background: live > 0.5 ? BL.accent2 : BL.ink3,
              boxShadow: live > 0.5 ? `0 0 0 ${(3 + 5 * pulse).toFixed(1)}px ${alpha(BL.accent2, 0.25 * (1 - pulse))}` : 'none',
            }} />
            {live > 0.5 ? 'Live' : 'Paused'}
          </span>
        </div>

        {/* 大读数 */}
        <div style={{
          position: 'absolute', left: PX - 8, top: 140, display: 'flex', alignItems: 'baseline', gap: 22,
          transform: `scale(${readScale.toFixed(4)})`, transformOrigin: 'left bottom', opacity: headIn,
        }}>
          <span style={{
            ...type(176, 700), color: hexMix('#f2f5ff', HOT, hot),
            textShadow: hot > 0.02 ? `0 0 40px ${alpha(HOT, 0.35 * hot)}` : undefined,
          }}>{fmt(valueOf(held))}</span>
          <span style={{ ...type(48, 500), color: hexMix('#a9b4d0', HOT, hot) }}>fps</span>
        </div>

        {/* 右上副读数 */}
        <div style={{ position: 'absolute', right: 1920 - PX - BPW, top: 150, display: 'flex', gap: 72, opacity: ramp(frame, 6, 14, EASE.out) }}>
          {[
            { k: 'p99 frame time', v: `${p99}`, u: 'ms', hotK: hot },
            { k: 'Failed jobs', v: errRate, u: '%', hotK: hot * 0.8 },
          ].map((s) => (
            <div key={s.k} style={{ textAlign: 'right' }}>
              <div style={{ ...type(32, 500), color: BL.ink3 }}>{s.k}</div>
              <div style={{ marginTop: 8 }}>
                <span style={{ ...type(84, 650), color: hexMix('#f2f5ff', HOT, s.hotK) }}>{s.v}</span>
                <span style={{ ...type(36, 500), color: BL.ink2, marginLeft: 8 }}>{s.u}</span>
              </div>
            </div>
          ))}
        </div>

        {/* 示波屏 */}
        <div style={{ position: 'absolute', left: PX, top: PY, width: BPW, height: BPH }}>
          <svg width={BPW} height={BPH + 80} style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible' }}>
            <defs>
              <linearGradient id="osArea" x1="0" y1="0" x2="0" y2={BPH} gradientUnits="userSpaceOnUse">
                <stop offset="0" stopColor={TRACE} stopOpacity={0.3} />
                <stop offset="1" stopColor={TRACE} stopOpacity={0} />
              </linearGradient>
              <linearGradient id="osFade" x1="0" y1="0" x2={BPW} y2="0" gradientUnits="userSpaceOnUse">
                <stop offset="0" stopColor="#fff" stopOpacity={0} />
                <stop offset="0.14" stopColor="#fff" stopOpacity={1} />
                <stop offset="1" stopColor="#fff" stopOpacity={1} />
              </linearGradient>
              <mask id="osMask" maskUnits="userSpaceOnUse" x={-20} y={-200} width={BPW + 40} height={BPH + 300}>
                <rect x={-20} y={-200} width={BPW + 40} height={BPH + 300} fill="url(#osFade)" />
              </mask>
              <filter id="osGlowA" x="-10%" y="-30%" width="120%" height="160%"><feGaussianBlur stdDeviation="5" /></filter>
              <filter id="osGlowB" x="-10%" y="-40%" width="120%" height="180%"><feGaussianBlur stdDeviation="16" /></filter>
              <radialGradient id="osHead">
                <stop offset="0" stopColor="#ffffff" stopOpacity={1} />
                <stop offset="0.25" stopColor={hexMix('#5b8cff', HOT, hot)} stopOpacity={0.8} />
                <stop offset="1" stopColor={hexMix('#5b8cff', HOT, hot)} stopOpacity={0} />
              </radialGradient>
              <linearGradient id="osFresh" x1={HEAD - 280} y1="0" x2={HEAD} y2="0" gradientUnits="userSpaceOnUse">
                <stop offset="0" stopColor="#ffffff" stopOpacity={0} />
                <stop offset="1" stopColor="#ffffff" stopOpacity={0.95} />
              </linearGradient>
            </defs>

            {/* 刻度网：主格线 + 次格点阵 + 中心十字刻度；从中心展开 */}
            <g opacity={on}>
              {Array.from({ length: gridV + 1 }, (_, i) => {
                const x = (i / gridV) * BPW;
                const reach = (BPH / 2) * on;
                return <line key={`v${i}`} x1={x} x2={x} y1={BPH / 2 - reach} y2={BPH / 2 + reach} stroke={BL.accent} strokeOpacity={i === 0 || i === gridV ? 0.22 : 0.1} strokeWidth={1.2} />;
              })}
              {Array.from({ length: gridH + 1 }, (_, i) => {
                const y = (i / gridH) * BPH;
                const reach = (BPW / 2) * on;
                return <line key={`h${i}`} x1={BPW / 2 - reach} x2={BPW / 2 + reach} y1={y} y2={y} stroke={BL.accent} strokeOpacity={i === 0 || i === gridH ? 0.22 : 0.1} strokeWidth={1.2} />;
              })}
              {Array.from({ length: gridV * 5 + 1 }, (_, i) => (
                <line key={`tk${i}`} x1={(i / (gridV * 5)) * BPW} x2={(i / (gridV * 5)) * BPW} y1={BPH / 2 - (i % 5 ? 5 : 10)} y2={BPH / 2 + (i % 5 ? 5 : 10)} stroke={BL.accent} strokeOpacity={0.28} strokeWidth={1.2} />
              ))}
            </g>

            {/* 迹线：面积 + 两层泛光 + 实线（左端渐隐出画） */}
            <g mask="url(#osMask)">
              <path d={areaD} fill="url(#osArea)" />
              <path d={lineD} fill="none" stroke={TRACE} strokeWidth={10} opacity={0.5} filter="url(#osGlowB)" />
              <path d={lineD} fill="none" stroke={TRACE} strokeWidth={5} opacity={0.75} filter="url(#osGlowA)" />
              <path d={lineD} fill="none" stroke="#cfdcff" strokeWidth={3.5} strokeLinejoin="round" strokeLinecap="round" />
              {/* 最新 280px：磷光最亮的"新鲜"段 */}
              <path d={freshD} fill="none" stroke="url(#osFresh)" strokeWidth={4.5} strokeLinejoin="round" strokeLinecap="round" opacity={0.4 + 0.6 * live} />
              {spikeD && (
                <>
                  <path d={spikeD} fill="none" stroke={HOT} strokeWidth={14} opacity={0.55} filter="url(#osGlowB)" />
                  <path d={spikeD} fill="none" stroke={HOT} strokeWidth={5} strokeLinejoin="round" strokeLinecap="round" />
                </>
              )}
            </g>

            {/* 写入头：竖向扫描线 + 横向读数参考线 + 光斑 */}
            <line x1={HEAD} x2={HEAD} y1={0} y2={BPH} stroke={hexMix('#5b8cff', HOT, hot)} strokeOpacity={0.45 * live + 0.12} strokeWidth={1.5} />
            <line x1={HEAD} x2={BPW} y1={headY} y2={headY} stroke={hexMix('#cfdcff', HOT, hot)} strokeOpacity={0.4} strokeWidth={1.5} strokeDasharray="4 6" />
            <circle cx={HEAD} cy={headY} r={70} fill="url(#osHead)" opacity={0.55 * live} />
            <circle cx={HEAD} cy={headY} r={9} fill={hexMix('#ffffff', HOT, hot * 0.6)} stroke={BL.bg[1]} strokeWidth={3} />

            {/* 事件：峰顶标记 + 竖向落线 */}
            {tagIn > 0 && peakPx > 40 && (
              <g opacity={Math.min(1, tagIn * 1.5)}>
                <line x1={peakPx} x2={peakPx} y1={peakY + 14} y2={BPH} stroke={HOT} strokeOpacity={0.5} strokeWidth={1.5} strokeDasharray="3 5" />
                <circle cx={peakPx} cy={peakY} r={9 * tagIn} fill={HOT} stroke={BL.bg[1]} strokeWidth={3} />
              </g>
            )}

            {/* 时间轴 */}
            {['−50s', '−40s', '−30s', '−20s', '−10s', 'now'].map((t, i) => (
              <text key={t} x={(HEAD * (i + 1)) / 6} y={BPH + 52} textAnchor="middle" fill={i === 5 ? BL.ink2 : BL.ink3}
                style={{ ...type(32, 500), fontFamily: FONT.sans }} opacity={headIn}>{t}</text>
            ))}
          </svg>

          {/* y 轴刻度（屏内左上，压在主格线上方） */}
          {['3k', '2k', '1k'].map((t, i) => (
            <div key={t} style={{ position: 'absolute', left: 14, top: (i * 2 * BPH) / 6 + 8, ...type(28, 600), color: BL.ink3, opacity: on }}>{t}</div>
          ))}

          {/* 事件标签 */}
          {tagIn > 0 && peakPx > 40 && (
            <div style={{
              position: 'absolute', left: peakPx + 22, top: peakY - 36, height: 72, padding: '0 26px 0 20px',
              display: 'flex', alignItems: 'center', gap: 14, borderRadius: 14, whiteSpace: 'nowrap',
              background: `linear-gradient(180deg, ${alpha(HOT, 0.22)}, ${alpha(HOT, 0.12)})`, border: `1px solid ${alpha(HOT, 0.55)}`,
              boxShadow: `0 16px 40px -10px ${alpha('#000000', 0.6)}`,
              transform: `scale(${tagIn.toFixed(4)})`, transformOrigin: '0% 50%', opacity: Math.min(1, tagIn * 1.5),
            }}>
              <span style={{ ...type(32, 800, { caps: true }), color: HOT }}>Burst</span>
              <span style={{ ...type(32, 600), color: '#ffe3de' }}>{fmt(valueOf(PEAK_X))} fps</span>
            </div>
          )}
        </div>
      </div>
    </AbsoluteFill>
  );
};


export const UNIT_DOT_SWARM_REGROUP_V2_DURATION = 192;

const CL = LOOKS.porcelain;
const N = 320;
const R = 10; // 点半径

const M1 = 24;
const M2 = 62;
const M3 = 100;
const DUR = 24;
const STAG = 8;

// 三组：Promo 180 / Launch film 102 / Explainer 38
const GROUP_N = [180, 102, 38];
const GROUP_NAME_FALLBACK = ['Promo', 'Launch film', 'Explainer'];
const GROUP_VAL_FALLBACK = ['7,210', '4,102', '1,535'];
const COL: Array<[string, string]> = [
  ['#b9c3da', '#97a3c0'], // Promo：雾蓝灰
  ['#5b80ff', '#2348e8'], // Launch film：钴蓝（主角）
  ['#2b3554', '#121a33'], // Explainer：深海军蓝
];
const groupOf = (i: number) => (i < 180 ? 0 : i < 282 ? 1 : 2);
const idxIn = (i: number) => (i < 180 ? i : i < 282 ? i - 180 : i - 282);

const rnd = (i: number, salt: number) => {
  const x = Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453;
  return x - Math.floor(x);
};
type P2 = [number, number];

// 第 0 幕：散布（中心略密）
const scatter = (i: number): P2 => [
  200 + ((rnd(i, 1) + rnd(i, 11)) / 2) * 1520,
  330 + ((rnd(i, 2) + rnd(i, 12)) / 2) * 640,
];
const drift = (i: number, f: number): P2 => [9 * Math.sin(f / 21 + rnd(i, 8) * 6.28), 7 * Math.cos(f / 27 + rnd(i, 9) * 6.28)];

// 第 1 幕：三簇（向日葵螺旋紧密排布：等面积、不重叠，读起来是"一团被码好的人"）
const CC: P2[] = [[520, 650], [1000, 650], [1420, 650]];
const VOGEL = 12.6; // r_k = VOGEL·√k ≈ 每点占 500px²
const CR = GROUP_N.map((n) => VOGEL * Math.sqrt(n) + R);
const cluster = (i: number): P2 => {
  const g = groupOf(i);
  const k = idxIn(i) + 0.5;
  const r = VOGEL * Math.sqrt(k);
  const a = k * 2.39996 + g;
  return [CC[g][0] + r * Math.cos(a), CC[g][1] + r * Math.sin(a)];
};

// 第 2 幕：三根柱（8 列网格自底向上）
const CBASE = 900;
const BX = [520, 1000, 1420];
const SP = 23;
const row = (i: number) => Math.floor(idxIn(i) / 8);
const bar = (i: number): P2 => [BX[groupOf(i)] + ((idxIn(i) % 8) - 3.5) * SP, CBASE - R - row(i) * SP];
const barTop = (g: number) => CBASE - R - (Math.ceil(GROUP_N[g] / 8) - 1) * SP;

// 第 3 幕：数字 "12,847" —— 单线骨架等弧长 160 采样 → 法向 ±10.5 双排 = 320 点
const arc = (cx: number, cy: number, r: number, a0: number, a1: number, n = 48): P2[] =>
  Array.from({ length: n + 1 }, (_, k) => {
    const a = ((a0 + ((a1 - a0) * k) / n) * Math.PI) / 180;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  });
const GS = 1.08; // 字形放大
const GLYPHS: Array<{ x0: number; strokes: P2[][] }> = [
  { x0: 0, strokes: [[[58, 64], [112, 22], [112, 258]], [[52, 258], [172, 258]]] },
  { x0: 228, strokes: [[...arc(100, 86, 64, 198, 378), [36, 258], [172, 258]]] },
  { x0: 462, strokes: [[[22, 236], [4, 290]]] },
  { x0: 540, strokes: [arc(100, 76, 53, -90, 270, 56), arc(100, 198, 62, -90, 270, 64)] },
  { x0: 772, strokes: [[[142, 258], [142, 22], [26, 188], [118, 188]], [[164, 188], [200, 188]]] },
  { x0: 1004, strokes: [[[26, 24], [176, 24], [84, 258]]] },
];
const GW = (1004 + 200) * GS;
const GX = (1920 - GW) / 2;
const GY = 372;
const DIGIT: P2[] = (() => {
  const segs: Array<{ a: P2; b: P2; len: number }> = [];
  GLYPHS.forEach(({ x0, strokes }) =>
    strokes.forEach((s) => {
      for (let k = 0; k < s.length - 1; k++) {
        const a: P2 = [GX + (x0 + s[k][0]) * GS, GY + s[k][1] * GS];
        const b: P2 = [GX + (x0 + s[k + 1][0]) * GS, GY + s[k + 1][1] * GS];
        segs.push({ a, b, len: Math.hypot(b[0] - a[0], b[1] - a[1]) });
      }
    }),
  );
  const total = segs.reduce((s, x) => s + x.len, 0);
  const out: P2[] = [];
  const half = N / 2;
  let si = 0;
  let acc = 0;
  for (let k = 0; k < half; k++) {
    const target = ((k + 0.5) / half) * total;
    while (si < segs.length - 1 && acc + segs[si].len < target) acc += segs[si++].len;
    const { a, b, len } = segs[si];
    const u = len > 0 ? (target - acc) / len : 0;
    const nx = -(b[1] - a[1]) / (len || 1);
    const ny = (b[0] - a[0]) / (len || 1);
    const x = a[0] + (b[0] - a[0]) * u;
    const y = a[1] + (b[1] - a[1]) * u;
    out.push([x + nx * 10.5, y + ny * 10.5], [x - nx * 10.5, y - ny * 10.5]);
  }
  return out;
})();

const mixHex = (a: string, b: string, t: number) => {
  const q = (h: string) => [1, 3, 5].map((k) => parseInt(h.slice(k, k + 2), 16));
  const A = q(a);
  const B = q(b);
  return `rgb(${A.map((v, k) => Math.round(v + (B[k] - v) * t)).join(',')})`;
};
const lerp2 = (a: P2, b: P2, t: number): P2 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

// 每颗点每幕的错峰
const stagOf = (i: number, phase: 0 | 1 | 2) => {
  if (phase === 0) return rnd(i, 7) * STAG;
  if (phase === 1) {
    const rows = Math.ceil(GROUP_N[groupOf(i)] / 8);
    return Math.sqrt(row(i) / Math.max(1, rows - 1)) * STAG + rnd(i, 13) * 2;
  }
  return ((DIGIT[i][0] - GX) / GW) * (STAG + 4) + rnd(i, 14) * 1.5;
};

const posAt = (i: number, f: number): P2 => {
  const mig = (start: number, phase: 0 | 1 | 2) =>
    spring({ frame: f - start - stagOf(i, phase), fps: 30, config: { damping: 13, stiffness: 150, mass: 0.8 }, durationInFrames: DUR, durationRestThreshold: 0.0001 });
  const d = drift(i, f);
  const s = scatter(i);
  let p: P2 = [s[0] + d[0], s[1] + d[1]];
  p = lerp2(p, cluster(i), mig(M1, 0));
  p = lerp2(p, bar(i), mig(M2, 1));
  p = lerp2(p, DIGIT[i], mig(M3, 2));
  return p;
};

// 开场弹出顺序：按距中心
const popDelay = (i: number) => {
  const s = scatter(i);
  const d = Math.hypot(s[0] - 960, (s[1] - 650) * 1.6) / 900;
  return EASE.out(Math.min(1, d)) * 10;
};

// 一段叙事标题：in 帧升起、out 帧上推出
const Headline: React.FC<{ text: string; inF: number; outF?: number }> = ({ text, inF, outF }) => (
  <div style={{ position: 'absolute', left: 0, top: 0, whiteSpace: 'nowrap' }}>
    <TextReveal text={text} by="word" variant="rise" start={inF} each={16} gap={3} out={outF !== undefined ? { start: outF, dur: 10 } : undefined} />
  </div>
);

export const UnitDotSwarmRegroupV2: React.FC<{
  groups?: string[] | string; values?: string[] | string; brand?: string; duration?: number;
}> = ({ groups = GROUP_NAME_FALLBACK, values = GROUP_VAL_FALLBACK, brand = 'Studio', duration }) => {
  const frame = useCurrentFrame();
  const GROUP_NAME = (Array.isArray(groups) ? groups : String(groups).split(/[\n,，、]+/).map((w) => w.trim()).filter(Boolean)).slice(0, 3);
  while (GROUP_NAME.length < 3) GROUP_NAME.push(GROUP_NAME_FALLBACK[GROUP_NAME.length]);
  const GROUP_VAL = (Array.isArray(values) ? values : String(values).split(/[\n,，、]+/).map((w) => w.trim()).filter(Boolean)).slice(0, 3);
  while (GROUP_VAL.length < 3) GROUP_VAL.push(GROUP_VAL_FALLBACK[GROUP_VAL.length]);
  const tailFade = duration ? 1 - ramp(frame, duration - 8, 8, EASE.out) : 1;
  const cam = mix(1, 1.02, ramp(frame, M3 + 20, UNIT_DOT_SWARM_REGROUP_V2_DURATION - M3 - 20, EASE.smooth));

  const clusterOp = Math.min(ramp(frame, 38, 12, EASE.out), 1 - ramp(frame, M2 - 2, 8, EASE.exit));
  const barOp = Math.min(ramp(frame, 78, 12, EASE.out), 1 - ramp(frame, M3 - 2, 8, EASE.exit));
  const legendIn = (k: number) => ramp(frame, 120 + k * 4, 14, EASE.snappy);

  return (
    <AbsoluteFill style={{ background: CL.bg[1], overflow: 'hidden' , opacity: tailFade }}>

      <div style={{ position: 'absolute', inset: 0, transform: `scale(${cam.toFixed(5)})`, transformOrigin: '50% 52%' }}>
        {/* 眉题 + 叙事标题 */}
        <div style={{ position: 'absolute', left: 96, top: 92, display: 'flex', alignItems: 'center', gap: 12, ...type(32, 650, { caps: true }), color: CL.ink3, opacity: ramp(frame, 0, 12, EASE.out) }}>
          <span style={{ width: 40, height: 40, borderRadius: '50%', background: CL.ink3, opacity: 0.5, display: 'inline-block' }} />
          <span style={{ fontWeight: 700, textTransform: 'none', letterSpacing: '0.03em', color: CL.ink }}>{brand}</span>
          <span>· Renders · Q3 2026</span>
        </div>
        <div style={{ position: 'absolute', left: 90, top: 152, ...type(84, 760), color: CL.ink }}>
          <Headline text="Every dot is 40 renders" inF={2} outF={M1 + 4} />
          <Headline text="Split by format" inF={M1 + 14} outF={M2 + 2} />
          <Headline text="Stacked by format" inF={M2 + 12} outF={M3 + 2} />
          <Headline text="Total renders" inF={M3 + 14} />
        </div>

        {/* 簇标签 */}
        {clusterOp > 0.01 && GROUP_NAME.map((n, g) => (
          <div key={n} style={{
            position: 'absolute', left: CC[g][0] - 200, top: CC[g][1] - CR[g] - 128, width: 400, textAlign: 'center',
            opacity: clusterOp, transform: `translateY(${mix(14, 0, ramp(frame, 38 + g * 3, 14, EASE.snappy)).toFixed(2)}px)`,
          }}>
            <div style={{ ...type(32, 650, { caps: true }), color: g === 1 ? CL.accent : CL.ink2 }}>{n}</div>
            <div style={{ ...type(60, 750), color: g === 1 ? CL.accent : CL.ink, marginTop: 4 }}>{GROUP_VAL[g]}</div>
          </div>
        ))}

        {/* 柱：基线 + 柱顶数值 + 套餐名 */}
        <div style={{
          position: 'absolute', left: 300, width: 1340, top: CBASE + 2, height: 3, borderRadius: 2, background: CL.ink,
          transform: `scaleX(${Math.min(ramp(frame, M2 + 4, 18, EASE.snappy), 1 - ramp(frame, M3 - 2, 10, EASE.exit))})`, transformOrigin: '0% 50%',
          opacity: 0.85,
        }} />
        {barOp > 0.01 && GROUP_NAME.map((n, g) => (
          <React.Fragment key={n}>
            <div style={{
              position: 'absolute', left: BX[g] - 200, top: barTop(g) - R - 92, width: 400, textAlign: 'center', ...type(60, 750),
              color: g === 1 ? CL.accent : CL.ink, opacity: barOp, transform: `translateY(${mix(16, 0, ramp(frame, 78 + g * 3, 14, EASE.snappy)).toFixed(2)}px)`,
            }}>{GROUP_VAL[g]}</div>
            <div style={{
              position: 'absolute', left: BX[g] - 200, top: CBASE + 22, width: 400, textAlign: 'center', ...type(32, 650, { caps: true }),
              color: g === 1 ? CL.accent : CL.ink2, opacity: barOp,
            }}>{n}</div>
          </React.Fragment>
        ))}

        {/* 点 */}
        {Array.from({ length: N }, (_, i) => {
          const p = posAt(i, frame);
          const q = posAt(i, frame - 1);
          const vx = p[0] - q[0];
          const vy = p[1] - q[1];
          const sp = Math.hypot(vx, vy);
          const stretch = Math.min(sp * 0.45, 20); // 速度拉伸（px）
          const ang = (Math.atan2(vy, vx) * 180) / Math.PI;
          const pop = spring({ frame: frame - popDelay(i), fps: 30, config: { damping: 12, stiffness: 200 } });
          const g = groupOf(i);
          const w = 2 * R + stretch;
          // 落进数字后统一收拢成钴蓝（数字是终幕主角；构成信息交给下方图例）
          const land = ramp(frame, M3 + stagOf(i, 2) + 10, 12, EASE.out);
          const c0 = land > 0 ? mixHex(COL[g][0], '#6a8bff', land) : COL[g][0];
          const c1 = land > 0 ? mixHex(COL[g][1], '#2348e8', land) : COL[g][1];
          return (
            <div key={i} style={{
              position: 'absolute', left: p[0] - w / 2, top: p[1] - R, width: w, height: 2 * R, borderRadius: R,
              background: `linear-gradient(180deg, ${c0}, ${c1})`,
              boxShadow: `0 ${(2 + stretch * 0.05).toFixed(1)}px ${(4 + stretch * 0.1).toFixed(1)}px ${alpha(CL.shadow, 0.16)}, inset 0 1px 0 rgba(255,255,255,0.35)`,
              transform: `rotate(${sp > 0.3 ? ang.toFixed(2) : 0}deg) scale(${pop.toFixed(4)}, ${(pop * (1 - Math.min(stretch / 120, 0.18))).toFixed(4)})`,
            }} />
          );
        })}

        {/* 图例 */}
        <div style={{ position: 'absolute', left: 0, right: 0, top: 790, display: 'flex', justifyContent: 'center', gap: 64 }}>
          {GROUP_NAME.map((n, g) => (
            <div key={n} style={{
              display: 'flex', alignItems: 'center', gap: 16, opacity: legendIn(g),
              transform: `translateY(${mix(18, 0, legendIn(g)).toFixed(2)}px)`,
            }}>
              <span style={{ width: 22, height: 22, borderRadius: 11, background: `linear-gradient(180deg, ${COL[g][0]}, ${COL[g][1]})` }} />
              <span style={{ ...type(36, 650), color: g === 1 ? CL.accent : CL.ink }}>{n}</span>
              <span style={{ ...type(36, 450), color: CL.ink2 }}>{GROUP_VAL[g]}</span>
            </div>
          ))}
        </div>
        <div style={{
          position: 'absolute', left: 0, right: 0, top: 862, textAlign: 'center', ...type(32, 500), color: CL.ink3,
          opacity: ramp(frame, 132, 14, EASE.out),
        }}>
          Each dot ≈ 40 renders
        </div>
      </div>
    </AbsoluteFill>
  );
};


export const CHART_LIVE_MOVES_DURATION = 192; // 三式中最长的 C；A=168 / B=165

export interface ChartLiveMovesProps {
  /** 三式切换 */
  variant?: 'axis-rescale-shock' | 'oscilloscope-stream' | 'unit-dot-swarm-regroup';
  /** A 的数值序列 */
  data?: number[];
  /** A 的月份标签 */
  labels?: string[];
  /** A 的指标名 */
  metric?: string;
  /** A 的周期 */
  period?: string;
  /** B 的眉题副行 */
  caption?: string;
  /** C 的分组名（3 个） */
  groups?: string[] | string;
  /** C 的分组数值（3 个） */
  values?: string[] | string;
  /** 字标 */
  brand?: string;
  /** 总时长（帧，30fps）；尾 8f 淡出 */
  duration?: number;
}

export const CHART_LIVE_MOVES_DEFAULTS: Required<Omit<ChartLiveMovesProps, 'data' | 'labels' | 'groups' | 'values'>> & { data: number[]; labels: string[]; groups: string[]; values: string[] } = {
  variant: 'axis-rescale-shock',
  data: DATA_FALLBACK,
  labels: MONTHS_FALLBACK,
  metric: 'Renders',
  period: 'FY2026',
  caption: 'render-farm · prod · fps',
  groups: GROUP_NAME_FALLBACK,
  values: GROUP_VAL_FALLBACK,
  brand: 'Studio',
  duration: CHART_LIVE_MOVES_DURATION,
};

export const CHART_LIVE_MOVES_SCHEMA = [
  { type: 'select', key: 'variant', label: '三式', default: 'axis-rescale-shock',
    options: ['axis-rescale-shock', 'oscilloscope-stream', 'unit-dot-swarm-regroup'], required: true },
  { type: 'textarea', key: 'data', label: '数值序列（A，逗号分隔）', default: DATA_FALLBACK.join(', ') },
  { type: 'textarea', key: 'labels', label: '月份标签（A）', default: MONTHS_FALLBACK.join(', ') },
  { type: 'text', key: 'metric', label: '指标名（A）', default: 'Renders' },
  { type: 'text', key: 'period', label: '周期（A）', default: 'FY2026' },
  { type: 'text', key: 'caption', label: '眉题副行（B）', default: 'render-farm · prod · fps' },
  { type: 'textarea', key: 'groups', label: '分组名（C，3 个）', default: GROUP_NAME_FALLBACK.join('\n') },
  { type: 'textarea', key: 'values', label: '分组数值（C，3 个）', default: GROUP_VAL_FALLBACK.join('\n') },
  { type: 'text', key: 'brand', label: '字标', default: 'Studio' },
  { type: 'number', key: 'duration', label: '总时长', default: CHART_LIVE_MOVES_DURATION, min: 100, max: 500, step: 1, unit: '帧' },
] as const;

export const ChartLiveMoves: React.FC<ChartLiveMovesProps> = (props) => {
  const p = { ...CHART_LIVE_MOVES_DEFAULTS, ...props };
  const data = (Array.isArray(p.data) ? p.data : String(p.data).split(/[,，、\n]+/).map((w) => parseFloat(w)).filter((v) => Number.isFinite(v))).slice(0, 24);
  switch (p.variant) {
    case 'oscilloscope-stream':
      return <OscilloscopeStreamV2 brand={p.brand} caption={p.caption} duration={p.duration} />;
    case 'unit-dot-swarm-regroup':
      return <UnitDotSwarmRegroupV2 groups={p.groups} values={p.values} brand={p.brand} duration={p.duration} />;
    case 'axis-rescale-shock':
    default:
      return <AxisRescaleShockV2 data={data.length >= 2 ? data : undefined} labels={p.labels} metric={p.metric} period={p.period} brand={p.brand} duration={p.duration} />;
  }
};
