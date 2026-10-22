/**
 * aikou library-reference lint for packaging plans.
 * Ports the ideas of the AI narration-packaging library's lint.py to the
 * proposal level: whitelist membership, required params, and value domains.
 * Throws Chinese errors on the first violation; returns the plan unchanged
 * when every libraryRef is legal. Never calls a model.
 */

/** Components the AI may name in libraryRef.componentId (P0). */
export const AIKOU_COMPONENT_IDS = Object.freeze(['tag', 'qa', 'stat', 'months', 'numlist', 'strips', 'counter', 'tiles'])
const AIKOU_ALLOWLIST = new Set(AIKOU_COMPONENT_IDS)

/** Params the render engine reads per component; anything else is a self-invented style/field. */
const KNOWN_PARAMS = {
  tag: ['en', 'icon', 'label', 'x', 'y'],
  qa: ['a', 'dir', 'q', 'x', 'y'],
  stat: ['dark', 'items', 'type'],
  months: ['a', 'b', 'label', 'n', 'pre', 'unit', 'w', 'x', 'y'],
  numlist: ['focus', 'instant', 'items', 'label', 'life0', 'w', 'x', 'y'],
  strips: ['cols', 'fs', 'gap', 'h', 'head', 'items', 'style', 'y'],
  counter: ['at', 'c0', 'c1', 'color', 'from', 'label', 'out', 'size', 'suffix', 'to', 'x', 'y'],
  tiles: ['tiles'],
}

/** Params the AI must fill for each component (copied from the example templates). */
const REQUIRED_PARAMS = {
  tag: ['label', 'en', 'icon', 'x', 'y'],
  qa: ['q', 'a', 'dir', 'x', 'y'],
  stat: ['items'],
  months: ['label', 'n', 'unit', 'a', 'b', 'x', 'y'],
  numlist: ['label', 'items', 'x', 'y'],
  strips: ['head', 'items', 'y'],
  counter: ['label', 'from', 'to', 'x', 'y'],
  tiles: ['tiles'],
}

const TAG_ICONS = new Set(['bolt', 'gem', 'task', 'user', 'warn'])
const HEX_COLOR = /^#[0-9A-Fa-f]{6}$/

function fail(proposalId, message) {
  throw new Error(`组件 ${proposalId} 的组件引用非法：${message}`)
}

function checkNumber(proposalId, componentId, name, value) {
  if (!Number.isFinite(value)) fail(proposalId, `${componentId}.${name} 必须是数字，当前为 ${JSON.stringify(value)}`)
}

function checkNonEmptyString(proposalId, componentId, name, value) {
  if (typeof value !== 'string' || !value.trim()) fail(proposalId, `${componentId}.${name} 必须是非空文字`)
}

/** Validate one libraryRef against the whitelist, template fields, and value domains. */
function validateLibraryRef(proposalId, ref) {
  if (!ref || typeof ref !== 'object' || Array.isArray(ref)) fail(proposalId, '组件引用不是对象')
  if (ref.lib !== 'aikou') fail(proposalId, `引用的组件库是 "${ref.lib}"，P0 只开放 aikou`)
  const componentId = ref.componentId
  if (!AIKOU_ALLOWLIST.has(componentId)) {
    fail(proposalId, `组件 ID "${componentId}" 不在 8 个白名单组件内（${AIKOU_COMPONENT_IDS.join('、')}）`)
  }
  const params = ref.params
  if (!params || typeof params !== 'object' || Array.isArray(params)) fail(proposalId, '缺少参数包 params')
  const known = KNOWN_PARAMS[componentId]
  for (const key of Object.keys(params)) {
    if (!known.includes(key)) {
      fail(proposalId, `${componentId} 不允许的参数 "${key}"：只能照模板填空，不许自填颜色/字号或新增字段`)
    }
  }
  for (const key of REQUIRED_PARAMS[componentId]) {
    if (params[key] === undefined || params[key] === null) fail(proposalId, `${componentId} 缺少必填参数 "${key}"`)
  }
  switch (componentId) {
    case 'tag':
      if (!TAG_ICONS.has(params.icon)) fail(proposalId, `tag.icon 只能是 ${[...TAG_ICONS].join('/')}，当前为 ${JSON.stringify(params.icon)}`)
      checkNumber(proposalId, componentId, 'x', params.x)
      checkNumber(proposalId, componentId, 'y', params.y)
      checkNonEmptyString(proposalId, componentId, 'label', params.label)
      checkNonEmptyString(proposalId, componentId, 'en', params.en)
      break
    case 'qa':
      if (params.dir !== -1 && params.dir !== 1) fail(proposalId, `qa.dir 只能是 -1（贴左上）或 1（贴右上），当前为 ${JSON.stringify(params.dir)}`)
      checkNumber(proposalId, componentId, 'x', params.x)
      checkNumber(proposalId, componentId, 'y', params.y)
      checkNonEmptyString(proposalId, componentId, 'q', params.q)
      checkNonEmptyString(proposalId, componentId, 'a', params.a)
      break
    case 'stat': {
      if (!Array.isArray(params.items) || !params.items.length) fail(proposalId, 'stat.items 必须是非空数组')
      for (const [index, item] of params.items.entries()) {
        if (!item || typeof item !== 'object') fail(proposalId, `stat.items[${index}] 不是对象`)
        checkNumber(proposalId, componentId, `items[${index}].x`, item.x)
        checkNumber(proposalId, componentId, `items[${index}].y`, item.y)
        checkNonEmptyString(proposalId, componentId, `items[${index}].label`, item.label)
        checkNumber(proposalId, componentId, `items[${index}].from`, item.from)
        checkNumber(proposalId, componentId, `items[${index}].to`, item.to)
        checkNumber(proposalId, componentId, `items[${index}].at`, item.at)
        checkNumber(proposalId, componentId, `items[${index}].a`, item.a)
        checkNumber(proposalId, componentId, `items[${index}].b`, item.b)
        if (!(item.a < item.b)) fail(proposalId, `stat.items[${index}] 的计数时段 a 必须小于 b`)
      }
      break
    }
    case 'months':
      checkNonEmptyString(proposalId, componentId, 'label', params.label)
      if (!Number.isInteger(params.n) || params.n <= 0) fail(proposalId, `months.n 必须是正整数，当前为 ${JSON.stringify(params.n)}`)
      checkNonEmptyString(proposalId, componentId, 'unit', params.unit)
      checkNumber(proposalId, componentId, 'a', params.a)
      checkNumber(proposalId, componentId, 'b', params.b)
      if (!(params.a < params.b)) fail(proposalId, 'months 的点亮时段 a 必须小于 b')
      checkNumber(proposalId, componentId, 'x', params.x)
      checkNumber(proposalId, componentId, 'y', params.y)
      break
    case 'numlist': {
      checkNonEmptyString(proposalId, componentId, 'label', params.label)
      if (!Array.isArray(params.items) || !params.items.length) fail(proposalId, 'numlist.items 必须是非空数组')
      for (const [index, item] of params.items.entries()) {
        if (!item || typeof item !== 'object') fail(proposalId, `numlist.items[${index}] 不是对象`)
        checkNonEmptyString(proposalId, componentId, `items[${index}].no`, item.no)
        if (!Array.isArray(item.lines) || !item.lines.length) fail(proposalId, `numlist.items[${index}].lines 必须是非空数组`)
        for (const [lineIndex, line] of item.lines.entries()) {
          checkNonEmptyString(proposalId, componentId, `items[${index}].lines[${lineIndex}].text`, line?.text)
          checkNumber(proposalId, componentId, `items[${index}].lines[${lineIndex}].at`, line?.at)
        }
      }
      checkNumber(proposalId, componentId, 'x', params.x)
      checkNumber(proposalId, componentId, 'y', params.y)
      break
    }
    case 'strips': {
      checkNonEmptyString(proposalId, componentId, 'head', params.head)
      if (!Array.isArray(params.items) || !params.items.length) fail(proposalId, 'strips.items 必须是非空数组')
      for (const [index, item] of params.items.entries()) {
        if (!item || typeof item !== 'object') fail(proposalId, `strips.items[${index}] 不是对象`)
        checkNonEmptyString(proposalId, componentId, `items[${index}].k`, item.k)
        checkNonEmptyString(proposalId, componentId, `items[${index}].v`, item.v)
        checkNumber(proposalId, componentId, `items[${index}].at`, item.at)
      }
      checkNumber(proposalId, componentId, 'y', params.y)
      break
    }
    case 'counter': {
      const label = params.label
      if (typeof label === 'string') checkNonEmptyString(proposalId, componentId, 'label', label)
      else if (label && typeof label === 'object') checkNonEmptyString(proposalId, componentId, 'label.text', label.text)
      else fail(proposalId, 'counter.label 必须是文字或 {text,…} 对象')
      checkNumber(proposalId, componentId, 'from', params.from)
      checkNumber(proposalId, componentId, 'to', params.to)
      checkNumber(proposalId, componentId, 'x', params.x)
      checkNumber(proposalId, componentId, 'y', params.y)
      if (params.color !== undefined && !HEX_COLOR.test(params.color)) {
        fail(proposalId, `counter.color 必须是 #RRGGBB 格式，当前为 ${JSON.stringify(params.color)}`)
      }
      break
    }
    case 'tiles':
      if (!Array.isArray(params.tiles) || !params.tiles.length) fail(proposalId, 'tiles.tiles 必须是非空数组')
      break
    /* v8 ignore -- unreachable: componentId is allowlist-checked above */
    default:
      fail(proposalId, `未知组件 "${componentId}"`)
  }
}

/**
 * Lint every libraryRef in a packaging plan at the proposal level.
 * @param plan - validated packaging plan; proposals without libraryRef are skipped.
 * @returns the same plan when every reference is legal.
 * @throws Error with a Chinese message on the first illegal reference.
 */
export function validateAikouLibraryRefs(plan) {
  if (!plan || !Array.isArray(plan.proposals)) throw new Error('包装方案缺少提案列表，无法校验组件引用')
  for (const proposal of plan.proposals) {
    if (proposal.libraryRef !== undefined) validateLibraryRef(proposal.proposalId, proposal.libraryRef)
  }
  return plan
}
