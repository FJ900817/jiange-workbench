#!/usr/bin/env node
/**
 * library-render · Remotion 卡渲染器。
 *
 * 把一张 Remotion 卡渲染成带透明通道的 RGBA PNG，供视频包装台 Host 渲染服务调用。
 * 支持两种卡片形态：
 * - talkcraft 形态：`export default` 组件 + `export const meta`
 *  （不传 --export-name 时走这条路；--width/--height/--fps 不传则取 meta）。
 * - shotcraft 形态：具名 export 组件（传 --export-name 指定）；
 *   可选 --defaults-export（与 --props 合并，CLI 优先）、
 *   --duration-export（取总帧数）；--width/--height/--fps 必填。
 *
 * 用法（talkcraft）：
 *   node render-card.mjs --card /abs/path/card.tsx \
 *     --props '{"title":"...","theme":"dark"}' \
 *     --width 960 --height 540 --fps 30 --frame 45 --out /abs/out.png
 *
 * 用法（shotcraft）：
 *   node render-card.mjs --card /abs/path/card.tsx --export-name BlurSlide \
 *     --defaults-export BLUR_SLIDE_DEFAULTS --duration-export BLUR_SLIDE_DURATION \
 *     --props '{"title":"..."}' \
 *     --width 1920 --height 1080 --fps 30 --frame 45 --out /abs/out.png
 *
 * 说明：
 * - --frame 会被钳制到 [0, durationInFrames-1]。
 * - Chromium 解析见 resolve-chromium.mjs（环境变量优先，其次自动下载）。
 * - 成功 exit 0；失败 exit 非 0 并在 stderr 输出中文原因。
 */

import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join } from 'node:path';
import { createRequire } from 'node:module';
import { resolveChromiumExecutable } from './resolve-chromium.mjs';

const require = createRequire(import.meta.url);

const fail = (message) => {
  process.stderr.write(`[library-render] 失败：${message}\n`);
  process.exit(1);
};

const usage = () => `用法：
  talkcraft 形态：
    node render-card.mjs --card <卡片 tsx 绝对路径> [--props <JSON 对象>] [--width <宽>] [--height <高>] [--fps <帧率>] --frame <帧号> --out <输出 PNG 绝对路径>
  shotcraft 形态（具名 export）：
    node render-card.mjs --card <卡片 tsx 绝对路径> --export-name <组件名> --duration-export <总帧数导出名> [--defaults-export <默认 props 导出名>] --props <JSON 对象> --width <宽> --height <高> --fps <帧率> --frame <帧号> --out <输出 PNG 绝对路径>

说明：
  --width/--height/--fps 在 talkcraft 形态下不传时取卡片 meta 里的值；shotcraft 形态下必填（--duration-export 也必填）。
  --frame 会被钳制到 [0, durationInFrames-1]。
  Chromium：优先用环境变量 LIBRARY_RENDER_CHROMIUM_PATH（兼容旧名 TALKCRAFT_CHROMIUM_PATH）；
  找不到时自动下载到本包 node_modules/.remotion。`;

// ---------- 参数解析 ----------
const raw = process.argv.slice(2);
const args = {};
for (let i = 0; i < raw.length; i++) {
  const key = raw[i];
  if (!key.startsWith('--')) {
    fail(`无法识别的参数：${key}\n${usage()}`);
  }
  const name = key.slice(2);
  const value = raw[i + 1];
  if (value === undefined || value.startsWith('--')) {
    fail(`参数 --${name} 缺少取值\n${usage()}`);
  }
  args[name] = value;
  i++;
}

const cardPath = args.card;
if (!cardPath) fail(`缺少必填参数 --card\n${usage()}`);
if (!isAbsolute(cardPath)) fail(`--card 必须是绝对路径，收到：${cardPath}`);
if (!existsSync(cardPath)) fail(`卡片文件不存在：${cardPath}`);

const identArg = (name) => {
  const value = args[name];
  if (value === undefined) return undefined;
  if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(value)) {
    fail(`--${name} 必须是合法的 JS 标识符，收到：${value}`);
  }
  return value;
};
const exportName = identArg('export-name');
const defaultsExport = identArg('defaults-export');
const durationExport = identArg('duration-export');

let props = {};
if (args.props !== undefined) {
  try {
    props = JSON.parse(args.props);
  } catch {
    fail(`--props 不是合法 JSON：${args.props}`);
  }
  if (props === null || typeof props !== 'object' || Array.isArray(props)) {
    fail(`--props 必须是 JSON 对象，例如 '{"theme":"dark"}'`);
  }
}

const intArg = (name, value, { min = 1 } = {}) => {
  const n = Number(value);
  if (!Number.isInteger(n) || n < min) {
    fail(`--${name} 必须是 ≥${min} 的整数，收到：${value}`);
  }
  return n;
};
const width = args.width !== undefined ? intArg('width', args.width) : undefined;
const height =
  args.height !== undefined ? intArg('height', args.height) : undefined;
const fps = args.fps !== undefined ? intArg('fps', args.fps) : undefined;
if (exportName !== undefined && (width === undefined || height === undefined || fps === undefined)) {
  fail(`shotcraft 形态（--export-name）下 --width/--height/--fps 必填\n${usage()}`);
}
if (exportName !== undefined && durationExport === undefined) {
  fail(`shotcraft 形态（--export-name）下 --duration-export 必填（卡片的总帧数导出名）\n${usage()}`);
}
if (args.frame === undefined) fail(`缺少必填参数 --frame\n${usage()}`);
const frame = intArg('frame', args.frame, { min: 0 });

const outPath = args.out;
if (!outPath) fail(`缺少必填参数 --out\n${usage()}`);
if (!isAbsolute(outPath)) fail(`--out 必须是绝对路径，收到：${outPath}`);
if (!outPath.toLowerCase().endsWith('.png')) {
  fail(`--out 必须是 .png 文件，收到：${outPath}`);
}
try {
  mkdirSync(dirname(outPath), { recursive: true });
} catch (e) {
  fail(`无法创建输出目录 ${dirname(outPath)}：${e.message ?? e}`);
}

// ---------- 生成临时入口 tsx ----------
const dir = mkdtempSync(join(tmpdir(), 'library-render-'));
const entryPath = join(dir, 'entry.tsx');
const cardJson = JSON.stringify(cardPath);
const entrySource = exportName === undefined
  ? `// 自动生成：library-render 渲染入口（talkcraft 形态，渲染完即删）
import Card, { meta } from ${cardJson};
import { Composition, registerRoot } from 'remotion';

if (!meta || typeof meta.durationInFrames !== 'number') {
  throw new Error('卡片文件必须 export const meta = { width, height, fps, durationInFrames }');
}

const DEFAULT_PROPS = ${JSON.stringify(props)};

const RemotionRoot = () => (
  <Composition
    id="Card"
    component={Card}
    durationInFrames={meta.durationInFrames}
    fps={${fps ?? 'meta.fps'}}
    width={${width ?? 'meta.width'}}
    height={${height ?? 'meta.height'}}
    defaultProps={DEFAULT_PROPS}
  />
);

registerRoot(RemotionRoot);
`
  : `// 自动生成：library-render 渲染入口（shotcraft 形态，渲染完即删）
import { ${exportName} as Card${defaultsExport ? `, ${defaultsExport} as CARD_DEFAULTS` : ''}${durationExport ? `, ${durationExport} as CARD_DURATION` : ''} } from ${cardJson};
import { Composition, registerRoot } from 'remotion';

const DEFAULT_PROPS = ${defaultsExport ? '{ ...CARD_DEFAULTS, ...' : ''}${JSON.stringify(props)}${defaultsExport ? ' }' : ''};

const RemotionRoot = () => (
  <Composition
    id="Card"
    component={Card}
    durationInFrames={CARD_DURATION}
    fps={${fps}}
    width={${width}}
    height={${height}}
    defaultProps={DEFAULT_PROPS}
  />
);

registerRoot(RemotionRoot);
`;
writeFileSync(entryPath, entrySource, 'utf8');

const t0 = Date.now();
try {
  const { bundle } = await import('@remotion/bundler');
  const { ensureBrowser, getCompositions, renderStill } =
    await import('@remotion/renderer');

  // react / react-dom / remotion 固定解析到本包自己的 node_modules，
  // 防止卡片放在别的包目录下时 webpack 找不到这些依赖。
  const pkgDirOf = (name) => dirname(require.resolve(`${name}/package.json`));
  const bundled = await bundle({
    entryPoint: entryPath,
    webpackOverride: (config) => ({
      ...config,
      resolve: {
        ...(config.resolve ?? {}),
        alias: {
          ...((config.resolve ?? {}).alias ?? {}),
          react: pkgDirOf('react'),
          'react-dom': pkgDirOf('react-dom'),
          remotion: pkgDirOf('remotion'),
        },
      },
    }),
  });

  let browserExecutable = null;
  try {
    browserExecutable = resolveChromiumExecutable();
  } catch {
    try {
      await ensureBrowser();
      browserExecutable = resolveChromiumExecutable();
    } catch (e) {
      fail(`Chromium 准备失败：${e.message ?? e}`);
    }
  }

  const compositions = await getCompositions(bundled, { browserExecutable });
  const composition = compositions.find((c) => c.id === 'Card');
  if (!composition) {
    fail(
      `打包产物里没有找到 id 为 "Card" 的 Composition（卡片文件可能没有正确 export ${exportName ?? 'default'}）`,
    );
  }

  const maxFrame = composition.durationInFrames - 1;
  const clamped = Math.max(0, Math.min(frame, maxFrame));
  if (clamped !== frame) {
    process.stderr.write(
      `[library-render] 注意：--frame=${frame} 超出范围，已钳制到 ${clamped}（总帧数 ${composition.durationInFrames}）\n`,
    );
  }

  await renderStill({
    composition,
    serveUrl: bundled,
    frame: clamped,
    output: outPath,
    imageFormat: 'png',
    overwrite: true,
    browserExecutable,
  });

  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  process.stdout.write(
    `[library-render] 完成：${outPath}（${composition.width}x${composition.height}，第 ${clamped} 帧，用时 ${secs}s）\n`,
  );
  process.exit(0);
} catch (e) {
  fail(e.message ?? String(e));
} finally {
  rmSync(dir, { recursive: true, force: true });
}
