/** Public data types for the durable business workbench. */

import type { Branded } from '@deepseek-ai/dsh-brand'
import type { JsonValue } from '@deepseek-ai/dsh-session/types'

/** Opaque Batch identifier. */
export type BusinessBatchId = Branded<'BusinessBatchId'>
/** Opaque Business Job identifier. */
export type BusinessJobId = Branded<'BusinessJobId'>
/** Opaque execution Attempt identifier. */
export type BusinessAttemptId = Branded<'BusinessAttemptId'>
/** Opaque immutable Artifact identifier. */
export type BusinessArtifactId = Branded<'BusinessArtifactId'>
/** Opaque frozen execution-package identifier. */
export type BusinessExecutionPackageId = Branded<'BusinessExecutionPackageId'>
/** Opaque restricted Agent Run identifier. */
export type BusinessAgentRunId = Branded<'BusinessAgentRunId'>
/** Opaque authoritative output-bundle identifier. */
export type BusinessOutputBundleId = Branded<'BusinessOutputBundleId'>

/** The only Project admitted by Business Layer V0.1. */
export type BusinessProject = 'xhs'
/** The only business Job type admitted by Business Layer V0.1. */
export type BusinessJobType = 'xhs-body'
/** Batch creation lifecycle. */
export type BusinessBatchStatus = 'creating' | 'ready'
/** Closed participation modes supported by schema version 5. */
export type BusinessBatchMode = 'single' | 'quad' | 'legacy-fixed4'
/** Business Job lifecycle including recoverable interruption. */
export type BusinessJobStatus = 'draft' | 'ready' | 'running' | 'interrupted' | 'completed' | 'failed' | 'cancelled'
/** Attempt lifecycle controlled by explicit execution ownership. */
export type BusinessAttemptStatus = 'pending' | 'running' | 'interrupted' | 'completed' | 'failed' | 'cancelled'
/** Artifact categories reserved by the Business Layer design. */
export type BusinessArtifactType = 'input' | 'intermediate' | 'validation' | 'review' | 'final'
/** Durable execution-lease lifecycle. */
export type BusinessExecutionLeaseStatus = 'active' | 'released' | 'expired'
/** Closed restricted Agent actions admitted by the Business Host. */
export type BusinessAgentAction = 'fixture-agent-run' | 'xhs-body-prepare-v0' | 'xhs-body-revise-v0' | 'xhs-body-retry-v0' | 'xhs-body-contract-repair-v0' | 'xhs-body-length-repair-v0'
/** XHS body preparation action. */
export type XhsBodyPrepareAction = 'xhs-body-prepare-v0'
/** XHS business-review revision action. */
export type XhsBodyRevisionAction = 'xhs-body-revise-v0'
/** XHS structural execution-retry action. */
export type XhsBodyRetryAction = 'xhs-body-retry-v0'
/** XHS deterministic-contract-only repair action. */
export type XhsBodyContractRepairAction = 'xhs-body-contract-repair-v0'
/** XHS PASS-reviewed title/body length patch action. */
export type XhsBodyLengthRepairAction = 'xhs-body-length-repair-v0'
/** Required execution-package roles for XHS body preparation. */
export type XhsBodyPrepareInputRole = 'taskCard' | 'writingRule' | 'goldenSample'
/** Reserved logical output names for the frozen XHS body preparation action. */
export type XhsBodyPrepareOutputName = 'draft.md' | 'draft-metadata.json' | 'provenance.json'
/** Action-specific failures reserved by the frozen XHS body preparation contract. */
export type XhsBodyPrepareFailureCode = 'XHS_BODY_INPUT_INVALID' | 'XHS_BODY_OUTPUT_INVALID'
/** Account route admitted by the current formal XHS production system. */
export type XhsProductionAccount = 'account1' | 'account2' | 'account3' | 'account4'
/** Stable Host vocabulary for the three formal XHS note types. */
export type XhsProductionNoteType = 'dry-search' | 'recommendation' | 'hot-traffic'
/** Explicit source class admitted by the XHS restricted Agent route. */
export type XhsExecutionMode = 'fixture' | 'production'

/** Persisted processing states returned by the private local AIHOT projection. */
export type LocalAIHOTProcessingState = 'new' | 'analyzed' | 'skipped' | 'failed' | 'blocked'

/** AIHOT's current projection of one Article's analysis and human-review state. */
export type LocalAIHOTIntelligenceState = 'pending_analysis' | 'pending_review' | 'kept' | 'maybe' | 'dropped' | 'blocked' | 'failed'

/** Highest-priority persisted content available for an Article. */
export type LocalAIHOTContentBasis = 'body' | 'excerpt' | 'none'

/** Run status exposed by the explicitly triggered pending-analysis action. */
export type LocalAIHOTPendingRunStatus = 'running' | 'completed' | 'failed' | 'safety_stopped' | 'interrupted'
/** Display-safe state of one Article in a controlled analysis run. */
export type LocalAIHOTPendingArticleStatus = 'waiting' | 'fetching_content' | 'analyzing' | 'pending_review' | 'blocked' | 'failed' | 'interrupted'

/** Bounded request that names every Article a user approved for analysis. */
export interface LocalAIHOTPendingRunRequest {
  readonly articleIds: readonly string[]
  readonly idempotencyKey: string
}

/** Persisted run projection; it contains no prompts, provider output, credentials, or receipt ids. */
export interface LocalAIHOTPendingRun {
  readonly runId: string
  readonly createdAt: string
  readonly startedAt: string
  readonly finishedAt: string | null
  readonly articleCap: 3
  readonly articleCount: number
  readonly requestedArticleIds: readonly string[]
  readonly requestCap: number
  readonly status: LocalAIHOTPendingRunStatus
  readonly safetyStatus: 'pending' | 'passed' | 'failed'
  readonly requestAttempts: number
  readonly processedCount: number
  readonly pendingReviewCount: number
  readonly blockedCount: number
  readonly failedCount: number
  readonly currentArticle: number
  readonly items: readonly { readonly articleId: string; readonly title: string; readonly status: LocalAIHOTPendingArticleStatus }[]
  readonly errorCode: string | null
}

/** Controlled pending-analysis action result. */
export type LocalAIHOTPendingActionResult =
  | { readonly status: 'available'; readonly run: LocalAIHOTPendingRun }
  | { readonly status: 'unavailable' | 'invalid_request' | 'not_pending' | 'protected_receipt' | 'already_processing' }

/** One AIHOT Article and its latest persisted Analysis, projected for Workbench display. */
export interface LocalAIHOTIntelligenceItem {
  readonly articleId: string
  readonly analysisId: string | null
  readonly title: string
  readonly url: string
  readonly source: string
  readonly publishedAt: string | null
  readonly processingState: LocalAIHOTProcessingState
  readonly reviewable: boolean
  readonly intelligenceState: LocalAIHOTIntelligenceState
  readonly contentBasis: LocalAIHOTContentBasis
  readonly excerptPreview: string | null
  readonly bodyStatus: 'pending' | 'ok' | 'unconfirmed' | 'none'
  readonly score: number | null
  readonly selected: boolean | null
  readonly summary: string | null
  readonly prefilterLabel: 'PASS' | 'BLOCK' | 'UNKNOWN' | null
  readonly prefilterReason: string | null
  readonly category: string | null
  readonly tags: readonly string[]
  readonly topic: string | null
  readonly itemType: string | null
  readonly selectionReason: string | null
}

/** Bounded local AIHOT list request. */
export interface LocalAIHOTIntelligenceRequest {
  readonly limit?: number
  readonly cursor?: string
  readonly processingState?: LocalAIHOTProcessingState
  readonly source?: string
}

/** Fixed human verdict values persisted separately from AIHOT Analysis. */
export type LocalAIHOTReviewVerdict = 'KEEP' | 'MAYBE' | 'DROP'

/** Human-provided reason labels for one current Article judgment. */
export type LocalAIHOTReviewReason = 'RELEVANT' | 'ACTIONABLE' | 'CONTENT_WORTHY' | 'TOOL_WORTH_TRYING' | 'BUSINESS_SIGNAL' | 'TOO_GENERIC' | 'PR_NOISE' | 'DUPLICATE' | 'LOW_VALUE'

/** One persisted human judgment; it never modifies its linked Analysis. */
export interface LocalAIHOTReview {
  readonly articleId: string
  readonly analysisId: string | null
  readonly verdict: LocalAIHOTReviewVerdict
  readonly reasons: readonly LocalAIHOTReviewReason[]
  readonly note: string
  readonly reviewedAt: string
  readonly updatedAt: string
}

/** Review values saved for one Article through the local Host bridge. */
export interface LocalAIHOTReviewWriteRequest {
  readonly articleId: string
  readonly verdict: LocalAIHOTReviewVerdict
  readonly reasons: readonly LocalAIHOTReviewReason[]
  readonly note: string
}

/** Bounded batch read result for review state corresponding to one list page. */
export type LocalAIHOTReviewsResult =
  | { readonly status: 'available'; readonly reviews: readonly LocalAIHOTReview[] }
  | { readonly status: 'unavailable' }

/** One Article review read result; null means no judgment exists. */
export type LocalAIHOTReviewResult =
  | { readonly status: 'available'; readonly review: LocalAIHOTReview | null }
  | { readonly status: 'unavailable' }

/** Result of a persisted review write; callers must read back before showing success. */
export type LocalAIHOTReviewWriteResult = { readonly status: 'available' } | { readonly status: 'not_reviewable' } | { readonly status: 'unavailable' }

/** Local AIHOT list page and database-wide read-only counts. */
export type LocalAIHOTIntelligenceResult =
  | {
    readonly status: 'available'
    readonly items: readonly LocalAIHOTIntelligenceItem[]
    readonly page: { readonly limit: number; readonly nextCursor: string | null; readonly hasMore: boolean }
    readonly counts: { readonly articles: number; readonly analyses: number }
  }
  | { readonly status: 'unavailable' }

/** Safe login-state projection returned by the Host-only Xiaohongshu adapter. */
export type XhsLoginStatusResult =
  | { readonly status: 'available'; readonly loggedIn: boolean }
  | { readonly status: 'unavailable' }

/** Temporary QR projection; the Client must keep it in memory and release it on expiry or unmount. */
export type XhsLoginQrCodeResult =
  | { readonly status: 'qr_ready'; readonly imageDataUrl: string; readonly expiresAt: number }
  | { readonly status: 'logged_in' }
  | { readonly status: 'unavailable' }

/** One Xiaohongshu result mapped from fields returned by the source MCP. */
export interface XhsFeedSummary {
  readonly id: string | null
  readonly xsecToken: string | null
  readonly title: string | null
  readonly author: string | null
  /** Opaque Host-only reference for secure cover delivery; never contains a source URL. */
  readonly coverAssetId: string | null
  /** Content-free source and Host cover observations used by the temporary Radar audit panel. */
  readonly coverAudit?: XhsCoverAudit
  readonly noteType: string | null
  readonly likeCount: number | null
  readonly collectCount: number | null
  readonly commentCount: number | null
}

/** In-memory image payload returned for one registered XHS cover reference; source URLs never cross the Remote. */
export type XhsCoverAssetResult =
  | { readonly status: 'ready'; readonly mimeType: string; readonly base64: string; readonly cacheKey: string; readonly cacheHit: boolean }
  | { readonly status: 'error' }

/** Sorting options accepted by the fixed Xiaohongshu search endpoint. */
export type XhsSearchSort = '综合' | '最新' | '最多点赞' | '最多评论' | '最多收藏'

/** Presence-only cover diagnostics; this type never carries an image URL. */
export interface XhsCoverAudit {
  readonly rawCoverPresent: boolean
  readonly urlDefaultPresent: boolean
  readonly urlPresent: boolean
  readonly urlPrePresent: boolean
  readonly infoListUrlPresent: boolean
  readonly hostMapped: boolean
}

/** One source comment retained for read-only comment browsing. */
export interface XhsComment {
  readonly id: string | null
  readonly content: string | null
  readonly author: string | null
  readonly likeCount: number | null
  readonly createdAt: string | null
}

/** Full Xiaohongshu note fields available from the source MCP detail tool. */
export interface XhsFeedDetail {
  readonly id: string | null
  readonly title: string | null
  readonly content: string | null
  readonly author: string | null
  /** Opaque Host-only references for images; source URLs never cross the Remote. */
  readonly imageAssetIds: readonly (string | null)[]
  readonly likeCount: number | null
  readonly collectCount: number | null
  readonly commentCount: number | null
  readonly comments: readonly XhsComment[]
}

/** One deliberately minimized note-and-comment request for transient analysis. */
export interface XhsCommentAnalysisRequest {
  /** Host-only source note identity used for cache partitioning; never sent to the model. */
  readonly noteId: string
  readonly noteTitle: string | null
  readonly noteText: string | null
  readonly comments: readonly { readonly id: string | null; readonly content: string | null }[]
}

/** Supported comment-demand categories returned by the validated analysis. */
export type XhsCommentInsightCategory = 'question' | 'blocker' | 'desired_outcome' | 'content_opportunity' | 'commercial_demand'

/** A validated insight grounded in comments from the current note only. */
export interface XhsCommentInsight {
  readonly category: XhsCommentInsightCategory
  readonly insight: string
  readonly evidenceRefs: readonly string[]
  readonly confidence: 'low' | 'medium' | 'high'
}

/** Content-free validation counts accompanying one successful analysis. */
export interface XhsCommentAnalysisTrace {
  readonly validEvidenceRefCount: number
  readonly invalidEvidenceRefCount: number
  readonly ungroundedInsightCount: number
}

/** Content-free failure categories exposed by the XHS-only model route. */
export type XhsCommentAnalysisErrorCode =
  | 'COMMENT_ANALYSIS_ROUTE_NOT_CONFIGURED'
  | 'COMMENT_ANALYSIS_ROUTE_INVALID'
  | 'COMMENT_ANALYSIS_ROUTE_UNAVAILABLE'
  | 'CREDENTIAL_ERROR'
  | 'PROVIDER_HTTP_ERROR'
  | 'PROVIDER_STREAM_ERROR'
  | 'PROVIDER_EMPTY_RESPONSE'
  | 'PROVIDER_MAX_TOKENS'
  | 'ANALYSIS_TIMEOUT'
  | 'EMPTY_RESPONSE'
  | 'ANALYSIS_RESPONSE_TOO_LARGE'
  | 'ANALYSIS_PARSE_ERROR'
  | 'SCHEMA_NO_VALID_INSIGHTS'
  | 'UNKNOWN_ANALYSIS_ERROR'

/** Stage reached when one stateless comment-analysis request fails. */
export type XhsCommentAnalysisFailureStage =
  | 'route'
  | 'input_validation'
  | 'provider_stream'
  | 'provider_response'
  | 'response_parse'
  | 'schema_validation'
  | 'evidence_validation'
  | 'remote_transport'

/** Whether the model request is proven to have crossed the provider boundary. */
export type XhsCommentAnalysisRequestStatus = 'confirmed' | 'not_started' | 'unknown'

/** One stateless comment-analysis result; raw prompts and provider output are never returned. */
export type XhsCommentAnalysisResult =
  | { readonly status: 'ready'; readonly insights: readonly XhsCommentInsight[]; readonly trace: XhsCommentAnalysisTrace; readonly cacheHit: boolean }
  | { readonly status: 'no_comments' }
  | {
    readonly status: 'error'
    readonly errorCode: XhsCommentAnalysisErrorCode
    readonly providerId: string | null
    readonly modelId: string | null
    readonly llmStreamCalled: boolean
    readonly providerRequestSent: XhsCommentAnalysisRequestStatus
    readonly providerResponseReceived: boolean
    readonly failureStage: XhsCommentAnalysisFailureStage
    readonly durationMs: number
    readonly streamEventCount: number
    readonly responseCharacterCount: number
    readonly httpStatus?: number
  }

/** Host-mapped source status; upstream identity fields are discarded. */
export type XhsSourceStatusResult =
  | { readonly status: 'connected' }
  | { readonly status: 'logged_out' }
  | { readonly status: 'source_offline' }

/** Closed error codes returned for one failed XHS search. */
export type XhsSearchErrorCode =
  | 'REMOTE_TRANSPORT_ERROR'
  | 'MCP_UNAVAILABLE'
  | 'MCP_TIMEOUT'
  | 'MCP_BROWSER_ERROR'
  | 'MCP_UPSTREAM_ERROR'
  | 'MCP_SEARCH_ERROR'
  | 'RESULT_MAPPING_ERROR'
  | 'UNKNOWN'

/** Safe stage and timing details for one failed XHS search. */
export interface XhsSearchFailureDiagnostic {
  readonly errorCode: XhsSearchErrorCode
  readonly failureStage: 'host_connection' | 'remote_transport' | 'mcp_connect' | 'mcp_search' | 'result_mapping' | 'unknown'
  readonly durationMs: number
  readonly httpStatus: number | null
}

/** Bounded result of one on-demand keyword search. */
export type XhsSearchResult =
  | { readonly status: 'ready'; readonly feeds: readonly XhsFeedSummary[]; readonly count: number }
  | { readonly status: 'empty'; readonly count: number }
  | { readonly status: 'logged_out' | 'source_offline' | 'search_timeout' | 'search_error'; readonly diagnostic?: XhsSearchFailureDiagnostic }

/** Result of reading one selected search result. */
export type XhsFeedDetailResult =
  | { readonly status: 'ready'; readonly detail: XhsFeedDetail }
  | { readonly status: 'logged_out' | 'source_offline' | 'detail_error' }

/** Safe Workbench connection state for the independent SCYS OAuth grant. */
export type ScysSourceStatus = 'disconnected' | 'connecting' | 'connected' | 'expired' | 'error'

/** One URL-free HTTP attempt observed during a saved-grant reconnect. */
export interface ScysHttpBoundaryObservation {
  readonly phase: 'mcp_initialize' | 'oauth_metadata_discovery' | 'oauth_token_refresh' | 'mcp_list_tools' | 'other'
  readonly requestAttempted: boolean
  readonly httpStatus: number | null
  readonly errorType: string | null
  readonly errorCode: string | null
}

/** One safe stage recorded while the SDK requests saved SCYS tokens. */
export interface ScysTokenCallbackObservation {
  readonly stage: 'credential_read' | 'credential_parse' | 'token_mapping' | 'callback_return' | 'sdk_token_usage'
  readonly result: 'pass' | 'fail'
  readonly errorType: string | null
  readonly errorCode: string | null
}

/** Content-free diagnostics for one saved-grant MCP reconnect attempt. */
export interface ScysReconnectDiagnostic {
  readonly stage: 'credential_read' | 'credential_parse' | 'oauth_redirect_check' | 'oauth_provider_create' | 'mcp_transport_create' | 'mcp_client_create' | 'oauth_metadata_discovery' | 'oauth_token_check' | 'oauth_token_refresh' | 'oauth_authorization_fallback' | 'mcp_initialize' | 'mcp_list_tools' | 'adapter_ready' | 'status_mapping'
  readonly errorCode: string
  readonly httpStatus: number | null
  readonly safeMessage: string
  readonly httpObservations: readonly ScysHttpBoundaryObservation[]
  readonly errorType: string
  readonly safeErrorCode: string | null
  /** Present only for a failed native Keychain read with an allowlisted OSStatus. */
  readonly keychainOsStatus?: number
  readonly sdkErrorSourceFile: string | null
  readonly sdkErrorSourceLine: number | null
  readonly tokensCallbackCallCount?: number
  readonly tokenCallbackObservations?: readonly ScysTokenCallbackObservation[]
}

/** Content-free result of starting or reading the SCYS connection. */
export interface ScysSourceStatusResult {
  readonly status: ScysSourceStatus
  readonly diagnostic?: ScysReconnectDiagnostic
}

/** Normalized SCYS interaction counts; absent source values remain null. */
export interface ScysEngagement {
  readonly likeCount: number | null
  readonly favoriteCount: number | null
  readonly coinCount: number | null
  readonly commentCount: number | null
}

/** One SCYS content item projected from an allowlisted read tool. */
export interface ScysContentSummary {
  readonly source: 'scys'
  readonly id: string | null
  readonly entityType: string | null
  readonly entityId: string | null
  readonly contentType: string | null
  readonly title: string | null
  readonly summary: string | null
  readonly content: string | null
  readonly author: string | null
  readonly publishedAt: string | null
  readonly url: string | null
  readonly isHot: boolean | null
  readonly isDigested: boolean | null
  readonly engagement: ScysEngagement
}

/** One fixed, bounded official SCYS feed query. */
export type ScysFeedMode = 'recent' | 'hot' | 'digested'

/** Evidence returned with a feed query without claiming unreturned per-topic flags. */
export interface ScysFeedQueryInfo {
  readonly mode: ScysFeedMode
  readonly windowStart: string
  readonly windowEnd: string
  readonly fetchedAt: string
  readonly stale: boolean
  readonly refreshErrorCode: string | null
  readonly pagesRead: number
  readonly mayHaveMore: boolean
  readonly serverFilterAccepted: true
  readonly itemMarkerEvidence: 'not_applicable' | 'confirmed' | 'missing' | 'conflict'
}

/** Bounded official recent, hot, or digested SCYS topic query. */
export type ScysFeedQueryResult =
  | { readonly status: 'ready'; readonly query: ScysFeedQueryInfo; readonly items: readonly ScysContentSummary[] }
  | { readonly status: 'empty'; readonly query: ScysFeedQueryInfo }
  | { readonly status: 'SCYS_NOT_CONNECTED' | 'SCYS_AUTH_EXPIRED' | 'SCYS_MCP_UNAVAILABLE' | 'SCYS_FEED_QUERY_UNSUPPORTED' | 'SCYS_FEED_QUERY_ERROR' }

/** Source-provided SCYS topic identity required for article detail and comments. */
export interface ScysTopicIdentity {
  readonly entityType: string | null
  readonly entityId: string | null
}

/** One real SCYS comment projected for read-only browsing. */
export interface ScysComment {
  readonly source: 'scys'
  readonly id: string | null
  readonly text: string | null
  readonly author: string | null
  readonly publishedAt: string | null
  readonly likeCount: number | null
}

/** One SCYS project case; missing URLs are represented as null. */
export interface ScysProjectSummary {
  readonly source: 'scys'
  readonly id: string | null
  readonly title: string | null
  readonly summary: string | null
  readonly description: string | null
  readonly publishedAt: string | null
  readonly url: string | null
  readonly engagement: ScysEngagement
}

/** Bounded SCYS content search projection. */
export type ScysContentSearchResult =
  | { readonly status: 'ready'; readonly items: readonly ScysContentSummary[] }
  | { readonly status: 'empty' }
  | { readonly status: 'SCYS_NOT_CONNECTED' | 'SCYS_AUTH_EXPIRED' | 'SCYS_MCP_UNAVAILABLE' | 'SCYS_SEARCH_ERROR' }

/** SCYS detail projection from topicDetail. */
export type ScysContentDetailResult =
  | { readonly status: 'ready'; readonly item: ScysContentSummary }
  | { readonly status: 'SCYS_NOT_CONNECTED' | 'SCYS_AUTH_EXPIRED' | 'SCYS_MCP_UNAVAILABLE' | 'SCYS_DETAIL_ERROR' | 'SCYS_TOPIC_IDENTITY_MISSING' }

/** Bounded SCYS project search projection. */
export type ScysProjectSearchResult =
  | { readonly status: 'ready'; readonly items: readonly ScysProjectSummary[] }
  | { readonly status: 'empty' }
  | { readonly status: 'SCYS_NOT_CONNECTED' | 'SCYS_AUTH_EXPIRED' | 'SCYS_MCP_UNAVAILABLE' | 'SCYS_PROJECT_ERROR' }

/** SCYS project detail projection from projectLibDetail. */
export type ScysProjectDetailResult =
  | { readonly status: 'ready'; readonly item: ScysProjectSummary }
  | { readonly status: 'SCYS_NOT_CONNECTED' | 'SCYS_AUTH_EXPIRED' | 'SCYS_MCP_UNAVAILABLE' | 'SCYS_PROJECT_ERROR' }

/** Explicit, bounded SCYS comment page. */
export type ScysCommentLoadResult =
  | { readonly status: 'ready'; readonly comments: readonly ScysComment[]; readonly hasMore: boolean }
  | { readonly status: 'empty' }
  | { readonly status: 'SCYS_NOT_CONNECTED' | 'SCYS_AUTH_EXPIRED' | 'SCYS_MCP_UNAVAILABLE' | 'SCYS_COMMENT_ERROR' | 'SCYS_TOPIC_IDENTITY_MISSING' }

/** One Article, latest Analysis, and only the persisted structural fields available to the UI. */
export type LocalAIHOTIntelligenceDetailResult =
  | {
    readonly status: 'available'
    readonly item: LocalAIHOTIntelligenceItem & {
      readonly excerpt: string | null
      readonly bodyText: string | null
      readonly contentTruncated: boolean
      readonly structure: { readonly category: string | null; readonly tags: readonly string[]; readonly fact: JsonValue | null } | null
      readonly analysisCreatedAt: string | null
    }
  }
  | { readonly status: 'unavailable' }

/** Provenance wrapper for one read-only Account 2 Swiss projection section. */
export interface XhsRealContextSection<T> {
  readonly source: string
  readonly status: 'verified' | 'partial' | 'missing'
  readonly provenance: readonly string[]
  readonly value: T
}

/** Immutable Asset metadata and a bounded browser preview from the existing P5 package. */
export interface XhsRealContextAsset {
  readonly displayName: string
  readonly sha256: string
  readonly bytes: number
  readonly provider: string
  readonly model: string
  readonly status: string
  readonly dataUrl: string
}

/** Read-only projection of one durable Job, including its Attempt and Artifact references. */
export interface XhsRealJobProjection {
  readonly id: string
  readonly status: string
  readonly createdAt: number
  readonly updatedAt: number
  readonly attempts: readonly { readonly id: string; readonly status: string }[]
  readonly artifacts: readonly { readonly id: string; readonly type: BusinessArtifactType; readonly sha256: string }[]
}

/** Formal HD framework render evidence, distinct from a final cover composite. */
export interface XhsRealRendererProjection {
  readonly status: string
  readonly pagesPassed: number
  readonly pagesTotal: number
  readonly width: number
  readonly height: number
  readonly deviceScaleFactor: number
  readonly providerCalls: number
  readonly imageGenerationCalls: number
}

/** Read-only projection of the verified Account 2 Swiss sample for the Business UI. */
export interface XhsRealContext {
  readonly identity: 'account2/2026-08/第02周/note001'
  readonly project: XhsRealContextSection<{
    readonly category: 'xhs'
    readonly displayName: '小红书'
    readonly registryEntityExists: false
    readonly sourceRoot: 'configured-xhs-root'
  }>
  readonly source: XhsRealContextSection<{
    readonly taskCardPath: string
    readonly taskCardSha256: string
    readonly taskCardBytes: number
    readonly notePath: string
    readonly noteSha256: string
    readonly noteBytes: number
  }>
  readonly work: XhsRealContextSection<{
    readonly workKey: 'account2/2026-08/第02周/note001'
    readonly aggregate: true
    readonly jobCount: number
  }>
  readonly jobs: XhsRealContextSection<readonly XhsRealJobProjection[]>
  readonly reviews: XhsRealContextSection<readonly {
    readonly artifactId: string
    readonly reviewResult: string
    readonly reviewerType: string
    readonly sourceJobId: string
    readonly sourceArtifactId: string
  }[]>
  readonly validations: XhsRealContextSection<readonly {
    readonly artifactId: string
    readonly result: string
    readonly sourceJobId: string
  }[]>
  readonly cover: XhsRealContextSection<{
    readonly handoffId: string
    readonly handoffSha256: string
    readonly route: string
    readonly family: string
    readonly coverPlanStatus: string
    readonly pages: readonly string[]
    readonly templateVersion: string
    readonly baselineStatus: string
    readonly baselineImmutable: boolean
    readonly imageSlots: number
    readonly p5State: string
    readonly rendererStatus: string
    readonly rendererPagesPassed: number
    readonly rendererPagesTotal: number
    readonly width: number
    readonly height: number
    readonly deviceScaleFactor: number
    readonly providerCalls: number
    readonly imageGenerationCalls: number
  }>
  readonly renderer: XhsRealContextSection<XhsRealRendererProjection>
  readonly assets: XhsRealContextSection<{
    readonly page: string
    readonly imageSlotCount: number
    readonly status: string
    readonly selectedAsset: string | null
    readonly automaticSelection: boolean
    readonly candidates: readonly XhsRealContextAsset[]
  }>
  readonly workspace: XhsRealContextSection<{
    readonly projectBindingExists: false
    readonly note: string
  }>
}

/** Caller-owned identity for one exact formal XHS production slot. */
export interface XhsProductionTaskIdentity {
  readonly account: XhsProductionAccount
  readonly productionMonth: string
  readonly productionWeek: string
  readonly note: string
}

/** Resolved identity copied from one confirmed production task card. */
export interface XhsProductionResolvedIdentity extends XhsProductionTaskIdentity {
  readonly taskId: string
  readonly topicId: string
  readonly noteType: XhsProductionNoteType
}

/** Immutable identity for one production control or lineage file. */
export interface XhsProductionSourceIdentity {
  readonly path: string
  readonly sha256: string
  readonly bytes: number
  readonly version?: string
}

/** Deterministic role route recorded without source content. */
export interface XhsProductionInputRoute extends XhsProductionSourceIdentity {
  readonly role: XhsBodyPrepareInputRole
  readonly routeReason: string
}

/** Exact formal S3 source selected by the account route. */
export interface XhsProductionSkillSource extends XhsProductionSourceIdentity {
  readonly logicalSkillId: string
  readonly formalName: string
  readonly account: XhsProductionAccount
  readonly origin: 'vault-root'
  readonly source: 'project-agents'
  readonly provider: string
  readonly snapshotHash: string
  readonly routeReason: string
}

/** Durable production-source evidence attached to one execution package. */
export interface XhsProductionSourceManifest {
  readonly adapterVersion: string
  readonly contractSchemaVersion: 1
  readonly identity: XhsProductionResolvedIdentity
  readonly productionEntry: XhsProductionSourceIdentity
  readonly productionBaseline: XhsProductionSourceIdentity
  readonly sourceTask: XhsProductionSourceIdentity
  readonly inputs: readonly XhsProductionInputRoute[]
  readonly skillSource: XhsProductionSkillSource
  readonly resolvedAt: number
  readonly manifestHash: string
}

/** Deterministic route supplied to the closed XHS action policy. */
export interface XhsBodyPrepareRoute {
  readonly mode: XhsExecutionMode
  readonly account: XhsProductionAccount
  readonly noteType: XhsProductionNoteType
}
/** Durable restricted Agent Run lifecycle. */
export type BusinessAgentRunStatus = 'running' | 'completed' | 'failed' | 'interrupted'

/** Exact Skill definition frozen before an Agent Run may start. */
export interface BusinessSkillSnapshot {
  readonly skillId: string
  readonly source: string
  readonly provider: string
  readonly path?: string
  readonly resourceBase?: string
  readonly content: string
  readonly contentHash: string
  readonly bytes: number
  readonly resolvedAt: number
  readonly snapshotHash: string
}

/** Fixed model route selected by one Host action policy. */
export interface BusinessAgentModel {
  /** Registered LLM provider id. */
  readonly provider: string
  /** Provider-owned model id. */
  readonly model: string
  /** Optional provider-supported reasoning effort. */
  readonly reasoningEffort?: string
  /** Optional maximum output-token count. */
  readonly maxTokens?: number
}

/** Durable provenance and settlement of one restricted Agent invocation. */
export interface BusinessAgentRun {
  readonly id: BusinessAgentRunId
  readonly jobId: BusinessJobId
  readonly attemptId: BusinessAttemptId
  readonly executionPackageId: BusinessExecutionPackageId
  readonly action: BusinessAgentAction
  readonly xhs?: XhsBodyPrepareRoute
  readonly idempotencyKey: string
  readonly status: BusinessAgentRunStatus
  readonly sessionId: string
  readonly skillManifestHash: string
  readonly model: BusinessAgentModel
  readonly startedAt: number
  readonly endedAt?: number
  readonly artifactId?: BusinessArtifactId
  readonly outputBundleId?: BusinessOutputBundleId
  readonly failureCode?: string
  readonly failureReason?: string
}

/** Stable reference to one task-card input without reading its source. */
export interface BusinessInputReference {
  readonly reference: string
  readonly sha256: string
}

/** Durable ownership record for one running Attempt. */
export interface BusinessExecutionLease {
  readonly attemptId: BusinessAttemptId
  readonly ownerId: string
  readonly runtimeInstanceId: string
  readonly acquiredAt: number
  readonly renewedAt: number
  readonly leaseExpiresAt: number
  readonly status: BusinessExecutionLeaseStatus
}

/** One file frozen into a minimum execution package. */
export interface BusinessExecutionInput {
  readonly role: string
  readonly path: string
  readonly required: boolean
  readonly present: boolean
  readonly sha256?: string
  readonly bytes?: number
}

/** Frozen manifest limiting one Attempt's inputs and declared capabilities. */
export interface BusinessExecutionPackage {
  readonly id: BusinessExecutionPackageId
  readonly project: BusinessProject
  readonly jobId: BusinessJobId
  readonly attemptId: BusinessAttemptId
  readonly workflowVersion: string
  readonly inputs: readonly BusinessExecutionInput[]
  readonly allowedReadRoots: readonly string[]
  readonly allowedReadFiles: readonly string[]
  readonly allowedCapabilities: readonly string[]
  readonly allowedSkills: readonly string[]
  readonly skillSnapshots: readonly BusinessSkillSnapshot[]
  readonly skillManifestHash: string
  /** Present only when a Host production resolver supplied the package. */
  readonly productionSource?: XhsProductionSourceManifest
  /** Additive source relation for a revision or one structural retry. */
  readonly lineage?: XhsExecutionLineage
  readonly createdAt: number
  readonly manifestHash: string
}

/** Frozen source relation for one additive XHS revision or retry Job. */
export type XhsExecutionLineage = XhsRevisionLineage | XhsRetryLineage | XhsContractRepairLineage | XhsLengthRepairLineage

/** Source and review evidence required by one bounded business revision. */
export interface XhsRevisionLineage {
  readonly kind: 'revision'
  readonly sourceJobId: BusinessJobId
  readonly sourceAttemptId: BusinessAttemptId
  readonly sourceOutputBundleId: BusinessOutputBundleId
  readonly sourceDraftPath: string
  readonly sourceDraftSha256: string
  readonly reviewArtifactId: BusinessArtifactId
  readonly reviewSha256: string
  readonly revisionNumber: 1 | 2
}

/** Source failure evidence required by the only admitted structural retry. */
export interface XhsRetryLineage {
  readonly kind: 'retry'
  readonly retryOfJobId: BusinessJobId
  readonly retryOfAttemptId: BusinessAttemptId
  readonly retryOfOutputBundleId?: BusinessOutputBundleId
  readonly retryReason: XhsRetryReason
  readonly retryNumber: 1
}

/** Evidence required by the sole deterministic-contract repair of one candidate. */
export interface XhsContractRepairLineage {
  readonly kind: 'contract-repair'
  readonly sourceJobId: BusinessJobId
  readonly sourceAttemptId: BusinessAttemptId
  readonly sourceOutputBundleId: BusinessOutputBundleId
  readonly sourceDraftPath: string
  readonly sourceDraftSha256: string
  readonly businessReviewArtifactId: BusinessArtifactId
  readonly businessReviewSha256: string
  readonly hardValidationArtifactId: BusinessArtifactId
  readonly hardValidationSha256: string
  readonly failedContractItems: readonly string[]
  readonly repairNumber: 1
  readonly repairedFields: readonly XhsContractRepairField[]
}

/** Evidence required by the only safe length patch over one PASS-reviewed Candidate. */
export interface XhsLengthRepairLineage {
  readonly kind: 'length-repair'
  readonly sourceJobId: BusinessJobId
  readonly sourceAttemptId: BusinessAttemptId
  readonly sourceOutputBundleId: BusinessOutputBundleId
  readonly sourceDraftPath: string
  readonly sourceDraftSha256: string
  readonly businessReviewArtifactId: BusinessArtifactId
  readonly businessReviewSha256: string
  readonly hardValidationArtifactId: BusinessArtifactId
  readonly hardValidationSha256: string
  readonly failedContractItems: readonly ('titleRange' | 'bodyRange')[]
  readonly repairNumber: 1
}

/** Closed fields that V0.1 Contract Repair may change. */
export type XhsContractRepairField =
  | 'title-length'
  | 'body-length'
  | 'keyword-occurrences'
  | 'keyword-title-position'
  | 'declared-title-characters'
  | 'declared-body-characters'
  | 'allowed-topics-formatting'

/** Closed structural failures eligible for an execution retry. */
export type XhsRetryReason = 'EMPTY_DRAFT' | 'FORMAT_CONTRACT_FAIL' | 'REQUIRED_BODY_MISSING'

/** Review outcomes recorded without changing production truth. */
export type XhsReviewResult = 'PASS' | 'MODIFY' | 'FAIL'
/** Review authority classes admitted by V0.1. */
export type XhsReviewerType = 'human' | 'external_business_ai'

/** Candidate classes admitted by the bounded XHS review flow. */
export type XhsReviewCandidateType = 'first_pass' | 'revision' | 'retry' | 'contract_repair' | 'length_repair'

/** Historical immutable review over one authoritative First-Pass draft. */
export interface XhsReviewArtifactDocumentV1 {
  readonly review_version: 1
  readonly project: 'xhs'
  readonly source_job_id: BusinessJobId
  readonly source_attempt_id: BusinessAttemptId
  readonly source_draft_artifact: string
  readonly source_draft_sha256: string
  readonly review_result: XhsReviewResult
  readonly required_changes: readonly string[]
  readonly quality_suggestions: readonly string[]
  readonly preserve: readonly string[]
  readonly reviewer_type: XhsReviewerType
  readonly reviewed_at: number
  readonly provenance: Readonly<{
    source_output_bundle_id: BusinessOutputBundleId
    source: 'authoritative-intermediate-output-bundle'
  }>
  readonly review_sha256: string
}

/** Immutable review over one authoritative, structurally complete candidate. */
export interface XhsReviewArtifactDocumentV2 {
  readonly review_version: 2
  readonly project: 'xhs'
  readonly source_job_id: BusinessJobId
  readonly source_attempt_id: BusinessAttemptId
  readonly source_artifact_id: BusinessOutputBundleId
  readonly source_artifact_path: string
  readonly source_draft_sha256: string
  readonly source_candidate_type: XhsReviewCandidateType
  readonly source_revision_number?: 1 | 2
  readonly source_retry_number?: 1
  readonly review_result: XhsReviewResult
  readonly required_changes: readonly string[]
  readonly quality_suggestions: readonly string[]
  readonly preserve: readonly string[]
  readonly reviewer_type: XhsReviewerType
  readonly reviewed_at: number
  readonly provenance: Readonly<{
    source_output_bundle_id: BusinessOutputBundleId
    source: 'authoritative-intermediate-output-bundle'
  }>
  readonly review_sha256: string
}

/** Every review document version readable without rewriting its Artifact. */
export type XhsReviewArtifactDocument = XhsReviewArtifactDocumentV1 | XhsReviewArtifactDocumentV2

/** One immutable execution Attempt in a Job's history. */
export interface BusinessAttempt {
  readonly id: BusinessAttemptId
  readonly jobId: BusinessJobId
  readonly sequence: number
  readonly status: BusinessAttemptStatus
  readonly lease: BusinessExecutionLease | null
  readonly executionPackage: BusinessExecutionPackage | null
  readonly agentRuns: readonly BusinessAgentRun[]
  readonly outputBundle: BusinessOutputBundle | null
  readonly createdAt: number
  readonly completedAt?: number
  readonly statusReason?: string
}

/** Durable reference to one atomically published Artifact. */
export interface BusinessArtifact {
  readonly artifactId: BusinessArtifactId
  readonly jobId: BusinessJobId
  readonly attemptId: BusinessAttemptId
  readonly type: BusinessArtifactType
  readonly revision: number
  readonly path: string
  readonly hash: string
  readonly bytes: number
  readonly createdAt: number
  readonly provenance?: BusinessAgentArtifactProvenance
}

/** Restricted Agent facts copied onto its authoritative output Artifact. */
export interface BusinessAgentArtifactProvenance {
  readonly kind: 'restricted-agent'
  readonly agentRunId: BusinessAgentRunId
  readonly executionPackageId: BusinessExecutionPackageId
  readonly executionPackageManifestHash: string
  readonly skillManifestHash: string
  readonly model: BusinessAgentModel
}

/** Durable receipt that makes one Job mutation idempotent across restarts. */
export interface BusinessOperationReceipt {
  readonly key: string
  readonly kind: 'transition' | 'create-attempt' | 'acquire-lease' | 'renew-lease' | 'release-lease' | 'create-package' | 'complete-attempt' | 'commit-artifact' | 'run-agent'
  readonly fingerprint: string
  readonly revision: number
  readonly resultId?: string
  readonly createdAt: number
}

/** One exact file inside an authoritative XHS output bundle. */
export interface BusinessOutputBundleEntry {
  readonly name: XhsBodyPrepareOutputName
  readonly mediaType: 'text/markdown' | 'application/json'
  readonly path: string
  readonly hash: string
  readonly bytes: number
}

/** Atomically referenced three-file result of one XHS preparation Attempt. */
export interface BusinessOutputBundle {
  readonly id: BusinessOutputBundleId
  readonly jobId: BusinessJobId
  readonly attemptId: BusinessAttemptId
  readonly agentRunId: BusinessAgentRunId
  readonly executionPackageId: BusinessExecutionPackageId
  readonly action:
  | XhsBodyPrepareAction
  | XhsBodyRevisionAction
  | XhsBodyRetryAction
  | XhsBodyContractRepairAction
  | XhsBodyLengthRepairAction
  readonly actionPolicyVersion: string
  readonly project: 'xhs'
  readonly type: 'intermediate'
  readonly outputVersion: 1
  readonly idempotencyKey: string
  readonly path: string
  readonly entries: readonly [BusinessOutputBundleEntry, BusinessOutputBundleEntry, BusinessOutputBundleEntry]
  readonly manifestHash: string
  readonly createdAt: number
}

/** Valid output-bundle directory absent from durable Attempt state. */
export interface BusinessOrphanOutputBundle {
  readonly path: string
  readonly kind: 'published' | 'staging'
}

/** Read-only output-bundle reconciliation result. */
export interface BusinessOutputBundleReconciliation {
  readonly referencedCount: number
  readonly orphanBundles: readonly BusinessOrphanOutputBundle[]
}

/** Verified XHS bundle bytes keyed by their frozen logical names. */
export interface BusinessOutputBundleContent {
  readonly bundle: BusinessOutputBundle
  readonly files: Readonly<Record<XhsBodyPrepareOutputName, string>>
}

/** One or four Business Job identifiers admitted by the closed Batch modes. */
export type BusinessBatchJobIds = readonly [BusinessJobId] | readonly [BusinessJobId, BusinessJobId, BusinessJobId, BusinessJobId]
/** One or four input references admitted by the closed Batch modes. */
export type BusinessBatchInputs = readonly [BusinessInputReference] | readonly [
  BusinessInputReference,
  BusinessInputReference,
  BusinessInputReference,
  BusinessInputReference,
]

/** Persisted Batch aggregate with explicit participating-Job semantics. */
export interface BusinessBatch {
  readonly id: BusinessBatchId
  readonly project: BusinessProject
  readonly type: BusinessJobType
  readonly mode: BusinessBatchMode
  readonly status: BusinessBatchStatus
  readonly jobIds: BusinessBatchJobIds
  readonly participatingJobIds: BusinessBatchJobIds
  readonly inputs: BusinessBatchInputs
  readonly revision: number
  readonly createKey: string
  readonly createFingerprint: string
  readonly createdAt: number
  readonly updatedAt: number
}

/** The durable source of truth for one Business Job. */
export interface BusinessJob {
  readonly id: BusinessJobId
  readonly batchId: BusinessBatchId
  readonly project: BusinessProject
  readonly type: BusinessJobType
  readonly status: BusinessJobStatus
  readonly revision: number
  readonly currentAttempt: BusinessAttemptId | null
  readonly input: BusinessInputReference
  readonly attempts: readonly BusinessAttempt[]
  readonly artifactRefs: readonly BusinessArtifact[]
  readonly operations: readonly BusinessOperationReceipt[]
  readonly statusReason?: string
  readonly createdAt: number
  readonly updatedAt: number
}

/** Fields shared by the two new-Batch participation modes. */
interface CreateBusinessBatchRequestBase {
  readonly idempotencyKey: string
  readonly project: BusinessProject
  readonly type: BusinessJobType
}

/** Request to create one truthful single-Job Batch. */
export interface CreateSingleBusinessBatchRequest extends CreateBusinessBatchRequestBase {
  readonly mode: 'single'
  readonly inputs: readonly [BusinessInputReference]
}

/** Request to create one four-participant Batch. */
export interface CreateQuadBusinessBatchRequest extends CreateBusinessBatchRequestBase {
  readonly mode: 'quad'
  readonly inputs: readonly [BusinessInputReference, BusinessInputReference, BusinessInputReference, BusinessInputReference]
}

/** Closed creation request; legacy mode exists only through V4 migration. */
export type CreateBusinessBatchRequest = CreateSingleBusinessBatchRequest | CreateQuadBusinessBatchRequest

/** Compare-and-swap request for a non-execution Job transition. */
export interface TransitionBusinessJobRequest {
  readonly jobId: BusinessJobId
  readonly expectedRevision: number
  readonly idempotencyKey: string
  readonly status: BusinessJobStatus
  readonly reason?: string
}

/** Compare-and-swap request to create a pending Attempt. */
export interface CreateBusinessAttemptRequest {
  readonly jobId: BusinessJobId
  readonly expectedRevision: number
  readonly idempotencyKey: string
}

/** Compare-and-swap request to acquire execution ownership. */
export interface AcquireBusinessExecutionLeaseRequest {
  readonly jobId: BusinessJobId
  readonly attemptId: BusinessAttemptId
  readonly expectedRevision: number
  readonly idempotencyKey: string
  readonly ownerId: string
}

/** Compare-and-swap request to extend the current execution lease. */
export interface RenewBusinessExecutionLeaseRequest extends AcquireBusinessExecutionLeaseRequest {}

/** Compare-and-swap request to relinquish execution and make the Job recoverable. */
export interface ReleaseBusinessExecutionLeaseRequest extends AcquireBusinessExecutionLeaseRequest {
  readonly reason?: string
}

/** Caller description of one file to freeze into an execution package. */
export interface BusinessExecutionInputRequest {
  readonly role: string
  readonly path: string
  readonly required: boolean
}

/** Compare-and-swap request that freezes one Attempt's minimum input set. */
export interface CreateBusinessExecutionPackageRequest {
  readonly jobId: BusinessJobId
  readonly attemptId: BusinessAttemptId
  readonly expectedRevision: number
  readonly idempotencyKey: string
  readonly ownerId: string
  readonly workflowVersion: string
  readonly inputs: readonly BusinessExecutionInputRequest[]
  readonly allowedReadRoots: readonly string[]
  readonly allowedReadFiles: readonly string[]
  readonly allowedCapabilities: readonly string[]
  readonly allowedSkills: readonly string[]
}

/** Compare-and-swap request for one deterministic production-source package. */
export interface CreateXhsProductionExecutionPackageRequest {
  readonly jobId: BusinessJobId
  readonly attemptId: BusinessAttemptId
  readonly expectedRevision: number
  readonly idempotencyKey: string
  readonly ownerId: string
  readonly identity: XhsProductionTaskIdentity
}

/** Host request to persist a business review on a new additive Revision Job. */
export interface CreateXhsReviewArtifactRequest {
  readonly jobId: BusinessJobId
  readonly attemptId: BusinessAttemptId
  readonly expectedRevision: number
  readonly idempotencyKey: string
  readonly sourceJobId: BusinessJobId
  readonly sourceAttemptId: BusinessAttemptId
  readonly sourceDraftSha256: string
  readonly reviewResult: XhsReviewResult
  readonly requiredChanges: readonly string[]
  readonly qualitySuggestions: readonly string[]
  readonly preserve: readonly string[]
  readonly reviewerType: XhsReviewerType
  readonly reviewedAt: number
}

/** Persisted Review reference and parsed immutable document. */
export interface XhsReviewArtifactResult {
  readonly artifact: BusinessArtifact
  readonly review: XhsReviewArtifactDocument
}

/** Human APPROVE/REJECT request over one machine-valid length-repair Candidate. */
export interface CreateXhsLengthRepairApprovalRequest {
  readonly jobId: BusinessJobId
  readonly attemptId: BusinessAttemptId
  readonly expectedRevision: number
  readonly idempotencyKey: string
  readonly sourceJobId: BusinessJobId
  readonly sourceAttemptId: BusinessAttemptId
  readonly repairedDraftSha256: string
  readonly decision: 'APPROVE' | 'REJECT'
  readonly decidedAt: number
}

/** Persisted terminal patch decision. */
export interface XhsLengthRepairApprovalResult {
  readonly artifact: BusinessArtifact
  readonly approval: import('./xhs-length-repair.ts').XhsLengthRepairApprovalDocument
}

/** Production package request for one first business revision. */
export interface CreateXhsRevisionExecutionPackageRequest extends CreateXhsProductionExecutionPackageRequest {
  readonly reviewArtifactId: BusinessArtifactId
}

/** Production package request for the only structural retry of a source execution. */
export interface CreateXhsRetryExecutionPackageRequest extends CreateXhsProductionExecutionPackageRequest {
  readonly retryOfJobId: BusinessJobId
  readonly retryOfAttemptId: BusinessAttemptId
  readonly retryReason: XhsRetryReason
}

/** Production package request for one deterministic-contract-only repair. */
export interface CreateXhsContractRepairExecutionPackageRequest extends CreateXhsProductionExecutionPackageRequest {
  readonly reviewArtifactId: BusinessArtifactId
}

/** Production package request for one bounded PASS-reviewed length patch. */
export interface CreateXhsLengthRepairExecutionPackageRequest extends CreateXhsProductionExecutionPackageRequest {
  readonly reviewArtifactId: BusinessArtifactId
}

/** Zero-model readiness result for a revision or retry. */
export interface XhsSecondPassPreflight {
  readonly status: 'REVISION_READY' | 'RETRY_READY' | 'CONTRACT_REPAIR_READY' | 'LENGTH_REPAIR_READY'
  readonly sourceJobId: BusinessJobId
  readonly sourceAttemptId: BusinessAttemptId
  readonly sourceDraftSha256?: string
  readonly reviewArtifactId?: BusinessArtifactId
  readonly revisionNumber?: 1 | 2
  readonly retryReason?: XhsRetryReason
  readonly hardValidationArtifactId?: BusinessArtifactId
  readonly failedContractItems?: readonly string[]
  readonly repairedFields?: readonly XhsContractRepairField[]
}

/** Production resolution result returned without exposing source bodies. */
export interface XhsProductionExecutionPackageResult {
  readonly executionPackage: BusinessExecutionPackage
  readonly sourceManifest: XhsProductionSourceManifest
  readonly timing: XhsProductionPackageTiming
}

/** Non-durable timings observed while resolving one production package. */
export interface XhsProductionPackageTiming {
  readonly sourceResolutionMs: number
  readonly skillSnapshotMs: number
  readonly executionPackageBuildMs: number
}

/** Request to read one exact frozen input through the Host policy. */
export interface ReadBusinessExecutionInputRequest {
  readonly jobId: BusinessJobId
  readonly attemptId: BusinessAttemptId
  readonly ownerId: string
  readonly path: string
}

/** Verified input body returned by the Host read resolver. */
export interface BusinessExecutionInputContent {
  readonly input: BusinessExecutionInput
  readonly content: string
}

/** Result of revalidating a frozen package against current source bytes. */
export interface BusinessExecutionPackageVerification {
  readonly packageId: BusinessExecutionPackageId
  readonly manifestHash: string
  readonly inputCount: number
}

/** Derived lease state that never treats expired or foreign ownership as live. */
export interface BusinessExecutionStatus {
  readonly jobId: BusinessJobId
  readonly attemptId: BusinessAttemptId | null
  readonly state: 'idle' | 'pending' | 'owned' | 'expired' | 'owner-lost' | 'interrupted' | 'terminal'
  readonly ownerId?: string
  readonly leaseExpiresAt?: number
}

/** Compare-and-swap request to end one owned Attempt. */
export interface CompleteBusinessAttemptRequest {
  readonly jobId: BusinessJobId
  readonly attemptId: BusinessAttemptId
  readonly expectedRevision: number
  readonly idempotencyKey: string
  readonly ownerId: string
  readonly outcome: 'completed' | 'failed' | 'cancelled'
  readonly reason?: string
}

/** Compare-and-swap request to publish one owned Attempt's Artifact. */
export interface CommitBusinessArtifactRequest {
  readonly jobId: BusinessJobId
  readonly attemptId: BusinessAttemptId
  readonly expectedRevision: number
  readonly idempotencyKey: string
  readonly ownerId: string
  readonly type: BusinessArtifactType
  readonly content: string
  readonly provenance?: BusinessAgentArtifactProvenance
}

/** Host-only request to execute one immutable package through the restricted Agent route. */
export interface RunRestrictedBusinessAgentRequest {
  readonly jobId: BusinessJobId
  readonly attemptId: BusinessAttemptId
  readonly executionPackageId: BusinessExecutionPackageId
  readonly ownerId: string
  readonly action: BusinessAgentAction
  readonly idempotencyKey: string
  readonly xhs?: XhsBodyPrepareRoute
}

/** Provider token counts observed from one fresh Agent invocation. */
export interface BusinessAgentTokenUsage {
  readonly inputTokens: number
  readonly outputTokens: number
  readonly cacheReadTokens?: number
  readonly cacheWriteTokens?: number
  readonly reasoningTokens?: number
}

/** Fresh invocation observations; XHS persists a separate receipt without changing the V5 Job fields. */
export interface BusinessAgentExecutionMetrics {
  readonly requestStartedAt: number
  readonly firstResponseAt?: number
  readonly responseCompletedAt: number
  readonly agentDurationMs: number
  readonly finishReason?: string
  readonly toolCalls: number
  readonly tokenUsage?: BusinessAgentTokenUsage
}

/** Authoritative text Artifact returned by the fixture action. */
export interface RestrictedBusinessAgentArtifactResult {
  readonly kind: 'artifact'
  readonly run: BusinessAgentRun
  readonly artifact: BusinessArtifact
  /** Absent only when an already committed result is replayed. */
  readonly executionMetrics?: BusinessAgentExecutionMetrics
}

/** Authoritative output bundle returned by the XHS action. */
export interface RestrictedBusinessAgentBundleResult {
  readonly kind: 'output-bundle'
  readonly run: BusinessAgentRun
  readonly outputBundle: BusinessOutputBundle
  /** Absent only when an already committed result is replayed. */
  readonly executionMetrics?: BusinessAgentExecutionMetrics
}

/** Authoritative output returned after a restricted Agent Run commits. */
export type RestrictedBusinessAgentResult = RestrictedBusinessAgentArtifactResult | RestrictedBusinessAgentBundleResult

/** Verified Artifact reference and UTF-8 body. */
export interface BusinessArtifactContent {
  readonly artifact: BusinessArtifact
  readonly content: string
}

/** Result of verifying one durable Artifact reference. */
export interface BusinessArtifactVerification {
  readonly artifactId: BusinessArtifactId
  readonly hash: string
  readonly bytes: number
}

/** Valid Artifact file not referenced by durable Job state. */
export interface BusinessOrphanArtifact {
  readonly path: string
  readonly hash: string
  readonly bytes: number
}

/** Read-only reconciliation result; it never deletes or promotes files. */
export interface BusinessArtifactReconciliation {
  readonly referencedCount: number
  readonly orphanArtifacts: readonly BusinessOrphanArtifact[]
}

/** Media modality supported by the fixed Image and Video Studio Mock adapters. */
export type MediaStudioModality = 'image' | 'video'

/** Lifecycle shared by persistent media tasks and their output artifacts. */
export type MediaStudioTaskStatus = 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled' | 'timeout'

/** A model-supported Studio control; unsupported controls are omitted. */
export interface MediaStudioParameterField {
  readonly id: string
  readonly label: string
  readonly type: 'select' | 'toggle' | 'text' | 'range'
  readonly default: JsonValue
  readonly options?: readonly JsonValue[]
  readonly min?: number
  readonly max?: number
  readonly step?: number
}

/** Fixed model identity exposed by the Host; it never accepts a provider URL or credential. */
export interface MediaStudioModel {
  readonly modelId: string
  readonly displayName: string
  readonly provider: string
  readonly modality: MediaStudioModality
  readonly maxOutputsPerTask: number
  readonly supportsReferenceArtifact: boolean
  readonly referenceKind: 'image' | 'first-frame' | null
  readonly maxReferenceAssets: number
  readonly referenceResolutionMax?: string
  readonly supportsPreciseEditing: false
  readonly parameterDefaults: Readonly<Record<string, JsonValue>>
  readonly parameterFields: readonly MediaStudioParameterField[]
}

/** Durable identity for one long-lived media creation conversation. */
export interface CreativeSession {
  readonly sessionId: string
  readonly modality: MediaStudioModality
  readonly title: string
  readonly createdAt: number
  readonly updatedAt: number
}

/** One immutable prompt and model-parameter snapshot submitted in a Creative Session. */
export interface CreativeTurn {
  readonly turnId: string
  readonly sessionId: string
  readonly modality: MediaStudioModality
  readonly taskIds: readonly string[]
  readonly artifactIds: readonly string[]
  readonly prompt: string
  readonly modelId: string
  readonly provider: string
  readonly paramsSnapshot: Readonly<Record<string, JsonValue>>
  readonly referenceArtifactIds: readonly string[]
  readonly requestedOutputCount: number
  readonly parentArtifactId: string | null
  readonly modificationIntent: string | null
  readonly operation: 'generation' | 'mock-derived-revision' | 'prompted-regeneration-not-precise-edit'
  readonly createdAt: number
  readonly status: MediaStudioTaskStatus
}

/** One provider request snapshot. Mock tasks never send a network request. */
export interface MediaStudioTask {
  readonly taskId: string
  readonly sessionId: string
  readonly turnId: string
  readonly modality: MediaStudioModality
  readonly modelId: string
  readonly provider: string
  readonly paramsSnapshot: Readonly<Record<string, JsonValue>>
  readonly createdAt: number
  readonly updatedAt: number
  readonly status: MediaStudioTaskStatus
  readonly progress: number
  readonly pollCount: number
  readonly remoteTaskId: string | null
  readonly resultRefs: readonly string[]
  readonly errorCode: string | null
  readonly mock: true
  readonly providerNetworkRequests: 0
}

/** Persistent media output, separate from the task that created it. */
export interface MediaArtifact {
  readonly artifactId: string
  readonly sessionId: string
  readonly turnId: string
  readonly taskId: string
  readonly modality: MediaStudioModality
  readonly parentArtifactId: string | null
  readonly provider: string
  readonly modelId: string
  readonly prompt: string
  readonly paramsSnapshot: Readonly<Record<string, JsonValue>>
  readonly referenceArtifactIds: readonly string[]
  readonly createdAt: number
  readonly updatedAt: number
  readonly status: MediaStudioTaskStatus
  readonly resultRef: string | null
  readonly displayIndex: number
  readonly revisionDepth: number
  readonly mock: true
}

/** Immutable edge linking one new artifact to the previous artifact it references. */
export interface MediaArtifactRevision {
  readonly revisionId: string
  readonly artifactId: string
  readonly parentArtifactId: string
  readonly turnId: string
  readonly intent: string | null
  readonly createdAt: number
}

/** One atomic storage-domain record; updates append entities without replacing prior works. */
export interface CreativeSessionRecord {
  readonly session: CreativeSession
  readonly turns: readonly CreativeTurn[]
  readonly tasks: readonly MediaStudioTask[]
  readonly artifacts: readonly MediaArtifact[]
  readonly revisions: readonly MediaArtifactRevision[]
}

/** Bounded request for one fixed-model Mock generation or derivative turn. */
export interface CreateCreativeTurnRequest {
  readonly modality: MediaStudioModality
  readonly modelId: string
  readonly prompt: string
  readonly params: Readonly<Record<string, JsonValue>>
  readonly sessionId?: string
  readonly parentArtifactId?: string
  readonly modificationIntent?: string
  readonly requestedOutputCount?: number
}

/** V3-03R: four-level readiness grade for one Video Packaging model route. */
export type VideoPackagingModelGrade =
  /** Appears in the Harness LLM registry. */
  | 'registered'
  /** Provider credential is configured (verified via describe(); the value is never read). */
  | 'configured'
  /** Dedicated restricted route exists, is enabled, and retry-bounded. */
  | 'routable'
  /** Blocked; unavailableReason names the failing grade level. */
  | 'not-callable'

/** V3-03R: retry-bound evidence for one provider route. */
export interface VideoPackagingRetryEvidence {
  /** Registered provider route id. */
  readonly provider: string
  /** Resolved retry mode; 'unknown' when the policy cannot be inspected. */
  readonly mode: 'normal' | 'always' | 'unknown'
  /** Maximum retries after the first request; null when unbounded or unknown. */
  readonly maxRetries: number | null
  /** True only when every inspected layer proves a finite request bound. */
  readonly bounded: boolean
  /** Retry layers actually inspected, in request order. */
  readonly layers: readonly string[]
  /** Human-readable basis for the verdict; never a secret value. */
  readonly note: string
}

/** Registered Harness language model and safe packaging-route readiness facts. */
export interface VideoPackagingAiModel {
  readonly provider: string
  readonly providerName: string
  readonly model: string
  readonly modelName: string
  /** V3-03R: four-level readiness grade (V3-03 had no grading; every model was not-callable). */
  readonly grade: VideoPackagingModelGrade
  readonly dedicatedRouteConfigured: boolean
  /**
   * V3-03R: credential status verified via CredentialProvider.describe().
   * 'not-inspected' (V3-03 legacy), 'configured', 'missing', or 'unknown-provider'
   * when no credential mapping exists. The secret value is never read.
   */
  readonly authentication: 'not-inspected' | 'configured' | 'missing' | 'unknown-provider'
  readonly invocationReady: boolean
  /** V3-03R: names the failing grade level and the concrete missing piece. */
  readonly unavailableReason: string
  /** V3-03R: retry-bound evidence; absent when the policy was not inspected. */
  readonly retryEvidence?: VideoPackagingRetryEvidence
  /** V3-03R: model invocation switch; always false in this stage. */
  readonly invocationEnabled: boolean
}

/** V3-03R: wire input for the Video Packaging AI plan bridge call.
 * Carries summaries and references only: never media bytes, never secrets. */
export interface RunVideoPackagingPlanRequest {
  readonly video: {
    readonly assetId: string
    readonly width: number
    readonly height: number
    readonly duration: number
  }
  readonly transcript: { readonly format: 'srt' | 'vtt'; readonly text: string }
  readonly requirements: string
  readonly mode: 'library' | 'free'
  readonly canvas: { readonly width: number; readonly height: number }
  readonly approvedMaterialSummaries: readonly string[]
}

/** V3-03R: structured suggestion returned by the Video Packaging AI route.
 * Suggestions only: the caller (never the model) decides what enters the project. */
export interface VideoPackagingAiPlanSuggestion {
  readonly proposals: readonly {
    readonly proposalId: string
    readonly title: string
    readonly rationale: string
    readonly evidence: { readonly transcriptRange: string }
    readonly component: { readonly type: string; readonly start: number; readonly duration: number }
  }[]
  readonly provider: string
  readonly model: string
  readonly generatedAt: number
}

/** Opaque Host-managed video or image asset exposed by the Video Packaging Remotes. */
export interface VideoPackagingAsset {
  readonly assetId: string
  readonly kind: 'source-video' | 'visual-png' | 'render-output'
  readonly name: string
  readonly mediaType: 'video/mp4' | 'image/png'
  readonly bytes: number
  readonly sha256: string
  readonly width: number
  readonly height: number
  readonly duration: number | null
  readonly fps: number | null
  readonly hasAudio: boolean
  readonly videoCodec: string | null
  readonly audioCodec: string | null
  readonly audioSampleRate: number | null
  readonly audioChannels: number | null
  readonly hasAlpha: boolean
  readonly status: 'technical-test' | 'pending-confirmation'
  readonly createdAt: number
}

/** Host-owned P5-07 project and its source asset reference. */
export interface VideoPackagingProject {
  readonly projectId: string
  readonly name: string
  readonly sourceVideoAssetId: string
  readonly revision: number
  readonly document: JsonValue
  readonly createdAt: number
  readonly updatedAt: number
}

/** Persisted FFmpeg task state; running work is interrupted rather than replayed after restart. */
export interface VideoPackagingRenderTask {
  readonly renderTaskId: string
  readonly projectId: string
  readonly status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled' | 'interrupted'
  readonly outputAssetId: string | null
  readonly errorCode: string | null
  readonly logTail: string
  readonly createdAt: number
  readonly updatedAt: number
}
