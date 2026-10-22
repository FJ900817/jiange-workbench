/**
 * library-render 共享：Chromium 可执行文件解析。
 *
 * 解析顺序：
 * 1. 环境变量 LIBRARY_RENDER_CHROMIUM_PATH（新规范）
 * 2. 环境变量 TALKCRAFT_CHROMIUM_PATH（旧名，兼容）
 * 3. 本包 node_modules/.remotion 下 @remotion/renderer 已下载的浏览器
 * 4. ~/.cache/ms-playwright 下 playwright 已下载的 Chromium
 * 都找不到时抛中文错（调用方转为进程失败信息）。
 */
import { existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

const fail = (message) => {
  throw new Error(`[library-render] Chromium 解析失败：${message}`);
};

const executableNames = ['chrome', 'chrome-linux64/chrome', 'chrome-linux/chrome', 'headless_shell'];

/** 在目录（含一层子目录）里找可执行的 Chromium。 */
const findIn = (dir) => {
  if (!existsSync(dir)) return null;
  const candidates = [];
  for (const name of executableNames) candidates.push(join(dir, name));
  try {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        for (const name of executableNames) candidates.push(join(dir, entry.name, name));
      }
    }
  } catch {
    // 读目录失败就当没找到
  }
  return candidates.find((p) => existsSync(p)) ?? null;
};

export function resolveChromiumExecutable() {
  const envPath = process.env.LIBRARY_RENDER_CHROMIUM_PATH ?? process.env.TALKCRAFT_CHROMIUM_PATH;
  if (envPath) {
    if (!existsSync(envPath)) {
      fail(`环境变量指向的文件不存在：${envPath}（LIBRARY_RENDER_CHROMIUM_PATH 或 TALKCRAFT_CHROMIUM_PATH）`);
    }
    return envPath;
  }
  const remotionBrowser = findIn(join(here, 'node_modules', '.remotion'));
  if (remotionBrowser) return remotionBrowser;
  const playwrightCache = join(homedir(), '.cache', 'ms-playwright');
  const playwrightBrowser = findIn(playwrightCache);
  if (playwrightBrowser) return playwrightBrowser;
  fail(
    '没有找到可用的 Chromium。请二选一：1) 设置环境变量 LIBRARY_RENDER_CHROMIUM_PATH 指向一个现成的 Chromium/Chrome 可执行文件；2) 先跑一次 render-card.mjs 让 @remotion/renderer 自动下载浏览器。',
  );
  return null;
}
