#!/usr/bin/env node
/**
 * library-render · AI口播包装库（aikou）渲染器。
 *
 * aikou 组件是纯 HTML/Canvas 2D 渲染器（aikou-components.js，无 DOM 依赖的
 * drawAikouComponent + 需 DOM 的 renderAikouOverlayPng）。本 CLI 用 headless
 * Chromium（playwright-core）加载内联后的模块，调用 renderAikouOverlayPng
 * 把组件画到整幅画布上，导出带透明通道的 RGBA PNG，供视频包装台 Host 渲染
 * 服务叠加。aikou 组件按整幅画布绝对坐标绘制，输出 PNG 即整幅画布尺寸，
 * FFmpeg 叠加时定位 (0,0)。
 *
 * 用法：
 *   node render-aikou.mjs --module /abs/path/aikou-components.js \
 *     --ref '{"lib":"aikou","componentId":"tag","params":{"label":"...","x":40,"y":300}}' \
 *     --width 1920 --height 1080 --time 1.5 --out /abs/out.png
 *
 * 说明：
 * - --time 是组件内时间（秒），0 = 组件起始。
 * - Chromium 解析见 resolve-chromium.mjs（环境变量优先，其次自动下载）。
 * - 成功 exit 0；失败 exit 非 0 并在 stderr 输出中文原因。
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute } from 'node:path';
import { createRequire } from 'node:module';
import { resolveChromiumExecutable } from './resolve-chromium.mjs';

const require = createRequire(import.meta.url);

const fail = (message) => {
  process.stderr.write(`[library-render] 失败：${message}\n`);
  process.exit(1);
};

const usage = () => `用法：
  node render-aikou.mjs --module <aikou-components.js 绝对路径> --ref <libraryRef JSON> --width <宽> --height <高> --time <秒> --out <输出 PNG 绝对路径>

说明：
  --ref 如 '{"lib":"aikou","componentId":"tag","params":{"label":"标题","x":40,"y":300}}'。
  --time 是组件内时间（秒），0 = 组件起始。
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

const modulePath = args.module;
if (!modulePath) fail(`缺少必填参数 --module\n${usage()}`);
if (!isAbsolute(modulePath)) fail(`--module 必须是绝对路径，收到：${modulePath}`);
if (!existsSync(modulePath)) fail(`组件模块不存在：${modulePath}`);

let ref = null;
if (!args.ref) fail(`缺少必填参数 --ref\n${usage()}`);
try {
  ref = JSON.parse(args.ref);
} catch {
  fail(`--ref 不是合法 JSON：${args.ref}`);
}
if (ref === null || typeof ref !== 'object' || Array.isArray(ref)) {
  fail(`--ref 必须是 JSON 对象`);
}

const intArg = (name, value, { min = 1 } = {}) => {
  const n = Number(value);
  if (!Number.isInteger(n) || n < min) {
    fail(`--${name} 必须是 ≥${min} 的整数，收到：${value}`);
  }
  return n;
};
if (args.width === undefined) fail(`缺少必填参数 --width\n${usage()}`);
if (args.height === undefined) fail(`缺少必填参数 --height\n${usage()}`);
if (args.time === undefined) fail(`缺少必填参数 --time\n${usage()}`);
const width = intArg('width', args.width);
const height = intArg('height', args.height);
const time = Number(args.time);
if (!Number.isFinite(time) || time < 0) {
  fail(`--time 必须是非负数，收到：${args.time}`);
}

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

// ---------- 内联模块（与 embedded-editor.ts 同约定：顶层 export 逐行剥离） ----------
let moduleSource;
try {
  moduleSource = readFileSync(modulePath, 'utf8').replace(/^export /gm, '');
} catch (e) {
  fail(`读取组件模块失败：${e.message ?? e}`);
}
if (!moduleSource.includes('renderAikouOverlayPng')) {
  fail(`组件模块缺少 renderAikouOverlayPng（不是有效的 aikou 组件模块）：${modulePath}`);
}
// 防 <script> 提前闭合（与 p1-verify 的 safeScript 同理）
const safeScript = (source) => source.replaceAll('</script', '<\\/script');
const refJson = safeScript(JSON.stringify(ref));

const html = `<!doctype html><html><head><meta charset="utf-8">
<style>html,body{margin:0;padding:0;background:transparent;overflow:hidden}</style>
</head><body>
<script>${safeScript(moduleSource)}</script>
<script>
window.__aikouResult = null;
(async () => {
  try {
    const blob = await renderAikouOverlayPng(${refJson}, ${width}, ${height}, ${time});
    const buf = await blob.arrayBuffer();
    const bytes = new Uint8Array(buf);
    let binary = '';
    const CHUNK = 32768;
    for (let i = 0; i < bytes.length; i += CHUNK) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
    }
    window.__aikouResult = { ok: true, base64: btoa(binary) };
  } catch (e) {
    window.__aikouResult = { ok: false, error: String((e && e.message) || e) };
  }
})();
</script>
</body></html>`;

const t0 = Date.now();
let browser = null;
try {
  const { chromium } = await import('playwright-core');
  let executablePath = null;
  try {
    executablePath = resolveChromiumExecutable();
  } catch (resolveError) {
    // 没有现成浏览器：用 @remotion/renderer 下载一个，再复用
    try {
      const { ensureBrowser } = await import('@remotion/renderer');
      await ensureBrowser();
      executablePath = resolveChromiumExecutable();
    } catch (e) {
      fail(`Chromium 准备失败：${resolveError.message}；自动下载也失败：${e.message ?? e}`);
    }
  }
  browser = await chromium.launch({
    executablePath,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  const page = await browser.newPage({ viewport: { width, height } });
  page.on('pageerror', (e) => {
    process.stderr.write(`[library-render] 页面错误：${String(e).slice(0, 300)}\n`);
  });
  await page.setContent(html, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction('window.__aikouResult !== null', { timeout: 60000 });
  const result = await page.evaluate('window.__aikouResult');
  if (!result || result.ok !== true) {
    fail(`组件渲染失败：${(result && result.error) || '未知错误'}`);
  }
  const pngBytes = Buffer.from(result.base64, 'base64');
  if (pngBytes.length === 0) fail('渲染出了空 PNG');
  // PNG 魔数校验
  const pngMagic = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (!pngBytes.subarray(0, 8).equals(pngMagic)) fail('渲染产物不是合法 PNG');
  writeFileSync(outPath, pngBytes);
  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  process.stdout.write(
    `[library-render] 完成：${outPath}（${width}x${height}，aikou 组件，用时 ${secs}s）\n`,
  );
  process.exit(0);
} catch (e) {
  fail(e.message ?? String(e));
} finally {
  if (browser) await browser.close().catch(() => {});
}
