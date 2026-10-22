#!/usr/bin/env node
/**
 * talkcraft 卡渲染器。
 *
 * 把一张 talkcraft Remotion 卡（`export default` 组件 + `export const meta`）
 * 渲染成带透明通道的 RGBA PNG，供视频包装台 Host 渲染服务调用。
 *
 * 用法：
 *   node render-card.mjs --card /abs/path/card.tsx \
 *     --props '{"title":"...","theme":"dark"}' \
 *     --width 960 --height 540 --fps 30 --frame 45 --out /abs/out.png
 *
 * 说明：
 * - --width/--height/--fps 不传时取卡片 meta 里的值；传了则覆盖输出尺寸。
 * - --frame 会被钳制到 [0, durationInFrames-1]。
 * - Chromium：默认用 @remotion/renderer 自带的浏览器（首次运行自动下载到
 *   node_modules/.remotion）；也可设环境变量 TALKCRAFT_CHROMIUM_PATH 指向
 *   一个现成的 Chromium 可执行文件。
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

const require = createRequire(import.meta.url);

const fail = (message) => {
  process.stderr.write(`[talkcraft-render] 失败：${message}\n`);
  process.exit(1);
};

const usage = () => `用法：
  node render-card.mjs --card <卡片 tsx 绝对路径> [--props <JSON 对象>] [--width <宽>] [--height <高>] [--fps <帧率>] --frame <帧号> --out <输出 PNG 绝对路径>

说明：
  --width/--height/--fps 不传时取卡片 meta 里的值；传了则覆盖输出尺寸。
  --frame 会被钳制到 [0, durationInFrames-1]。
  Chromium：默认用 @remotion/renderer 自带的浏览器（首次运行自动下载到 node_modules/.remotion）；
  也可以设置环境变量 TALKCRAFT_CHROMIUM_PATH 指向一个现成的 Chromium 可执行文件。`;

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

// ---------- Chromium ----------
let browserExecutable = null;
const envChrome = process.env.TALKCRAFT_CHROMIUM_PATH;
if (envChrome) {
  if (!existsSync(envChrome)) {
    fail(`环境变量 TALKCRAFT_CHROMIUM_PATH 指向的文件不存在：${envChrome}`);
  }
  browserExecutable = envChrome;
}

// ---------- 生成临时入口 tsx ----------
const dir = mkdtempSync(join(tmpdir(), 'talkcraft-render-'));
const entryPath = join(dir, 'entry.tsx');
const entrySource = `// 自动生成：talkcraft-render 渲染入口（渲染完即删）
import Card, { meta } from ${JSON.stringify(cardPath)};
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

  if (!browserExecutable) {
    try {
      await ensureBrowser();
    } catch (e) {
      fail(
        `Chromium 准备失败（可设置环境变量 TALKCRAFT_CHROMIUM_PATH 指向现成浏览器）：${e.message ?? e}`,
      );
    }
  }

  const compositions = await getCompositions(bundled, { browserExecutable });
  const composition = compositions.find((c) => c.id === 'Card');
  if (!composition) {
    fail(
      '打包产物里没有找到 id 为 "Card" 的 Composition（卡片文件可能没有正确 export default / meta）',
    );
  }

  const maxFrame = composition.durationInFrames - 1;
  const clamped = Math.max(0, Math.min(frame, maxFrame));
  if (clamped !== frame) {
    process.stderr.write(
      `[talkcraft-render] 注意：--frame=${frame} 超出范围，已钳制到 ${clamped}（总帧数 ${composition.durationInFrames}）\n`,
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
    `[talkcraft-render] 完成：${outPath}（${composition.width}x${composition.height}，第 ${clamped} 帧，用时 ${secs}s）\n`,
  );
  process.exit(0);
} catch (e) {
  fail(e.message ?? String(e));
} finally {
  rmSync(dir, { recursive: true, force: true });
}
