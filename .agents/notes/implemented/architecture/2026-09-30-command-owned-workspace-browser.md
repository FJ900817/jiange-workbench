# Agent Note: Command owns the Workspace and Session browser entry

English | [中文](2026-09-30-command-owned-workspace-browser.zh.md)

Status: implemented

## Problem

The global sidebar showed the native Workspace and Session browser beside every Business Workspace route, even though its controls belong to Command. This made Projects, Work, Studios, and Radar inherit Command-specific navigation context.

## Decision

The sidebar owns only global navigation, New Session, and shared footer actions. `ui-workspace` registers the existing browser in Command's `conversation.command.workspaceBrowser` slot, and Command quick access opens it on demand. The browser keeps its existing store, Host-backed data, and actions; the move does not create a second Workspace or Session model.

Command quick access invokes the existing Task Board, SSH, and Skills plugin entry buttons through their `data-dsh-taskboard-entry`, `data-dsh-ssh-entry`, and `data-dsh-skill-explorer-entry` selectors. Sidebar CSS hides those injected legacy rows but does not unload their controllers or duplicate their panels. Command reports a plugin as unavailable when its entry is not mounted.

Expanded Workspace rows retain their 44px identity target and use a 40px mascot mark, 56px row height, and 10px list gap. Collapsed Rail artwork and hit targets remain unchanged.

## Alternatives considered

**Keep the browser in the sidebar and hide it on non-Command routes:** rejected because Command-specific navigation still occupies the global shell and complicates route-specific sidebar context.

**Create a second Command browser:** rejected because it would duplicate Workspace and Session view state and risk diverging from the Host-backed browser.

## Consequences

Projects, Work, Studios, and Radar no longer expose Command's Workspace / Session browser in the global sidebar. Command opens the same browser in an on-demand dialog, preserving its existing data and controls. Task Board, SSH, and Skills quick access invokes the existing plugin controllers without creating another view or state source. The expanded Sidebar has a taller but more widely spaced Workspace group; the collapsed Rail remains on its existing geometry.

## Testing

Sidebar tests verify that the global shell no longer renders Command helper entries or a Workspace browser slot. Conversation tests verify the Command quick-access controls and browser dialog, and Workspace / directory-picker tests pin the new slot registration and shared picker flow.
