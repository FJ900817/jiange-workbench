import { useSyncExternalStore } from 'react'

/** One-shot, in-memory navigation request from a read-only Project projection. */
export type ProjectContextDestination = 'project-detail' | 'work-detail' | 'image-studio' | 'cover-studio'

/** The target and projection key of a transient UI navigation request. */
export interface ProjectContextNavigation {
  readonly projectKey: 'xhs'
  readonly destination: ProjectContextDestination
}

let navigation: ProjectContextNavigation | null = null
const listeners = new Set<() => void>()

/** Request a same-sample destination without creating or persisting business state. */
export function requestProjectContextNavigation(destination: ProjectContextDestination): void {
  navigation = { projectKey: 'xhs', destination }
  for (const listener of listeners) listener()
}

/** Subscribe a route surface to an in-memory Project navigation request. */
export function useProjectContextNavigation(): ProjectContextNavigation | null {
  return useSyncExternalStore(subscribe, () => navigation, () => navigation)
}

/** Clear a request only when the matching destination has consumed it. */
export function consumeProjectContextNavigation(destination: ProjectContextDestination): void {
  if (navigation?.destination !== destination) return
  navigation = null
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}
