/**
* huashu-motion style lint: style/animation 铁律.
*
* The AI may not invent animation values or style values:
* - animation must be one of the 8 legal HUASHU_ANIMATIONS;
* - style exact-match against the locked preset is already enforced by
* validatePackagingPlan (STYLE_PRESETS) — this module owns the animation
* vocabulary check so the browser bundle can enforce it too.
* First violation throws a Chinese error; returns the plan unchanged when
* every proposal is legal. Never calls a model.
* Self-contained ESM: no imports (same convention as the other lints).
*/

/** Legal animation vocabulary (mirrors huashu-style.js HUASHU_ANIMATIONS). */
export const HUASHU_ANIMATIONS = Object.freeze([
'fadeUp',
'fade',
'none',
'slam',
'countUp',
'wordSwap',
'wipe',
'spring',
])
const ANIMATION_SET = new Set(HUASHU_ANIMATIONS)

function fail(proposalId, message) {
throw new Error(`组件 ${proposalId} 的风格非法：${message}`)
}

/**
* Lint every proposal's animation in a packaging plan.
* @param plan - packaging plan (needs a proposals array)
* @returns the same plan when every animation is legal.
* @throws Error with a Chinese message on the first illegal animation.
*/
export function validateHuashuStyle(plan) {
if (!plan ||!Array.isArray(plan.proposals)) throw new Error('包装方案缺少提案列表，无法校验风格')
for (const proposal of plan.proposals) {
const animation = proposal.animation
if (!ANIMATION_SET.has(animation)) {
fail(
proposal.proposalId,
`动画 "${String(animation)}" 不在 8 个合法取值内（${HUASHU_ANIMATIONS.join('、')}）：` +
'不许自创动效，按选最贴切的一个',
)
}
}
return plan
}
