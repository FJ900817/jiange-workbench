// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import type {
  SidebarFooterActionOwnerProps, SidebarRootComponentProps,
  SidebarSettingsOwnerProps,
} from '../src/client/contract/slots.ts'
import { SidebarRoot } from '../src/client/SidebarRoot.tsx'
import { selectWorkspaceIdentity } from '@deepseek-ai/dsh-client-ui-primitives'
import { en } from '../src/client/locales.ts'

// English-dictionary translate stub: the shell renders the same copy the
// assertions below query by accessible name.
const t: SidebarRootComponentProps['t'] = key => (en as Record<string, string>)[key] ?? key

afterEach(() => {
  cleanup()
  selectWorkspaceIdentity('command')
  vi.unstubAllEnvs()
  vi.useRealTimers()
})

// The shell receives the global Session hook but contextual navigation must
// not derive its visible regions from Session blankness.
const neverHook = (() => { throw new Error('shell must not read global hooks') }) as never
function sessionHook(active: boolean): SidebarRootComponentProps['useSessions'] {
  type HomeState = {
    current: string | undefined
    byId: Record<string, { blank: boolean }>
  }
  const state: HomeState = active
    ? { current: 's1', byId: { s1: { blank: false } } }
    : { current: undefined, byId: {} }
  return ((selector: (state: HomeState) => unknown) => selector(state)) as never
}

function mountShell({ collapsed = false, width = 300, activeSession = false }: {
  collapsed?: boolean
  width?: number
  activeSession?: boolean
} = {}) {
  const startSession = vi.fn()
  const toggleSidebar = vi.fn()
  let settingsOwner: SidebarSettingsOwnerProps | undefined
  let footerActionOwner: SidebarFooterActionOwnerProps | undefined
  const brandMark = <span data-testid="custom-brand-mark">M</span>
  const brandName = <span data-testid="custom-brand-name">Custom Brand</span>
  let current = { collapsed, width }
  const root = () => (
    <SidebarRoot
      collapsed={current.collapsed} width={current.width}
      useSessions={sessionHook(activeSession)} useWorkspaces={neverHook}
      startSession={startSession} toggleSidebar={toggleSidebar} t={t}
      renderSlot={((
        key: string,
        owner: SidebarFooterActionOwnerProps | SidebarSettingsOwnerProps,
      ) => {
        if (key === 'sidebar.brand.mark') return brandMark
        if (key === 'sidebar.brand.name') return brandName
        if (key === 'sidebar.brand.glyph') return <span data-testid="custom-brand-glyph">G</span>
        if (key === 'sidebar.brand.short-name') return 'Workbench'
        if (key === 'sidebar.settings') {
          settingsOwner = owner
          return <div data-testid="settings-seat" data-wide={owner.wide} />
        }
        if (key === 'sidebar.footer.action') {
          footerActionOwner = owner
          return <div data-testid="footer-action-seat" data-wide={owner.wide} />
        }
        return null
      }) as SidebarRootComponentProps['renderSlot']}
    />
  )
  const view = render(root())
  return {
    container: view.container,
    startSession,
    toggleSidebar,
    settingsOwner: () => {
      if (settingsOwner === undefined) throw new Error('settings owner not rendered')
      return settingsOwner
    },
    footerActionOwner: () => {
      if (footerActionOwner === undefined) throw new Error('footer action owner not rendered')
      return footerActionOwner
    },
    rerender(next: Partial<typeof current>) {
      current = { ...current, ...next }
      view.rerender(root())
    },
  }
}

describe('SidebarRoot shell', () => {
  it('keeps the global sidebar focused on Workspace navigation and auxiliary footer actions', () => {
    const b = mountShell()
    expect(screen.queryByRole('button', { name: 'Home' })).toBeNull()
    const navigation = screen.getByRole('navigation', { name: 'AI Workspace navigation' })
    expect(screen.getByRole('heading', { name: 'AI Workspace' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'More tools' })).toBeNull()
    for (const tool of ['Workspaces', 'Task board', 'SSH', 'Skills center']) expect(screen.queryByText(tool)).toBeNull()
    expect(screen.queryByText('Choose who appears on Home')).toBeNull()
    const projects = screen.getByRole('button', { name: 'Projects' })
    const command = screen.getByRole('button', { name: 'Command' })
    expect(command.getAttribute('aria-pressed')).toBe('true')
    expect(projects.getAttribute('aria-pressed')).toBe('false')
    expect(screen.getAllByRole('button', { name: /^(Command|Projects|Work|Studios|Radar)$/ })).toHaveLength(5)
    expect(navigation.querySelectorAll('.unreadIndicator')).toHaveLength(0)
    expect(screen.queryByText('总控')).toBeNull()
    expect(screen.queryByText('项目')).toBeNull()
    expect(screen.queryByText('工作台')).toBeNull()
    expect(screen.queryByText('创作工作室')).toBeNull()
    expect(screen.queryByText('资讯雷达')).toBeNull()
    for (const name of ['Command', 'Projects', 'Work', 'Studios', 'Radar']) expect(screen.getByText(name)).toBeTruthy()
    fireEvent.click(projects)
    expect(projects.getAttribute('aria-pressed')).toBe('true')
    expect(command.getAttribute('aria-pressed')).toBe('false')
    expect(screen.queryByRole('button', { name: 'More tools' })).toBeNull()
    expect(b.startSession).not.toHaveBeenCalled()
    expect(b.toggleSidebar).not.toHaveBeenCalled()

    for (const route of ['Work', 'Studios', 'Radar']) {
      const entry = screen.getByRole('button', { name: route })
      fireEvent.click(entry)
      expect(entry.getAttribute('aria-pressed')).toBe('true')
      expect(screen.queryByRole('button', { name: 'More tools' })).toBeNull()
    }

    fireEvent.click(command)
    expect(screen.queryByRole('button', { name: 'More tools' })).toBeNull()
  })

  it('keeps the same compact global navigation in a nonblank Session', () => {
    mountShell({ activeSession: true })
    expect(screen.queryByRole('button', { name: 'Home' })).toBeNull()
    expect(screen.getByRole('navigation', { name: 'AI Workspace navigation' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Projects' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'More tools' })).toBeNull()
    expect(screen.getAllByRole('button', { name: 'New session' })).toHaveLength(1)
    for (const tool of ['Workspaces', 'Task board', 'SSH', 'Skills center']) expect(screen.queryByText(tool)).toBeNull()
  })

  it('shows Library as a low-weight auxiliary placeholder and closes it on workspace navigation', () => {
    render(<SidebarRoot
      collapsed={false} width={300}
      useSessions={sessionHook(false)} useWorkspaces={neverHook}
      startSession={vi.fn()} toggleSidebar={vi.fn()} t={t}
      renderSlot={(key => key === 'sidebar.settings' ? <button type="button">Settings</button> : null) as SidebarRootComponentProps['renderSlot']}
    />)
    const library = screen.getByRole('button', { name: 'Library' })
    expect(screen.queryByRole('status')).toBeNull()
    fireEvent.click(library)
    expect(screen.getByRole('status').textContent).toBe('Library is not available yet')
    fireEvent.click(screen.getByRole('button', { name: 'Projects' }))
    expect(screen.queryByRole('status')).toBeNull()
    expect(screen.getByRole('button', { name: 'Settings' })).toBeTruthy()
  })

  it('keeps the brand identity separate from New Session and the column toggle', () => {
    const b = mountShell()
    expect(screen.getByTestId('custom-brand-mark')).toBeTruthy()
    expect(screen.getByTestId('custom-brand-name')).toBeTruthy()
    // Only the New Session control starts a session; the brand is a replaceable identity slot.
    const starters = screen.getAllByRole('button', { name: 'New session' })
    expect(starters).toHaveLength(1)
    for (const button of starters) fireEvent.click(button)
    expect(b.startSession).toHaveBeenCalledOnce()
    fireEvent.click(screen.getByRole('button', { name: 'Collapse sidebar' }))
    expect(b.toggleSidebar).toHaveBeenCalledOnce()
  })

  it('renders generic brand fallbacks when no package fills the slots', () => {
    const { container } = render(<SidebarRoot
      collapsed={false} width={300}
      useSessions={sessionHook(false)} useWorkspaces={neverHook}
      startSession={vi.fn()} toggleSidebar={vi.fn()} t={t}
      renderSlot={((_key: string, _owner: unknown, options?: { fallback?: ReactNode }) =>
        options?.fallback ?? null) as SidebarRootComponentProps['renderSlot']}
    />)

    expect(screen.getByText('简哥')).toBeTruthy()
    expect(screen.getByText('·')).toBeTruthy()
    expect(container.querySelector('img[src="/brand/workbench-wordmark.svg"]')).not.toBeNull()
    expect(screen.queryByText('Business Workbench')).toBeNull()
    expect(screen.queryByText('DSH Local Build')).toBeNull()
    expect(container.querySelector('svg')).not.toBeNull()
  })

  it('keeps settings and footer action geometry independent from Workspace navigation', () => {
    const b = mountShell()
    // The settings seat rides the same wide flag (ui-settings renders the row).
    expect(b.settingsOwner().wide).toBe(true)
    expect(b.footerActionOwner().wide).toBe(true)
    expect(b.toggleSidebar).not.toHaveBeenCalled()
  })

  it('renders compact workspace identities, aligned system status, and Voice in the rail', () => {
    const { container } = render(<SidebarRoot
      collapsed={true} width={76}
      useSessions={sessionHook(false)} useWorkspaces={neverHook}
      startSession={vi.fn()} toggleSidebar={vi.fn()} t={t}
      renderSlot={((_key: string, _owner: unknown, options?: { fallback?: ReactNode }) =>
        options?.fallback ?? null) as SidebarRootComponentProps['renderSlot']}
    />)

    const root = container.firstElementChild
    expect(root?.getAttribute('data-sidebar-rail-collapsed')).toBe('true')
    const identities = container.querySelectorAll('[data-workspace-identity][data-compact="true"]')
    expect(identities).toHaveLength(5)
    expect(container.querySelector('[data-sidebar-system-status-seat]')).not.toBeNull()
    expect(container.querySelector('[data-sidebar-voice-seat]')).not.toBeNull()
  })

  it('keeps the Voice seat mounted across expanded and collapsed transitions', () => {
    vi.useFakeTimers()
    const b = mountShell()
    const seat = b.container.querySelector('[data-sidebar-voice-seat]')

    expect(seat).not.toBeNull()
    expect(seat?.getAttribute('aria-hidden')).toBe('true')

    b.rerender({ collapsed: true })
    expect(b.container.querySelector('[data-sidebar-voice-seat]')).toBe(seat)
    expect(b.container.firstElementChild?.getAttribute('data-sidebar-rail-collapsed')).toBe('true')

    act(() => { vi.advanceTimersByTime(200) })
    expect(seat?.getAttribute('aria-hidden')).toBe('false')

    b.rerender({ collapsed: false })
    expect(b.container.querySelector('[data-sidebar-voice-seat]')).toBe(seat)
    expect(seat?.getAttribute('aria-hidden')).toBe('true')
  })

  it('renders statically collapsed on a cold start (no crossfade classes)', () => {
    mountShell({ collapsed: true })
    expect(screen.getByRole('button', { name: 'Open sidebar' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Workbench' })).toBeTruthy()
    expect(screen.getAllByRole('button', { name: /^(Command|Projects|Work|Studios|Radar)$/ })).toHaveLength(5)
    expect(screen.queryByRole('button', { name: 'More tools' })).toBeNull()
  })

  it('keeps Command-only tools out of the collapsed rail on other routes', () => {
    selectWorkspaceIdentity('work')
    mountShell({ collapsed: true })
    expect(screen.queryByRole('button', { name: 'More tools' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Library' })).toBeTruthy()
    expect(screen.getByTestId('settings-seat').getAttribute('data-wide')).toBe('false')
  })
})
