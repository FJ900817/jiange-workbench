/**
 * Sidebar shell: global route navigation and column geometry. Collapse is a slide plus crossfade:
 * content freezes at its expanded width (inline style) and fades out in place
 * while the sliding column (AppFrame grid tracks) clips it — nothing reflows
 * mid-slide. At settle the wide-only content unmounts and the four upper
 * controls enter the independent action rail from the same horizontal offset
 * and top-down order on one fade that ends with the slide. The bottom-pinned
 * settings control only fades. Business Workspace routes remain global; the
 * shell does not expose Command-specific Workspace, Session, or helper
 * controls. Command owns the on-demand Workspace browser entry. The footer
 * holds Library, `sidebar.settings`, and `sidebar.footer.action`.
 *
 * The column also owns whether the scroll regions nested in it draw a
 * scrollbar at all: the shell tracks the pointer and rebinds ui-theme's
 * scrollbar indirection away while it is elsewhere, so a list the user is not
 * pointing at carries no bar.
 */
import { useEffect, useRef, useState } from 'react'
import clsx from 'clsx'
import {
  WORKSPACE_IDENTITIES, WorkspaceIdentityAvatar, IconFolderOpenOutline16, IconNewChatOutline16,
  IconPanelLeftOutline16, Tooltip, selectWorkspaceIdentity, useWorkspaceIdentity,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { SidebarRootComponentProps } from './contract/slots.ts'
import css from './SidebarRoot.module.css'

/** Wide-content unmount delay; matches the 150ms wide-content fade-out. */
const COLLAPSE_SETTLE_MS = 150

/**
 * How long the column's scrollbars stay drawn after the pointer leaves it.
 * The bar is a pointer affordance here, and hiding it on the leave event
 * itself makes it blink out while the pointer is only crossing the column's
 * edge — on the way to the conversation, or around a portalled menu.
 */
const SCROLLBAR_LINGER_MS = 2000
const BRAND = { name: '简哥 · WORKBENCH', shortName: 'Workbench' } as const

function BrandMark({ size }: { size: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M4 5.5h16v3H4zM4 10.5h7v8H4zM13 10.5h7v3h-7zM13 15.5h7v3h-7z" fill="currentColor" />
  </svg>
}

function BrandGlyph({ size }: { size: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M5 5h14v4H9v10H5zM11 11h8v3h-8z" fill="currentColor" />
  </svg>
}

function WorkbenchBrandName() {
  return <>
    <span className={css.brandChinese}>
      <span>简哥</span>
      <span className={css.brandSeparator}>·</span>
    </span>
    <img className={css.brandWordmark} src="/brand/workbench-wordmark.svg" alt="" />
  </>
}

/**
 * Render the sidebar column shell.
 * @param props - composed slot props (runtime share + injected callbacks, contract/slots.ts).
 * @returns the sidebar element tree.
 */
export function SidebarRoot({
  collapsed,
  width,
  startSession,
  toggleSidebar,
  t,
  renderSlot,
}: SidebarRootComponentProps) {
  // Wide content stays mounted while the collapse animates (fading via
  // .collapsed .wide), unmounts at settle, and remounts right away on expand.
  const [settled, setSettled] = useState(collapsed)
  useEffect(() => {
    if (!collapsed) { setSettled(false); return }
    const timer = window.setTimeout(() => { setSettled(true) }, COLLAPSE_SETTLE_MS)
    return () => { window.clearTimeout(timer) }
  }, [collapsed])
  const wide = !collapsed || !settled
  const selectedWorkspace = useWorkspaceIdentity()
  const column = useRef<HTMLDivElement>(null)
  const [libraryOpen, setLibraryOpen] = useState(false)

  // Freeze the content at its expanded width while it fades out (collapsed
  // && wide): the sliding column then clips it instead of reflowing it. The
  // rail layout (.collapsed styles) only applies once the fade settles.
  const lastWideWidth = useRef(width)
  if (!collapsed) lastWideWidth.current = width

  // Rail-in only crossfades a live collapse: a refresh straight into the
  // collapsed state renders the rail statically (no delay-hidden icons).
  const everWide = useRef(!collapsed)
  if (!collapsed) everWide.current = true

  // Scrollbars in the column follow the pointer (.quietBars rebinds them
  // away): drawn while it is inside, and for SCROLLBAR_LINGER_MS after it
  // leaves. A pointer that returns within that window cancels the pending
  // hide rather than restarting from a hidden bar.
  const brandShortName = useRef<HTMLSpanElement>(null)
  const [pointerInside, setPointerInside] = useState(false)
  const lingerTimer = useRef<number | undefined>(undefined)
  const armLinger = (): void => {
    if (lingerTimer.current !== undefined) return
    lingerTimer.current = window.setTimeout(() => {
      lingerTimer.current = undefined
      setPointerInside(false)
    }, SCROLLBAR_LINGER_MS)
  }
  const cancelLinger = (): void => {
    window.clearTimeout(lingerTimer.current)
    lingerTimer.current = undefined
  }
  // Leaving is decided by the column's BOX, not by DOM containment, and only
  // while the bars are drawn. ui-settings renders its full-viewport panel as a
  // fixed-position DESCENDANT of this column, so a pointer moved onto that
  // panel — or onto the conversation once it closes — fires no `pointerleave`
  // here, and the bars would stay drawn over a column nobody is pointing at.
  // The element's own leave stays as the one signal geometry cannot give: a
  // pointer that leaves the window emits no further moves.
  useEffect(() => {
    if (!pointerInside) return
    const onMove = (event: PointerEvent): void => {
      const rect = column.current?.getBoundingClientRect()
      /* v8 ignore next -- the listener only exists while the column is mounted and revealed. */
      if (rect === undefined) return
      const inside = event.clientX >= rect.left && event.clientX < rect.right
        && event.clientY >= rect.top && event.clientY < rect.bottom
      if (inside) cancelLinger()
      else armLinger()
    }
    document.addEventListener('pointermove', onMove)
    return () => {
      document.removeEventListener('pointermove', onMove)
      cancelLinger()
    }
  }, [pointerInside])

  return (
    <div
      ref={column}
      data-sidebar-rail-collapsed={collapsed || undefined}
      className={clsx(
        css.root, !wide && css.collapsed, !wide && everWide.current && css.railIn,
        collapsed && wide && css.fading, !pointerInside && css.quietBars,
      )}
      style={wide ? { width: collapsed ? lastWideWidth.current : width } : undefined}
      onPointerEnter={() => {
        cancelLinger()
        setPointerInside(true)
      }}
      onPointerLeave={() => { armLinger() }}
    >
      <div className={css.logoRow}>
        {/* The brand identity is independent from navigation and New Session. */}
        {wide && (
          <div className={clsx(css.brand, css.wide)}>
            <span className={css.brandIdentity} aria-hidden="true">
              <span className={css.brandMark}>
                {renderSlot('sidebar.brand.mark', { size: 24 }, { fallback: <BrandMark size={24} /> })}
              </span>
              <span className={css.brandName}>
                {renderSlot('sidebar.brand.name', {}, {
                  fallback: <WorkbenchBrandName />,
                })}
              </span>
            </span>
          </div>
        )}
        {!wide && (
          <Tooltip label={() => brandShortName.current?.textContent?.trim() || BRAND.shortName} delayMs={350}>
            <button type="button" className={css.brandGlyph}>
              <span aria-hidden="true">
                {renderSlot('sidebar.brand.glyph', { size: 22 }, { fallback: <BrandGlyph size={22} /> })}
              </span>
              <span className={css.visuallyHidden} ref={brandShortName}>
                {renderSlot('sidebar.brand.short-name', {}, { fallback: BRAND.shortName })}
              </span>
            </button>
          </Tooltip>
        )}
        {wide && (
          <Tooltip label={t('toggle.collapse')} delayMs={500}>
            <button type="button" className={clsx(css.iconButton, css.headerToggle)} aria-label={t('toggle.collapse')} onClick={() => { toggleSidebar() }}>
              <IconPanelLeftOutline16 size={16} />
            </button>
          </Tooltip>
        )}
      </div>
      {!wide && (
        <div className={css.railControls}>
          <Tooltip label={t('toggle.open')} delayMs={500}>
            <button type="button" className={clsx(css.iconButton, css.railControl)} aria-label={t('toggle.open')} onClick={() => { toggleSidebar() }}>
              <IconPanelLeftOutline16 size={18} />
            </button>
          </Tooltip>
        </div>
      )}

      {/* Expanded, the button carries its own label — tooltip only on the rail. */}
      <Tooltip label={t('session.new.label')} delayMs={500} disabled={wide}>
        <button
          type="button"
          className={css.newSession}
          aria-label={t('session.new.label')}
          onClick={() => { startSession() }}
        >
          <IconNewChatOutline16 size={wide ? 14 : 18} />
          {wide && <span className={clsx(css.newSessionLabel, css.wide)}>{t('session.new')}</span>}
        </button>
      </Tooltip>

      <div className={clsx(css.homeNavigation, wide && css.wide)}>
        <nav className={clsx(css.aiWorkspace, !wide && css.aiWorkspaceRail)} aria-label={t('workspace.panel')}>
          {wide && <h2 className={css.groupHeading}>{t('workspace.heading')}</h2>}
          <ul className={css.aiWorkspaceList}>
            {WORKSPACE_IDENTITIES.map((workspace) => {
              const selected = selectedWorkspace === workspace.id
              return (
                <li className={css.workspaceEntry} key={workspace.id}>
                  <Tooltip label={workspace.name} delayMs={350} disabled={wide}>
                    <button
                      type="button"
                      className={clsx(css.workspaceButton, selected && css.workspaceButtonActive)}
                      data-workspace={workspace.id}
                      aria-label={workspace.name}
                      aria-pressed={selected}
                      onClick={() => {
                        setLibraryOpen(false)
                        selectWorkspaceIdentity(workspace.id)
                      }}
                    >
                      <WorkspaceIdentityAvatar workspace={workspace.id} compact={!wide} />
                      {wide && <span className={css.workspaceName}>{workspace.name}</span>}
                    </button>
                  </Tooltip>
                </li>
              )
            })}
          </ul>
        </nav>

      </div>

      {/* Footer actions stack above Settings in both sidebar widths. */}
      <div className={css.footArea}>
        <div className={css.libraryArea}>
          <Tooltip label={t('library.label')} delayMs={350} disabled={wide}>
            <button
              className={css.libraryButton}
              type="button"
              aria-label={t('library.label')}
              aria-expanded={libraryOpen}
              aria-controls="sidebar-library-placeholder"
              onClick={() => { setLibraryOpen(open => !open) }}
            >
              <IconFolderOpenOutline16 size={wide ? 16 : 18} />
              {wide && <span>{t('library.label')}</span>}
            </button>
          </Tooltip>
          {libraryOpen && (
            <div className={css.libraryNotice} id="sidebar-library-placeholder" role="status">
              {t('library.placeholder')}
            </div>
          )}
        </div>
        <div className={css.footerActions}>
          {renderSlot('sidebar.footer.action', { wide })}
        </div>
        <div
          className={css.systemStatusSeat}
          data-sidebar-system-status-seat=""
          aria-label={t('system.status')}
          title={t('system.status')}
        />
        <div className={css.settingsArea}>
          {renderSlot('sidebar.settings', { wide })}
        </div>
        <div className={css.voiceSeat} data-sidebar-voice-seat="" aria-hidden={wide} />
      </div>
    </div>
  )
}
