/** Package-owned invariant companion for the macOS Keychain provider. @module @deepseek-ai/dsh-credentials-macos-keychain/invariant */

/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-credentials-macos-keychain'

/** Cordis companion plugin name. */
export const name = 'credentials-macos-keychain-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/** No runtime invariant: the provider exposes only credential operations; Keychain and pipe behavior are tested at the owning package. */
const install: InvariantInstaller = () => {}

/** Register this package's invariant companion. @param ctx Cordis context carrying the invariant service. @returns its disposer. */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
/* jscpd:ignore-end */
