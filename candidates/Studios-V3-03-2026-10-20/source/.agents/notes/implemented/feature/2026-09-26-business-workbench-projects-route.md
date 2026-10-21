# Agent Note: Keep Business Projects separate from Harness Workspace navigation

Status: implemented

English | [中文](2026-09-26-business-workbench-projects-route.zh.md)

## Problem

Business Workbench needed a real Projects surface without changing Harness Session, Runtime Workspace, or composer behavior. Treating each Business Workspace as a mascot-only selection did not provide a distinct page, while replacing the conversation tree would risk losing active Session and input state.

## Decision

- Keep the five Business Workspace identities as sidebar routes, with visible names in the expanded sidebar.
- Use the existing conversation shell as the Command route and keep that subtree mounted while another Business Workspace is displayed.
- Render Projects and its project detail as a separate UI surface inside the conversation root; keep representative data in a UI fixture module, not in Runtime persistence.
- Render Work as a fixture-backed lifecycle list with local detail-review state; its examples live in `work-fixtures.ts` and do not create Runtime Jobs or approvals.
- Present Work rows in title, localized current-step, and supporting Project/update-time order. Keep English system names secondary to Chinese business labels, place related artifacts in the detail's main content, and keep recent activity secondary.
- Render Studios as a fixture-backed UI route for Image Studio and a read-only Cover Studio prototype; keep Video Studio explicitly not open.
- Render Radar as a fixture-backed signal list and detail route. Keep source evidence, AI summary, and analysis in separate labeled sections; evidence/project/work actions update only local component state.
- Keep Studio candidate generation and approval in component-local state. Candidate metadata includes the project, Work, page, slot, model, prompt, dimensions, timestamp, and approval status; no Provider, Runtime Job, formal Artifact, or Renderer is called.
- Keep the native Workspace and Session browser mounted, but visible only on the Command route; show More Tools on expanded Command regardless of Session blankness.
- Keep Library beside Settings as a low-weight footer action that displays a local not-yet-open notice.

## Alternatives considered

- **Replace the conversation tree on route changes** — rejected because unmounting it would discard the in-memory composer subtree and could disrupt the currently displayed Session.
- **Add a Runtime Project registry now** — rejected because this phase validates the desktop interaction and page architecture using fixtures, and does not authorize a business-data model change.
- **Connect Work to Runtime Jobs or render it as a generic todo list** — rejected because this phase validates the lifecycle UI with isolated examples, and Work must show the current business step and next actor without adding Runtime or Approval integration.
- **Connect Image Studio candidate actions to image Providers now** — rejected because this phase validates the Studio surface and local selection flow; real generation and formal asset persistence are outside scope.
- **Connect Radar to MCP, web search, or a persisted Evidence/Work registry now** — rejected because this phase validates the source-to-evidence-to-project/work interaction with local examples only.
- **Leave all five entries as identity-only toggles** — rejected because Projects must be a real main-page transition, not a Hero-only change.

## Consequences

The Projects, Work, Studios, and Radar surfaces are demonstrable in the current UI, while project records, Work lifecycle state, Studio candidate and artifact metadata, Radar signals, Evidence state, project links, demo Work, activity, review choices, and Workspace bindings remain illustrative fixtures. Work review choices, Studio candidate approval, and Radar actions update only local component state; a Radar demo Work is not appended to the Work fixture list. Radar separates source evidence, AI summary, and analysis, but does not fetch sources or create persisted Evidence, Project, or Work records. Cover Studio displays the frozen Editorial template and Renderer certification status but does not run rendering, inject material, or create a formal Artifact. Hiding the native browser outside Command preserves its mounted UI state without exposing Session controls in business spaces. Library remains a local placeholder, Video Studio is not open, and the selected Business Workspace route is not persisted.
