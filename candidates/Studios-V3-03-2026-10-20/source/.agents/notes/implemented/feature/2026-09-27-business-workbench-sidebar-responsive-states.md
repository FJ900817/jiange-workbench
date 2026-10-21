# Agent Note: Give the Business Workbench sidebar an independent action rail

Status: implemented

English | [中文](2026-09-27-business-workbench-sidebar-responsive-states.zh.md)

## Problem

The narrow sidebar must preserve access to Business Workspace routes and Command's native browsing controls without shrinking expanded navigation into clipped content. The main product brand also needs to change independently from Harness application identity.

## Decision

- The layout uses a 76px collapsed sidebar rail. Each 44px target contains its own 36px compact identity badge with a 26px mark and a fully inset status dot; expanded artwork is not scaled down to create the rail mark. Names remain visible in expanded mode and are available from rail tooltips.
- Command's native Workspace and Session browser stays mounted and is displayed in a side flyout from the rail. The flyout uses the same browser instance and closes on outside pointer input, Escape, Session selection, or leaving Command.
- More Tools is restricted to Command. It is inline in expanded mode and appears in a dismissible flyout in the collapsed rail.
- The sidebar declares independent `sidebar.brand.mark`, `sidebar.brand.name`, `sidebar.brand.glyph`, and `sidebar.brand.short-name` slots. The shell supplies neutral `Business Workbench` and `Workbench` fallbacks. `ui-brand-official` does not occupy the product brand slots; native app identity, Bundle ID, CLI, Runtime, and repository naming remain unchanged.
- The footer keeps the Voice seat mounted and hidden in expanded mode. The macOS bridge moves the single Voice launcher into this seat when the collapsed marker appears and never falls back to expanded Settings coordinates if the seat is absent.
- The macOS main window enforces a minimum content size of 900 × 640 points with AppKit. Below 920px of content height, the collapsed rail keeps all five Workspace targets, Library, System Status, Settings, and Voice visible by hiding secondary sidebar shortcuts and optional footer actions; expanding the sidebar restores those entries.
- Collapsing the sidebar changes layout presentation only. AppFrame keeps the conversation slot mounted, and the sidebar does not alter Session or Workspace data.

## Alternatives considered

- **Keep a 56px rail and compress existing controls** — rejected because it leaves too little room to center recognizable Workspace artwork and provide separate Workspace, New Session, browser, tools, and footer targets.
- **Expand the full sidebar when a collapsed Workspace or Session control is used** — rejected because it changes the user’s layout state and interrupts the current content context for a single browser action.
- **Mount a second browser inside the flyout** — rejected because duplicate browser instances could diverge in local search, grouping, and selection state.
- **Keep the official Harness wordmark as the product fallback** — rejected because the product brand must be replaceable without renaming or reconfiguring the Desktop shell or Runtime.

## Consequences

The rail provides separate, labeled Workspace and Command controls while preserving one native browser instance and the selected conversation subtree. The side flyout occupies screen space outside the sidebar and must remain keyboard-dismissible. The temporary shell brand is presentation-only; it does not change app title, Bundle ID, Runtime, CLI, or stored user data. The footer aligns Library, optional native controls, system status, Voice, and Settings to one centered utility grid. The single Voice launcher moves between its expanded position and persistent collapsed seat and continues to use its existing `startListening` handler. Candidate update failures remain represented by the existing native status control at the System Status anchor. The control opens the existing details and retry/log affordances without retrying or applying an update automatically. The 900 × 640 point minimum is enforced by the native window, while short-height secondary rail entries yield to the five Workspace routes and persistent utility targets.
