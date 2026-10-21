import type { ScysReconnectDiagnostic, ScysSourceStatusResult } from '@deepseek-ai/dsh-business-workbench/types'

/** Convert a Remote status failure to a content-free diagnostic without forwarding its message or details. @param code - Remote failure code. @returns A safe status result identifying the failed mapping stage. */
export function scysRemoteStatusFailure(code: string): ScysSourceStatusResult {
  const knownCodes: Readonly<Record<string, string>> = {
    internal: 'SCYS_STATUS_REMOTE_INTERNAL',
    cancelled: 'SCYS_STATUS_REMOTE_CANCELLED',
    transport: 'SCYS_STATUS_REMOTE_TRANSPORT',
  }
  return {
    status: 'error',
    diagnostic: {
        stage: 'status_mapping',
        errorCode: knownCodes[code] ?? 'SCYS_STATUS_REMOTE_FAILURE',
        httpStatus: null,
        safeMessage: 'Workbench could not return the source connection status.',
        httpObservations: [],
        errorType: 'UnknownError',
        safeErrorCode: null,
        sdkErrorSourceFile: null,
        sdkErrorSourceLine: null,
      },
  }
}

/** Render only safe token-callback stage outcomes already projected by the Host. @param diagnostic - Saved-grant status diagnostic. @returns Content-free lines for the existing source-status card. */
export function scysTokenCallbackDiagnosticLines(diagnostic: ScysReconnectDiagnostic): readonly string[] {
  if (diagnostic.tokensCallbackCallCount === undefined) return []
  return [
    `tokens() 调用次数：${diagnostic.tokensCallbackCallCount}`,
    ...(diagnostic.tokenCallbackObservations ?? []).map(item =>
      `tokens() ${item.stage}：${item.result}${item.errorType === null ? '' : ` · ${item.errorType}`}${item.errorCode === null ? '' : ` · ${item.errorCode}`}`,
    ),
  ]
}
