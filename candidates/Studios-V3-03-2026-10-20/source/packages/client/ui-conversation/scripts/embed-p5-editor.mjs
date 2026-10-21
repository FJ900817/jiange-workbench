import { readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const sourceRoot = join(packageRoot, 'src/client/skeleton/video-packaging')
const entries = [
  ['editorHtml', 'editor.html'],
  ['editorCss', 'editor.css'],
  ['editorJs', 'editor.js'],
  ['packagingPlanJs', 'packaging-plan.js'],
  ['assetRetrievalJs', 'visual-asset-retrieval.js'],
]
const declarations = await Promise.all(entries.map(async ([name, file]) => {
  const source = await readFile(join(sourceRoot, file), 'utf8')
  return `export const ${name} = ${JSON.stringify(source)};`
}))
await writeFile(join(sourceRoot, 'embedded-editor.ts'), `${declarations.join('\n')}\n`)
