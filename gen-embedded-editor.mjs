// 重新生成 embedded-editor.ts（editor.html/css/js + 各模块内联）。
// 用法：node gen-embedded-editor.mjs
// 校验：git diff 应只包含源文件的改动，不应有多余转义差异。
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const vp = join(here, 'packages/client/ui-conversation/src/client/skeleton/video-packaging')

const SOURCES = [
  ['editorHtml', 'editor.html'],
  ['editorCss', 'editor.css'],
  ['editorJs', 'editor.js'],
  ['aikouLintJs', 'aikou-lint.js'],
  ['talkcraftLintJs', 'talkcraft-lint.js'],
  ['shotcraftLintJs', 'shotcraft-cards/shotcraft-lint.js'],
  ['huashuStyleJs', 'huashu-style.js'],
  ['huashuStyleLintJs', 'huashu-style-lint.js'],
  ['packagingPlanJs', 'packaging-plan.js'],
  ['assetRetrievalJs', 'visual-asset-retrieval.js'],
  ['aikouComponentsJs', 'aikou-components.js'],
]

const escapeSingleQuoted = (s) =>
  s
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/`/g, '\\`')
    .replace(/\$\{/g, '\\${')
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n')

// assetRetrievalJs 源文件含单引号，原 bundle 对它用双引号包裹（照抄原规则）。
const escapeDoubleQuoted = (s) =>
  s
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n')

const out = SOURCES.map(([name, file]) => {
  const content = readFileSync(join(vp, file), 'utf8')
  return name === 'assetRetrievalJs'
    ? `export const ${name} = "${escapeDoubleQuoted(content)}"`
    : `export const ${name} = '${escapeSingleQuoted(content)}'`
}).join('\n') + '\n'

writeFileSync(join(vp, 'embedded-editor.ts'), out)
console.log('embedded-editor.ts 已重新生成')
