// ─── 改编来源 ───
// video-shotcraft (Apache License 2.0) · https://github.com/Vincentwei1021/video-shotcraft
// 原卡: demos/data/scroll-brake-moves/
//   - BrakeReticleLock.tsx（刹车准星锁定）
//   - ChangelogScrollBrake.tsx（更新日志滚动刹车）
// 参考: references/shots/data/scroll-brake-moves.md
// 改动:
//  1. 两式合一文件，variant 参数切换：'brake-reticle-lock' | 'changelog-scroll-brake'
//  2. 硬编码文案提为带默认值的 props：title（页眉标题）/ brand
//  3. 去掉 video-shotcraft 品牌（ShotcraftMark → 中性圆点；BRAND.name → brand prop）
//  4. 去掉 Backdrop，改为透明底；两变体均为浅场设计，宜叠浅画面
//  5. 节奏命门保持常量（A：滚动→刹车→准星锁定；B：静置/滚动/抬升/静止时序）
//  6. duration prop：两变体尾 8f 淡出跟 duration 走（不传则无淡出）

import React from 'react';
import { EASE, FONT, Grain, SpeedBlur, bezier, innerHighlight, softShadow, tracking, ramp, mix } from '../_fixtures/Polish';
import { useCurrentFrame, interpolate, Easing } from 'remotion';
import { G } from '../_fixtures/Fixtures';
import { useCurrentFrame, interpolate } from 'remotion';

const SCROLL_START = 12;
const BRAKE = 59;
const DUR = 150;
export const BRAKE_RETICLE_LOCK_DURATION = DUR;

const PITCH = 156; // 行高 120 + 间距 36
const ROW_H = 120;
const TARGET_ROW = 30;
const FINAL_SCROLL = TARGET_ROW * PITCH - 480; // 停点条目 top 落在屏幕 y=480
const LIST_X = 360;
const LIST_W = 1200;

// 滚动位置：12–50 加速冲刺（sin-in，越滚越快）→ 50–59 猛减速冲过头 30px →
// 59–63 回弹落定。59 帧为急刹帧（首次停住/反向）。
const scrollAt = (f: number): number => {
  if (f <= SCROLL_START) return 0;
  if (f <= 50) {
    return interpolate(f, [SCROLL_START, 50], [0, FINAL_SCROLL - 430], {
      easing: Easing.in(Easing.sin),
    });
  }
  if (f <= BRAKE) {
    return interpolate(f, [50, BRAKE], [FINAL_SCROLL - 430, FINAL_SCROLL + 30], {
      easing: Easing.out(Easing.cubic),
    });
  }
  return interpolate(f, [BRAKE, BRAKE + 4], [FINAL_SCROLL + 30, FINAL_SCROLL], {
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.quad),
  });
};

// ── 假内容：video-shotcraft 时间自上而下递增的发布记录，第 30 行 = v2.41 Motion workbench ──
const TITLES = [
  'Crash zoom shot card', 'Faster Remotion renders', 'Audio drift on long renders', 'Beat grid from any BGM',
  'Dolly zoom shot card', 'Real page captures', 'Caption timing at 60 fps', 'Gallery style filters', 'Whip pans',
  'Ink Press template', 'Improved SFX ducking', 'Blur seam on 4K export', 'Storyboard from a prompt', 'Inline shot previews',
  'Poster frame picker', 'Parallax depth layers', 'Font fallback in titles', 'Beat-synced flash cuts', 'Film grain overlay',
  'Lower thirds', 'Faster cold render', 'Mask edge on Safari', 'Showcase gallery', 'Light leaks', 'Per-shot color looks',
  'Offline asset cache', 'Cursor path smoothing', 'Timeline markers', 'Typing code block card', 'JianYing export',
  'Motion workbench', 'Vertical 9:16 cuts', 'Brand kit import', 'Shot A/B compare', 'Multi-track SFX',
  'Batch renders', 'Review links', 'Voiceover sync',
];
const DESCS = [
  'Rolled out to every project.', 'Now 3× faster on long films.', 'Fixed for macOS and Linux.', 'Ships with the skill today.',
];
// 类型：图标色 + 字形
const KIND = [
  { name: 'Feature', tint: 'rgba(91,99,211,0.12)', ink: '#4a51b8', glyph: '✦' },
  { name: 'Improved', tint: 'rgba(22,150,110,0.12)', ink: '#137a5a', glyph: '↗' },
  { name: 'Fix', tint: 'rgba(20,22,28,0.06)', ink: '#5d5f66', glyph: '✓' },
];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct'];

const Row: React.FC<{ i: number; highlight: number; dim: number }> = ({ i, highlight, dim }) => {
  const isTarget = i === TARGET_ROW;
  const k = KIND[isTarget ? 0 : (i * 7) % 3];
  const later = i > TARGET_ROW;
  return (
    <div
      style={{
        position: 'absolute',
        top: i * PITCH,
        left: 0,
        width: LIST_W,
        height: ROW_H,
        background: '#ffffff',
        border: `1px solid ${G.hairline}`,
        borderRadius: 16,
        display: 'flex',
        alignItems: 'center',
        gap: 26,
        padding: '0 32px',
        boxSizing: 'border-box',
        boxShadow:
          `${innerHighlight(0.9)}, ${softShadow(3 + 20 * highlight, { strength: 1 + 0.6 * highlight })}` +
          (highlight > 0 ? `, 0 0 0 ${(2 * highlight).toFixed(2)}px rgba(91,99,211,${(0.85 * highlight).toFixed(3)})` : ''),
        opacity: 1 - 0.62 * dim,
        fontFamily: FONT.sans,
      }}
    >
      <div
        style={{
          width: 56,
          height: 56,
          flexShrink: 0,
          borderRadius: 14,
          background: isTarget ? `linear-gradient(180deg, #7178e6, ${G.accent})` : k.tint,
          color: isTarget ? '#fff' : k.ink,
          display: 'grid',
          placeItems: 'center',
          fontSize: 26,
          fontWeight: 700,
          boxShadow: isTarget ? 'inset 0 1px 0 rgba(255,255,255,0.35)' : 'none',
        }}
      >
        {k.glyph}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: isTarget ? 36 : 30, fontWeight: isTarget ? 700 : 600, color: later ? G.ink3 : G.ink1, letterSpacing: tracking(30), whiteSpace: 'nowrap' }}>
          {TITLES[i % TITLES.length]}
        </div>
        <div style={{ marginTop: 6, fontSize: 24, color: G.ink2, whiteSpace: 'nowrap' }}>
          {isTarget ? 'Every shot, tuned in one place.' : later ? 'Planned for Q4.' : DESCS[i % DESCS.length]}
        </div>
      </div>
      <div style={{ flexShrink: 0, fontFamily: FONT.mono, fontSize: 22, color: G.ink3, fontVariantNumeric: 'tabular-nums' }}>
        {later ? '—' : `v2.${11 + i}`}
      </div>
      <div style={{ flexShrink: 0, width: 96, textAlign: 'right', fontSize: 22, color: G.ink3, fontVariantNumeric: 'tabular-nums' }}>
        {isTarget ? 'Today' : later ? 'Q4' : `${MONTHS[Math.floor((i / TARGET_ROW) * 9)]} ${1 + ((i * 11) % 27)}`}
      </div>
    </div>
  );
};

// L 形角标：两条圆头强调色边组成的直角
const Corner: React.FC<{ flip: [number, number]; style: React.CSSProperties }> = ({ flip, style }) => (
  <div style={{ position: 'absolute', width: 46, height: 46, transform: `scale(${flip[0]}, ${flip[1]})`, ...style }}>
    <div style={{ position: 'absolute', left: 0, top: 0, width: 46, height: 6, background: G.accent, borderRadius: 3 }} />
    <div style={{ position: 'absolute', left: 0, top: 0, width: 6, height: 46, background: G.accent, borderRadius: 3 }} />
  </div>
);

// 角标咬合进度（back-out 超调）
const lockAt = (f: number) =>
  interpolate(f, [BRAKE, BRAKE + 9], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.back(2.4)),
  });

// 列表上下渐隐（顶栏下方 / 画面底部）
const LIST_MASK = 'linear-gradient(180deg, transparent 72px, #000 170px, #000 960px, transparent 1080px)';

export const BrakeReticleLock: React.FC<{
  title?: string; brand?: string; duration?: number;
}> = ({ title = 'Changelog', brand = 'Studio', duration }) => {
  const frame = useCurrentFrame();
  const f = frame;
  const tailFade = duration ? 1 - ramp(frame, duration - 8, 8, EASE.out) : 1;
  const scroll = scrollAt(f);

  // 速度段纵向模糊：由相邻帧位移决定（px/f），冲刺段拉成色带，刹停即清晰
  const v = scroll - scrollAt(Math.max(0, f - 1));

  // 急刹帧起：高亮 0→1（6f），其余行退暗（12f）
  const highlight = interpolate(f, [BRAKE, BRAKE + 6], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const dim = interpolate(f, [BRAKE + 2, BRAKE + 14], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  });

  // 停点条目屏幕坐标（落定后 top=480）
  const rowTopAt = (fr: number) => TARGET_ROW * PITCH - scrollAt(fr);
  const GAP = 10; // 咬合位：角外扩 10px
  const rect = (fr: number) => ({ x: LIST_X - GAP, y: rowTopAt(fr) - GAP, w: LIST_W + GAP * 2, h: ROW_H + GAP * 2 });

  const corners: Array<{ ax: 0 | 1; ay: 0 | 1; fromX: number; fromY: number; flip: [number, number] }> = [
    { ax: 0, ay: 0, fromX: -620, fromY: -320, flip: [1, 1] },
    { ax: 1, ay: 0, fromX: 620, fromY: -320, flip: [-1, 1] },
    { ax: 0, ay: 1, fromX: -620, fromY: 320, flip: [1, -1] },
    { ax: 1, ay: 1, fromX: 620, fromY: 320, flip: [-1, -1] },
  ];
  const cornerPos = (c: (typeof corners)[number], fr: number) => {
    const r = rect(fr);
    const fly = 1 - lockAt(fr); // 1=画外 0=咬合到位
    return { x: r.x + c.ax * r.w - 23 + c.fromX * fly, y: r.y + c.ay * r.h - 23 + c.fromY * fly };
  };

  // 小标签：63f 从条目右侧弹出（超调）
  const tagT = interpolate(f, [BRAKE + 4, BRAKE + 12], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.back(2.6)),
  });
  const tagOp = interpolate(f, [BRAKE + 4, BRAKE + 7], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const r = rect(f);

  return (
    <div style={{ width: 1920, height: 1080, position: 'relative', overflow: 'hidden', fontFamily: FONT.sans }}>

      {/* changelog 长列表：整体上掠，速度段纵向模糊 */}
      <div style={{ position: 'absolute', inset: 0, WebkitMaskImage: LIST_MASK, maskImage: LIST_MASK }}>
        <SpeedBlur vx={0} vy={v} amount={0.15} max={32}>
          <div style={{ position: 'absolute', left: LIST_X, top: 0, width: LIST_W, height: 1080 }}>
            <div style={{ position: 'absolute', top: -scroll, left: 0, width: LIST_W, height: 40 * PITCH }}>
              {Array.from({ length: 38 }).map((_, i) => (
                <Row key={i} i={i} highlight={i === TARGET_ROW ? highlight : 0} dim={i === TARGET_ROW ? 0 : dim} />
              ))}
            </div>
          </div>
        </SpeedBlur>
      </div>

      {/* 顶栏（不随滚动） */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: 72,
          background: 'rgba(250,250,249,0.92)',
          borderBottom: `1px solid ${G.hairline}`,
          display: 'flex',
          alignItems: 'center',
          padding: '0 40px',
          gap: 16,
          boxSizing: 'border-box',
          zIndex: 3,
        }}
      >
        <span style={{ width: 32, height: 32, borderRadius: '50%', background: G.ink3, opacity: 0.5, display: 'inline-block' }} />
        <div style={{ fontSize: 24, fontWeight: 700, color: G.ink1, letterSpacing: '0.03em' }}>{brand}</div>
        <div style={{ fontSize: 24, color: G.ink3 }}>/</div>
        <div style={{ fontSize: 24, fontWeight: 550, color: G.ink2 }}>{title}</div>
        <div
          style={{
            marginLeft: 'auto',
            width: 38,
            height: 38,
            borderRadius: 19,
            background: '#e4e5ea',
            color: G.ink2,
            fontSize: 15,
            fontWeight: 700,
            display: 'grid',
            placeItems: 'center',
          }}
        >
          JL
        </div>
      </div>

      {/* 准星角标：急刹帧同帧挂载（组合命门：与刹停同帧共振）；飞入段方向性运动模糊 */}
      {f >= BRAKE &&
        corners.map((c, i) => {
          const p = cornerPos(c, f);
          const q = cornerPos(c, f - 1);
          return (
            <SpeedBlur key={i} vx={p.x - q.x} vy={p.y - q.y} amount={0.1} max={18}>
              <Corner
                flip={c.flip}
                style={{ left: p.x, top: p.y, opacity: Math.min(1, lockAt(f) * 3 + 0.35) }}
              />
            </SpeedBlur>
          );
        })}

      {/* 旁弹小标签 */}
      {f >= BRAKE + 4 && (
        <div
          style={{
            position: 'absolute',
            left: r.x + r.w + 28,
            top: r.y + r.h / 2 - 28,
            height: 56,
            transform: `scale(${(0.6 + 0.4 * tagT).toFixed(4)})`,
            transformOrigin: 'left center',
            opacity: tagOp,
            padding: '0 24px 0 22px',
            borderRadius: 28,
            background: G.ink1,
            boxShadow: softShadow(12, { strength: 1.4 }),
            color: '#ffffff',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            fontWeight: 650,
            fontSize: 26,
            letterSpacing: tracking(26),
          }}
        >
          <div style={{ width: 10, height: 10, borderRadius: 5, background: '#67d17c', boxShadow: '0 0 0 4px rgba(103,209,124,0.22)' }} />
          Just shipped
        </div>
      )}
      <Grain opacity={0.05} />
    </div>
  );
};


export const CHANGELOG_SCROLL_BRAKE_DURATION = 150; // 静置 14f + 滚动 50f + 抬升 14f + 静止 66f

const CL = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;

// 时间轴
const SCROLL0 = 14; // 前 14f 初始静置（停在长卷顶部）
const SCROLL1 = 64; // 急刹停位帧
const LIFT0 = 68; // 目标行抬升开始
const LIFT1 = 82;

const COL_W = 1000;
const COL_X = (1920 - COL_W) / 2;
const GAP = 20;
const N = 34;
const TARGET = 28;

// 行高错落（帧确定性：全由 i 决定）
const rowH = (i: number) => 72 + ((i * 29) % 3) * 22; // 72 / 94 / 116

// 预计算每行 y
const rowY: number[] = [];
{
  let y = 0;
  for (let i = 0; i < N; i++) {
    rowY.push(y);
    y += rowH(i) + GAP;
  }
}
const TARGET_CY = rowY[TARGET] + rowH(TARGET) / 2;
const END_T = 540 - TARGET_CY; // 目标行停在画面正中
const START_T = 200; // 起始：长卷顶部在页眉下方

// 快起步（~5f 到峰速）+ 长尾指数式减速：高开中收
const BRAKE_EASE = bezier(0.45, 0, 0.06, 1);
const CscrollAt = (f: number): number =>
  interpolate(f, [SCROLL0, SCROLL1], [START_T, END_T], { easing: BRAKE_EASE, ...CL });

// ── 假内容：video-shotcraft 一整年的发布记录（自上而下时间递增），停点 = Motion workbench，之后为路线图 ──
const CTITLES = [
  'Crash zoom shot card', 'Faster Remotion renders', 'Fix: audio drift on long renders',
  'Beat grid from any BGM', 'Dolly zoom shot card', 'Real page captures', 'Fix: caption timing at 60 fps',
  'Gallery style filters', 'Whip pans', 'Ink Press template', 'Improved SFX ducking', 'Fix: blur seam on 4K export',
  'Storyboard from a prompt', 'Inline shot previews', 'Poster frame picker', 'Parallax depth layers', 'Fix: font fallback in titles',
  'Beat-synced flash cuts', 'Film grain overlay', 'Lower thirds', 'Faster cold render', 'Fix: mask edge on Safari',
  'Showcase gallery', 'Light leaks', 'Per-shot color looks', 'Offline asset cache', 'Fix: cursor path smoothing', 'JianYing export',
];
const KINDS = ['Feature', 'Improved', 'Fix'] as const;
const KIND_STYLE: Record<string, { bg: string; fg: string }> = {
  Feature: { bg: 'rgba(91,99,211,0.11)', fg: '#4a51b8' },
  Improved: { bg: 'rgba(22,150,110,0.11)', fg: '#137a5a' },
  Fix: { bg: 'rgba(20,22,28,0.06)', fg: '#5d5f66' },
  Planned: { bg: 'transparent', fg: '#9b9da3' },
  Launch: { bg: G.accent, fg: '#ffffff' },
};
const CMONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep'];
const entry = (i: number) => {
  if (i === TARGET)
    return {
      v: 'v2.41', kind: 'Launch', title: 'Motion workbench',
      desc: 'Every shot, tuned in one place.', date: 'Today',
    };
  if (i > TARGET)
    return { v: '—', kind: 'Planned', title: ['Vertical 9:16 cuts', 'Brand kit import', 'Shot A/B compare', 'Multi-track SFX', 'Batch renders'][(i - TARGET - 1) % 5], desc: 'On the roadmap for Q4.', date: 'Q4' };
  const kind = CTITLES[i].startsWith('Fix') ? 'Fix' : KINDS[i % 2];
  return {
    v: `v2.${13 + i}`,
    kind,
    title: CTITLES[i].replace(/^Fix: (.)/, (_, c: string) => c.toUpperCase()),
    desc: 'Rolled out to every project with no action required.',
    date: `${CMONTHS[Math.min(8, Math.floor((i / TARGET) * 9))]} ${1 + ((i * 11) % 27)}`,
  };
};

const CRow: React.FC<{ i: number; frame: number }> = ({ i, frame }) => {
  const isTarget = i === TARGET;
  const h = rowH(i);
  const e = entry(i);
  const k = KIND_STYLE[e.kind];
  const tall = h >= 94;
  const planned = e.kind === 'Planned';

  // 目标行抬升 + 高亮；其余行退暗
  const t = interpolate(frame, [LIFT0, LIFT1], [0, 1], { easing: EASE.out, ...CL });
  const lift = isTarget ? t : 0;
  const dim = isTarget ? 0 : t;

  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        top: rowY[i],
        width: COL_W,
        height: h,
        background: planned ? 'rgba(255,255,255,0.55)' : '#ffffff',
        border: planned ? '1px dashed rgba(20,22,28,0.14)' : `1px solid ${G.hairline}`,
        borderRadius: 14,
        display: 'flex',
        alignItems: 'center',
        gap: 22,
        padding: '0 30px',
        boxSizing: 'border-box',
        transform: `scale(${1 + 0.03 * lift})`,
        boxShadow: planned
          ? 'none'
          : `${innerHighlight(0.9)}, ${softShadow(2 + 26 * lift, { strength: 1 + 0.6 * lift })}` +
            (lift > 0 ? `, 0 0 0 ${(2 * lift).toFixed(2)}px rgba(91,99,211,${(0.9 * lift).toFixed(3)})` : ''),
        opacity: 1 - 0.62 * dim,
        zIndex: isTarget ? 2 : 1,
        fontFamily: FONT.sans,
      }}
    >
      <div style={{ width: 82, flexShrink: 0, fontFamily: FONT.mono, fontSize: 22, color: G.ink3, fontVariantNumeric: 'tabular-nums' }}>
        {e.v}
      </div>
      <div
        style={{
          flexShrink: 0,
          height: 34,
          padding: '0 14px',
          borderRadius: 17,
          background: k.bg,
          border: planned ? '1px solid rgba(20,22,28,0.12)' : 'none',
          color: k.fg,
          fontSize: 20,
          fontWeight: 650,
          lineHeight: '34px',
          letterSpacing: '0.01em',
        }}
      >
        {e.kind}
      </div>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div
          style={{
            fontSize: isTarget ? 36 : 28,
            fontWeight: isTarget ? 700 : 600,
            color: planned ? G.ink3 : G.ink1,
            letterSpacing: tracking(isTarget ? 36 : 28),
            whiteSpace: 'nowrap',
          }}
        >
          {e.title}
        </div>
        {tall && (
          <div style={{ marginTop: 4, fontSize: isTarget ? 26 : 22, color: G.ink2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {e.desc}
          </div>
        )}
      </div>
      {isTarget && (
        <div
          style={{
            flexShrink: 0,
            height: 30,
            padding: '0 12px',
            borderRadius: 8,
            background: 'rgba(91,99,211,0.11)',
            color: G.accent,
            fontSize: 18,
            fontWeight: 750,
            lineHeight: '30px',
            letterSpacing: '0.08em',
            opacity: lift,
            transform: `translateX(${((1 - lift) * 8).toFixed(2)}px)`,
          }}
        >
          NEW
        </div>
      )}
      <div style={{ flexShrink: 0, width: 92, textAlign: 'right', fontSize: 22, color: G.ink3, fontVariantNumeric: 'tabular-nums' }}>
        {e.date}
      </div>
    </div>
  );
};

// 列表上下渐隐：页眉下方与画面底部各一段
const CLIST_MASK = 'linear-gradient(180deg, transparent 150px, #000 250px, #000 930px, transparent 1060px)';

export const ChangelogScrollBrake: React.FC<{
  title?: string; brand?: string; duration?: number;
}> = ({ title = 'Changelog', brand = 'Studio', duration }) => {
  const frame = useCurrentFrame();
  const tailFade = duration ? 1 - ramp(frame, duration - 8, 8, EASE.out) : 1;
  const T = CscrollAt(frame);
  // 速度差分（px/f）→ 纵向运动模糊
  const v = CscrollAt(frame + 0.5) - CscrollAt(frame - 0.5);

  return (
    <div style={{ width: 1920, height: 1080, position: 'relative', overflow: 'hidden', fontFamily: FONT.sans }}>
      <div style={{ position: 'absolute', inset: 0, WebkitMaskImage: CLIST_MASK, maskImage: CLIST_MASK }}>
        <SpeedBlur vx={0} vy={v} amount={0.32} max={30}>
          <div
            style={{
              position: 'absolute',
              left: COL_X,
              top: 0,
              width: COL_W,
              height: 1080,
              transform: `translateY(${T.toFixed(2)}px)`,
            }}
          >
            {Array.from({ length: N }).map((_, i) => (
              <CRow key={i} i={i} frame={frame} />
            ))}
          </div>
        </SpeedBlur>
      </div>
      {/* 固定页眉：镜刻标志 + Changelog + 品牌名 */}
      <div style={{ position: 'absolute', left: COL_X, top: 64, width: COL_W, display: 'flex', alignItems: 'baseline', gap: 22 }}>
        <span style={{ width: 50, height: 50, borderRadius: '50%', background: G.ink3, opacity: 0.5, display: 'inline-block', alignSelf: 'center', marginRight: -4 }} />
        <div style={{ fontSize: 52, fontWeight: 720, letterSpacing: tracking(52), color: G.ink1 }}>{title}</div>
        <div style={{ fontSize: 30, fontWeight: 600, color: G.ink3, letterSpacing: '0.03em' }}>{brand}</div>
      </div>
      <Grain opacity={0.05} />
    </div>
  );
};


export const SCROLL_BRAKE_MOVES_DURATION = 150; // B=150，A 另见 BRAKE_RETICLE_LOCK_DURATION（DUR）

export interface ScrollBrakeMovesProps {
  /** 两式切换 */
  variant?: 'brake-reticle-lock' | 'changelog-scroll-brake';
  /** 页眉标题 */
  title?: string;
  /** 字标 */
  brand?: string;
  /** 总时长（帧，30fps）；尾 8f 淡出 */
  duration?: number;
}

export const SCROLL_BRAKE_MOVES_DEFAULTS: Required<ScrollBrakeMovesProps> = {
  variant: 'brake-reticle-lock',
  title: 'Changelog',
  brand: 'Studio',
  duration: SCROLL_BRAKE_MOVES_DURATION,
};

export const SCROLL_BRAKE_MOVES_SCHEMA = [
  { type: 'select', key: 'variant', label: '两式', default: 'brake-reticle-lock',
    options: ['brake-reticle-lock', 'changelog-scroll-brake'], required: true },
  { type: 'text', key: 'title', label: '页眉标题', default: 'Changelog' },
  { type: 'text', key: 'brand', label: '字标', default: 'Studio' },
  { type: 'number', key: 'duration', label: '总时长', default: SCROLL_BRAKE_MOVES_DURATION, min: 80, max: 400, step: 1, unit: '帧' },
] as const;

export const ScrollBrakeMoves: React.FC<ScrollBrakeMovesProps> = (props) => {
  const p = { ...SCROLL_BRAKE_MOVES_DEFAULTS, ...props };
  switch (p.variant) {
    case 'changelog-scroll-brake':
      return <ChangelogScrollBrake title={p.title} brand={p.brand} duration={p.duration} />;
    case 'brake-reticle-lock':
    default:
      return <BrakeReticleLock title={p.title} brand={p.brand} duration={p.duration} />;
  }
};
