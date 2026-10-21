/** Sidebar shell style contracts shared with its slot-owned controls. */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const css = readFileSync(fileURLToPath(new URL('../src/client/SidebarRoot.module.css', import.meta.url)), 'utf8')
const identityCss = readFileSync(fileURLToPath(new URL('../../ui-primitives/src/WorkspaceIdentity.module.css', import.meta.url)), 'utf8')

/**
 * Declarations of one exact selector, keyed by property.
 * @param selector - exact selector text.
 * @returns the normalized declarations, or undefined when absent.
 */
function declarations(selector: string, source = css, last = false): Map<string, string> | undefined {
  const withoutComments = source.replace(/\/\*[\s\S]*?\*\//g, ' ')
  let result: Map<string, string> | undefined
  for (const [, selectorList = '', body = ''] of withoutComments.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (!selectorList.split(',').map(value => value.trim()).includes(selector)) continue
    const found = new Map<string, string>()
    for (const part of body.split(';')) {
      const colon = part.indexOf(':')
      if (colon === -1) continue
      found.set(part.slice(0, colon).trim(), part.slice(colon + 1).trim().replace(/\s+/g, ' '))
    }
    if (!last) return found
    result = found
  }
  return result
}

describe('SidebarRoot.module.css', () => {
  it('keeps the global sidebar independent from the Command browser surface', () => {
    const root = declarations('.root')
    expect(root?.get('--dsh-sidebar-inline-padding')).toBe('12px')
    expect(root?.get('padding')).toBe('6px var(--dsh-sidebar-inline-padding)')
    expect(css).not.toMatch(/regionArea|harnessTools|railToolsArea/)
  })

  it('uses a short independent rail transition and keeps the footer anchored', () => {
    const animation = 'rail-in 100ms var(--ds-ease-in-out) backwards'
    for (const selector of [
      '.railIn .iconButton',
      '.railIn .newSession',
    ]) {
      expect(declarations(selector)?.get('animation')).toBe(animation)
    }
    expect(declarations('.railIn .footArea')?.get('animation')).toBe(
      'rail-fade-in 100ms var(--ds-ease-in-out) backwards',
    )
    expect(css).toMatch(
      /@keyframes rail-in\s*\{\s*from\s*\{\s*opacity: 0;\s*transform: translateX\(24px\);\s*}\s*}/,
    )
    expect(css).toMatch(/@keyframes rail-fade-in\s*\{\s*from\s*\{\s*opacity: 0;\s*}\s*}/)
  })

  it('gives the action rail its own centered 44px geometry', () => {
    expect(declarations('.collapsed .logoRow')?.get('justify-content')).toBe('center')
    expect(declarations('.collapsed .newSession')?.get('align-self')).toBe('center')
    expect(declarations('.collapsed .newSession')?.get('width')).toBe('44px')
    expect(declarations('.railControl')?.get('width')).toBe('44px')
    expect(declarations('.aiWorkspaceRail .aiWorkspaceList')?.get('gap')).toBe('12px')
    expect(declarations('.aiWorkspaceRail .workspaceButton [data-workspace-identity] > span:first-child')?.get('width')).toBe('34px')
  })

  it('shrinks only expanded mascot artwork and increases expanded Workspace rhythm', () => {
    expect(declarations('.workspaceButton')?.get('min-height')).toBe('56px')
    expect(declarations('.workspaceEntry')?.get('min-height')).toBe('56px')
    expect(declarations('.aiWorkspaceList')?.get('gap')).toBe('10px')
    expect(declarations('.workspaceButton [data-workspace-identity]')?.get('width')).toBe('44px')
    expect(declarations('.workspaceButton [data-workspace-identity] > span:first-child')?.get('width')).toBe('40px')
    expect(declarations('.aiWorkspaceRail .workspaceButton [data-workspace-identity] > span:first-child')?.get('width')).toBe('34px')
  })

  it('keeps external helper controllers mounted but removes their injected rows from the sidebar', () => {
    for (const selector of [
      '.root > :global([data-dsh-taskboard-entry])',
      '.root > :global([data-dsh-ssh-entry])',
      '.root > :global([data-dsh-skill-explorer-entry])',
    ]) {
      expect(declarations(selector)?.get('display')).toBe('none !important')
    }
    expect(css).toMatch(/data-dsh-taskboard-entry[\s\S]*?display: none !important/)
  })

  it('uses a dedicated compact identity badge and shared utility grid', () => {
    expect(declarations('.collapsed .systemStatusSeat')?.get('width')).toBe('44px')
    expect(declarations('.collapsed .systemStatusSeat')?.get('height')).toBe('44px')
    expect(declarations('.voiceSeat')?.get('width')).toBe('44px')
    expect(declarations('.collapsed .voiceSeat')?.get('height')).toBe('44px')
    expect(css).toMatch(/\.collapsed \.footerActions\s*\{[^}]*flex-direction: column;[^}]*align-items: center;/)
    expect(declarations('.compact', identityCss)?.get('width')).toBe('36px')
    expect(declarations('.compact', identityCss)?.get('height')).toBe('36px')
    expect(declarations('.compact', identityCss)?.get('overflow')).toBe('visible')
    expect(declarations('.compact .mark', identityCss)?.get('width')).toBe('26px')
    expect(declarations('.compact .status', identityCss)?.get('right')).toBe('0')
    expect(declarations('.compact .status', identityCss)?.get('bottom')).toBe('0')
    expect(declarations('.unreadIndicator', identityCss)?.get('background')).toBe('var(--workspace-ink)')
    expect(declarations('.compact .unreadIndicator', identityCss)?.get('width')).toBe('8px')
    expect(declarations('.compact .unreadIndicator', identityCss)?.get('height')).toBe('8px')
    expect(declarations('.compact .unreadIndicator', identityCss)?.get('right')).toBe('0')
    expect(declarations('.compact .unreadIndicator', identityCss)?.get('bottom')).toBe('0')
  })

  it('keeps five identities and persistent utilities visible in short collapsed windows', () => {
    const shortWindow = css.split('@media (max-height: 919px)')[1]?.split('@media (prefers-reduced-motion')[0]
    expect(shortWindow).toBeDefined()
    expect(shortWindow).toMatch(/\.collapsed \.footerActions[\s\S]*?display: none/)
    expect(shortWindow).toMatch(/\.collapsed \.aiWorkspaceRail \.aiWorkspaceList \{ gap: 8px; \}/)
    expect(shortWindow).not.toMatch(/\.systemStatusSeat|\.settingsArea|\.voiceSeat|\.libraryArea/)
  })

  it('keeps the slotted brand row centered while preserving the vector wordmark ratio', () => {
    expect(declarations('.brandIdentity')?.get('height')).toBe('24px')
    expect(declarations('.brandName')?.get('height')).toBe('24px')
    expect(declarations('.brandName')?.get('line-height')).toBe('24px')
    expect(declarations('.brandName')?.get('font-size')).toBe('12px')
    expect(declarations('.brandName')?.get('font-weight')).toBe('600')
    expect(declarations('.brandWordmark')?.get('height')).toBe('10px')
    expect(declarations('.brandWordmark')?.get('width')).toBe('auto')
    expect(declarations('.brandChinese')?.get('white-space')).toBe('nowrap')
    expect(declarations('.brandSeparator')?.get('font-size')).toBe('14px')
    expect(declarations('.brandSeparator')?.get('font-weight')).toBe('700')
  })
})
