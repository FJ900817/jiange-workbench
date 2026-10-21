# @deepseek-ai/dsh-client-ui-brand-official

English | [中文](README.zh.md)

This package does not occupy sidebar brand slots. The main UI shell supplies its replaceable product identity through `sidebar.brand.mark`, `sidebar.brand.name`, `sidebar.brand.glyph`, and `sidebar.brand.short-name`; app identity, Bundle ID, CLI, Runtime, and repository naming remain independent. The blank-session Hero's mark slot remains available to deployments but is not filled here, leaving the selected Workspace identity visible.

The browser entry is an empty registration because the official Harness mark and wordmark are not the main UI's product brand. The package retains no runtime state. The node half is an empty Loader seat, and the browser title remains a build-environment concern outside this package.

## Model Experience

None, as the package contributes browser presentation only; nothing here reaches a model request.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

- **The package supplies one occupant set** — alternative presentation belongs in another Cordis package occupying the same slots.
- **The browser title is independent** — `DSH_CLIENT_TITLE` selects title text at build time rather than through a UI slot.
