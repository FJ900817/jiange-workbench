import { describe, expect, it } from 'vitest'
import { scysRemoteStatusFailure, scysTokenCallbackDiagnosticLines } from '../src/client/skeleton/scys-status-diagnostic.ts'

describe('SCYS source status diagnostics', () => {
  it('preserves a safe Remote error category without forwarding sensitive details', () => {
    const result = scysRemoteStatusFailure('internal')

    expect(result).toEqual({
      status: 'error',
      diagnostic: {
        stage: 'status_mapping',
        errorCode: 'SCYS_STATUS_REMOTE_INTERNAL',
        httpStatus: null,
        safeMessage: 'Workbench could not return the source connection status.',
        httpObservations: [],
        errorType: 'UnknownError',
        safeErrorCode: null,
        sdkErrorSourceFile: null,
        sdkErrorSourceLine: null,
      },
    })
    expect(JSON.stringify(result)).not.toContain('token')
  })

  it('maps unknown Remote codes to a fixed safe category', () => {
    expect(scysRemoteStatusFailure('secret-value').diagnostic?.errorCode).toBe('SCYS_STATUS_REMOTE_FAILURE')
  })

  it('renders safe tokens callback stages without credential values', () => {
    const diagnostic = {
      stage: 'oauth_token_check', errorCode: 'SCYS_OAUTH_TOKEN_CHECK_TOKEN_RECORD_READ_ERROR', httpStatus: null,
      safeMessage: 'Saved credential read failed.', httpObservations: [], errorType: 'Error', safeErrorCode: 'KEYCHAIN_READ_FAILED',
      sdkErrorSourceFile: 'client/streamableHttp.js', sdkErrorSourceLine: 61, tokensCallbackCallCount: 1,
      tokenCallbackObservations: [
        { stage: 'credential_read', result: 'fail', errorType: 'Error', errorCode: 'KEYCHAIN_READ_FAILED' },
        { stage: 'callback_return', result: 'fail', errorType: 'Error', errorCode: 'KEYCHAIN_READ_FAILED' },
      ],
    } as const

    expect(scysTokenCallbackDiagnosticLines(diagnostic)).toEqual([
      'tokens() 调用次数：1',
      'tokens() credential_read：fail · Error · KEYCHAIN_READ_FAILED',
      'tokens() callback_return：fail · Error · KEYCHAIN_READ_FAILED',
    ])
    expect(JSON.stringify(scysTokenCallbackDiagnosticLines(diagnostic))).not.toMatch(/access_token|refresh_token|secret/)
  })
})
