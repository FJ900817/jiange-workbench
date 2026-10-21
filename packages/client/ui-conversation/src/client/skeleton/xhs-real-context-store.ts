import { useSyncExternalStore } from 'react'
import type { XhsRealContext } from '@deepseek-ai/dsh-business-workbench/types'

/** Client-visible load state for the Host's read-only Swiss projection. */
export type XhsRealContextState =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly context: XhsRealContext }
  | { readonly status: 'unavailable' }

let state: XhsRealContextState = { status: 'loading' }
const listeners = new Set<() => void>()

/**
 * Publish one detached Host projection or a content-free unavailable state.
 * @param next - New read state from the Host Remote.
 */
export function publishXhsRealContext(next: XhsRealContextState): void {
  state = next
  for (const listener of listeners) listener()
}

/**
 * Subscribe a React surface to Host-projected sample changes.
 * @returns The current context state and unsubscribe callback factory result.
 */
export function useXhsRealContext(): XhsRealContextState {
  return useSyncExternalStore(subscribe, () => state, () => state)
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}
