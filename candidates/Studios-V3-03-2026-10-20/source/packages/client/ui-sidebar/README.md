# @deepseek-ai/dsh-client-ui-sidebar

English | [中文](README.zh.md)

Sidebar shell plugin: replaceable brand slots, New Session action, Business Workspace routes, layout-owned collapse control, and bottom-pinned Library and Settings entries. The global sidebar does not render the native Workspace / Session browser or Command helper links; Command exposes those through its own quick-access area. Collapse into the layout-owned 76px action rail remains presentation-local. Contract: the [slot system standard](../../../.agents/notes/implemented/architecture/2026-07-22-slot-type-chain-implementation.md).

The sidebar always renders Command, Projects, Work, Studios, and Radar as first-level Business Workspace routes. Expanded entries use a 44px identity target with a 40px mark and persistent name; Workspace rows are 56px high with 10px list gaps. Hover adds a light highlight; the selected route keeps its pale identity background and leading color bar. The 76px collapsed rail retains its independent 44px target and compact badge. Command is the default route and retains the native conversation shell; Projects, Work, Studios, and Radar render their current surfaces. Command quick access opens the existing Workspace / Session browser in a modal; it does not create another data source or session state. Library, optional footer actions, the system-update status seat, Settings, and the existing native Voice launcher occupy the shared footer grid; Voice continues using its native handler. The native updater anchors its existing status button to the system-status seat; candidate failures remain inspectable and open the existing details panel. Runtime Workspace and Session selection are separate from the Business Workspace route. Current Grok-derived SVGs have no confirmed reuse license and are not cleared for package release or commercial redistribution.

The brand has independent `sidebar.brand.mark`, `sidebar.brand.name`, `sidebar.brand.glyph`, and `sidebar.brand.short-name` single slots. The expanded wordmark and compact rail glyph can use distinct artwork and copy. The shell fallback is a neutral geometric mark and the temporary `Business Workbench` / `Workbench` name pair. `ui-brand-official` does not occupy these slots, so the main UI brand does not expose Harness product branding; the app identity, Bundle ID, CLI, Runtime, and repository remain unchanged. A deployment package can replace each presentation value without replacing the New Session control or rail geometry; declaration-aware `slots.inject()` supports either activation order.

New Session starts the runtime's page-local frontend Session Intent. The runtime targets the explicit Workspace used by a scoped action, otherwise the current Session's Workspace, otherwise the most recently active Workspace; when none exists it clears into the blank New Session page. Workspace-specific controls and the shared picker belong to ui-workspace.

`SidebarRootComponentProps` composes the layout owner share, global session/workspace hooks, brand and Settings slots, optional footer actions, and injected `startSession` plus sidebar-toggle callbacks. Business Workspace route state does not derive from Session state or create a Runtime Workspace. There is no plugin store.

During a live collapse, the shell holds expanded content at its current width while it fades out for 150ms, then switches to the independently laid-out 76px rail. The five Workspace identities remain visible in the rail with their existing independent compact artwork and 44px hit target. A page that starts collapsed renders the rail statically, and reduced-motion mode disables rail entry transitions.

Scrollbars in the column are a pointer affordance: the shell rebinds ui-theme's [scrollbar indirection](../ui-theme/README.md) to `transparent` whenever the pointer is outside it, and keeps the thumb drawn for 2s after the pointer leaves, so a list nobody is pointing at carries no bar. The reservation that keeps rows from moving belongs to the scrolling region ([ui-workspace](../ui-workspace/README.md)), so revealing a thumb never reflows.

The footer holds the `sidebar.settings` seat, an optional `sidebar.footer.action` list, and stable DOM anchors for native Voice and updater controls. The Voice seat remains mounted but hidden in expanded mode, so the macOS bridge can move its single launcher as soon as the collapsed marker changes; a missing seat never falls back to expanded Settings coordinates. In collapsed windows below 920px high, the rail keeps all five Workspace targets, Library, System Status, Settings, and Voice visible while hiding optional footer actions. The 900 × 640 point native window minimum is tested with this compact-height layout. The sidebar shares only its column state (`wide`); ui-settings registers the Settings trigger row and panel, while the macOS bridge positions the update status from its anchor.

The `/client` exports are the plugin body (`apply`/`inject`) plus the contract types only; SidebarRoot, the row components, and the tree derivation remain package-internal behind the slot registration.

## Model Experience

None, as the sidebar renders the browser session list; nothing here reaches a model request.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

- **Session state-dot rendering is owned by [ui-workspace](../ui-workspace/README.md)** — no done/error notification sources are available.
- **Workspace browser behavior is composition-owned** — grouping, ordering, search, and row state belong to [ui-workspace](../ui-workspace/README.md), not this shell.
- **"New task completed" unread marking is local viewing state** — completion-time > last-seen never reaches the host.
