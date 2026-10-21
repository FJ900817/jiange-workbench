/** Package-owned invariant companion for the composite credential provider. @module @deepseek-ai/dsh-credentials-router/invariant */

import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-credentials-router'

/** Cordis companion plugin name. */
export const name = 'credentials-router-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/** The router's provider selection is verified by its package integration tests. */
const install: InvariantInstaller = () => {}

/** Register this package's invariant companion. @param ctx Cordis context carrying the invariant service. @returns its disposer. */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
