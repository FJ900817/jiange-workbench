# 还 lint 旧债 + embedded-editor 内联新鲜度测试

## 背景

- talkcraft 接线时，pre-commit lint 钩子被 `video-packaging.ts` 的 15 个
  pre-existing 错误拦截，接线员用 `--no-verify` 绕行（commit message 有注明）。
  本次把 15 个旧错修掉，钩子恢复全绿。
- `embedded-editor.ts` 内联之前两次悄悄过期（源文件更新了，bundle 里还是旧版）。
  按既定建议加自动化测试：过期即报错，不再靠人工发现。

## 任务一：15 个旧错（钩子配置 `.oxlintrc.staged.json`，typeAware 关闭）

`no-non-null-assertion` 4 条——全部去掉 `!`，运行时行为零变化：

- `createProject` / `saveProject` 的 `source.duration!`（2 处）：source-video
  素材的 duration 被 `inspectMp4` 的 `throw` 守卫保证非空（非法直接抛错，
  资产建不出来）。修法：加显式守卫
  `if (source.duration === null) throw invalid('project source is missing its duration')`，
  之后 TS 对 readonly 属性自动收窄，后续 `source.duration` 即为 `number`。
  守卫在可达状态下永不触发；不可达状态下把原来的静默脏数据变成明确报错。
- `decodePngHeader` 的 `bytes[25]!`：改为 `bytes.readUInt8(25)`。上一行已有
  `bytes.length < 33 → throw` 守卫，索引 25 必存在；且与相邻两行的
  `readUInt32BE` 写法一致。`!` 是编译期擦除，运行时逐字节一致。
- `parseRatio` 的 `numerator!`：`String.split` 永不返回空数组，解构默认值
  `const [numerator = 0, denominator] = ...` 永不触发，类型收窄为 `number`。

`@stylistic(max-len)` 10 条——纯换行，不动语义：zod audio schema 拆链；
两处 `Promise.all(filter().map())` 拆链；`beginUpload` / `appendUploadChunk` /
`readAssetChunk` / `saveProject` 签名按参数换行；saveProject 的 if 条件换行；
`ProbeResult` 的 streams 元素类型抽出为 `ProbeStream` 接口。

`sonarjs(no-identical-functions)` 1 条：`runBounded` 与 `runFfmpeg` 内的
`finish` 一字不差。抽出 `createErrorFinisher(isSettled, markSettled, timeout,
rejectPromise)` 工厂，两处改为调用。闭包读写同一 `settled` 绑定，
check → set → clearTimeout → reject 顺序与原来逐字一致。

跳过：0 条。15/15 全修。

## 任务二：内联新鲜度测试

新增 `packages/client/ui-conversation/tests/embedded-editor-inline.spec.ts`：

- 设计：自包含，不 import 根目录的 `gen-embedded-editor.mjs`（client
  typecheck 聚合没有 `allowJs`，`.mjs` import 会报 TS7016）。测试内 pin 住
  11 份内联清单 + 两份转义函数（与生成器逐字一致）——生成器转义逻辑若变，
  测试会 loud 失败，逼人工同步。
- 断言 1：11 份内联逐行与源文件转义后逐字节一致；失败时中文报错点名，
  如 `huashuStyleJs（源文件 huashu-style.js）`，并提示跑
  `node gen-embedded-editor.mjs`。
- 断言 2：bundle 里的 `export const` 集合与清单完全一致；生成器增删内联
  但忘记同步测试时失败。
- 反向验证过：临时改 `huashu-style.js` → 断言 1 按预期失败并点名；
  临时加 `export const fakeExtraJs` → 断言 2 按预期失败；恢复后全绿。

## 测试数据

- 钩子 lint（staged 配置）：`video-packaging.ts` 15 → 0 错误；
  新测试文件 0 错误。
- `video-packaging.spec.ts` 2/2、`video-packaging-model.spec.ts` 11/11、
  `video-packaging-talkcraft.spec.ts` 8/8（21/21，无回归）。
- `tsc --noEmit`（business-workbench 包）：干净。
- 新测试：2/2 通过；当前树 bundle 本就是同步的，首跑即绿。

## 遗留（本次范围外，已存在）

- 全量 type-aware lint 下 `video-packaging.ts` 还有 25 个旧错（12×zod `finite`
  deprecated、7×`passthrough` deprecated、1×`uuid` deprecated、4×
  `no-confusing-void-expression`、1×`no-unsafe-argument`）：钩子配置不查
  这些；zod deprecated 是版本迁移决策，不在这次还债范围。
- `tsc -b tsconfig.client.json` 有 44 个旧错，全在别的测试文件
  （aikou-lint / huashu-style / talkcraft-alpha / talkcraft-dispatch 的 spec），
  本次未动；新测试文件 0 错误。
