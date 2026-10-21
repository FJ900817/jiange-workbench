import type { XhsRealContext } from '@deepseek-ai/dsh-business-workbench/types'

/** Read-only UI identity for a Project projection and its current production sample. */
export interface ProjectContext {
  readonly projectId: null
  readonly projectKey: 'xhs'
  readonly projectName: string
  readonly projectType: 'xhs'
  readonly account: string
  readonly period: string
  readonly week: string
  readonly note: string
  readonly sampleIdentity: XhsRealContext['identity']
  readonly source: 'xhs-real-context-read-only-projection'
}

/** Project Registry ID and Workspace binding are deliberately absent from this projection. */
export function toProjectContext(context: XhsRealContext): ProjectContext {
  const [account = 'unknown', period = 'unknown', week = 'unknown', note = 'unknown'] = context.identity.split('/')
  return {
    projectId: null,
    projectKey: context.project.value.category,
    projectName: context.project.value.displayName,
    projectType: context.project.value.category,
    account,
    period,
    week,
    note,
    sampleIdentity: context.identity,
    source: 'xhs-real-context-read-only-projection',
  }
}
