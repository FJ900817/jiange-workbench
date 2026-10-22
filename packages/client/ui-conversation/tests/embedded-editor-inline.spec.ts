import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * embedded-editor.ts 内联新鲜度校验。
 *
 * 浏览器 bundle（embedded-editor.ts）里内联了 11 份源文件（editor.html/css/js +
 * 各模块 js）。源文件改了但忘记跑 `node gen-embedded-editor.mjs` 时，bundle
 * 里还是旧版——之前已经悄悄过期过两次。这个测试让过期在提交前就报错，
 * 并用中文指出是哪一份内联过期了。
 */

const HERE = dirname(fileURLToPath(import.meta.url))
const VP = join(HERE, '../src/client/skeleton/video-packaging')

/** 与 gen-embedded-editor.mjs 的 SOURCES 保持一致：[bundle 导出名, 源文件]。 */
const INLINE_SOURCES: ReadonlyArray<readonly [string, string]> = [
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

/** 与 gen-embedded-editor.mjs 的 escapeSingleQuoted 逐字一致。 */
const escapeSingleQuoted = (s: string): string =>
  s
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/`/g, '\\`')
    .replace(/\$\{/g, '\\${')
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n')

/** 与 gen-embedded-editor.mjs 的 escapeDoubleQuoted 逐字一致。 */
const escapeDoubleQuoted = (s: string): string =>
  s
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n')

/** 按生成器逻辑算出某一行内联在 bundle 里应该长什么样。 */
const expectedLine = (name: string, file: string): string => {
  const content = readFileSync(join(VP, file), 'utf8')
  return name === 'assetRetrievalJs'
    ? `export const ${name} = "${escapeDoubleQuoted(content)}"`
    : `export const ${name} = '${escapeSingleQuoted(content)}'`
}

describe('embedded-editor.ts 内联新鲜度', () => {
  const bundleText = readFileSync(join(VP, 'embedded-editor.ts'), 'utf8')
  const bundleLines = new Set(bundleText.split('\n'))

  it('11 份内联与源文件逐字节一致', () => {
    const stale: string[] = []
    for (const [name, file] of INLINE_SOURCES) {
      if (!bundleLines.has(expectedLine(name, file))) stale.push(`${name}（源文件 ${file}）`)
    }
    expect(
      stale,
      stale.length > 0
        ? `以下内联已过期，请在仓库根目录跑 \`node gen-embedded-editor.mjs\` 重新生成 embedded-editor.ts：\n${stale.join('\n')}`
        : '内联与源文件一致',
    ).toEqual([])
  })

  it('bundle 里的导出集合与清单完全一致', () => {
    const exported = bundleText
      .split('\n')
      .filter(line => line.startsWith('export const '))
      .map((line) => {
        const [name = ''] = line.slice('export const '.length).split(' ')
        return name
      })
    const expected = INLINE_SOURCES.map(([name]) => name)
    expect(
      exported.sort(),
      'bundle 的导出集合变了：请检查 gen-embedded-editor.mjs 是否增删了内联，并同步更新本测试的 INLINE_SOURCES',
    ).toEqual(expected.sort())
  })
})
