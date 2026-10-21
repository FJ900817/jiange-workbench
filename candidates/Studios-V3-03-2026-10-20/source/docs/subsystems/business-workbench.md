# Business Workbench

English | [中文](business-workbench.zh.md)

[`@deepseek-ai/dsh-business-workbench`](../../packages/business/business-workbench) is the Host-only durable authority for Business Batches, Jobs, execution ownership, frozen input and Skill manifests, restricted Agent Runs, Attempts, Artifact references, and XHS output bundles. It uses an independent storage domain, a Project-scoped read resolver, fixed Host action policies, and a private Artifact root. Its narrowly scoped Remotes provide read-only UI projections; they add no model-facing tool.

Source: [`packages/business/business-workbench/src/types.ts`](../../packages/business/business-workbench/src/types.ts)

## Data model

`BusinessBatch` owns one ordered Job in `single` mode or four in `quad` mode. A migrated `legacy-fixed4` Batch retains its four historical Jobs and separately identifies the one or four participants. Each Job owns its revision, pending or running Attempt, lease, frozen execution package, Agent Run and Attempt history, Artifact references, optional authoritative output bundle, and receipts. Execution packages enumerate exact files and Skill definitions with their hashes; production packages also preserve content-free entry, baseline, lineage, route, and S3 source evidence. Reads never scan the configured source root. The restricted execution lifecycle is in the [Phase 3 architecture record](../architecture/business-layer-v0.1-phase3.md).

`xhs-body-prepare-v0` has explicit fixture and production routes. Both admit three exact input files and one account-specific S3 Skill snapshot; the production route additionally requires resolver-owned source evidence, exact formal S3 origin, and immediate drift verification. The model returns only draft text; the Host authors metadata and provenance, validates all three files, publishes one immutable `intermediate` bundle, and makes it authoritative through one Job CAS. The [Phase 4C-0 architecture record](../architecture/business-layer-v0.1-phase4c0.md) defines the deterministic source mapping.

A completed restricted-Agent turn without visible text fails as `EMPTY_AGENT_OUTPUT`. Its error detail contains content-free normalized event counts, available provider completion facts, Agent Run and Session identity, duration, and extraction stage. The same diagnostic is stored as JSON in the existing Agent Run failure string; schema version `5` adds no diagnostic field, and reasoning content is never accepted as draft text.

Business reviews bind one completed, structurally parseable First Pass, Revision, or Retry candidate by Job, Attempt, output bundle, draft path, and hash. A `MODIFY` Review creates a new additive Revision Job whose immediate source is that reviewed candidate. Lineage assigns Revision 1 after First Pass or Retry and Revision 2 after Revision 1; another revision fails with `MAX_REVISION_REACHED`. Structural failures remain Retry-only, one Retry is the maximum, and no operation starts another execution automatically.

`xhs-body-length-repair-v0` handles only a format-complete, business-`PASS` Candidate whose matching Hard Validation fails exclusively on title or body range. Its Skill-free package contains the TaskCard, source Candidate, bound PASS Review, and matching validation evidence. The model returns no Draft: it proposes at most three titles and three groups of exact local body replacements. The Host requires every `old_text` to occur once, applies each option independently to the immutable source, regenerates count metadata with the Validator's counter, reruns all deterministic checks, and selects the valid trial with the smallest edit distance. Failure creates evidence but no Candidate; success requires a separate terminal Patch Approval and never promotes automatically.

`LocalAIHOTIntelligenceItem` and its list/detail result types carry a bounded read-only projection from the local AIHOT Host adapter. Topic and other non-persisted values remain null; these types do not define a Project Registry or a database connection.

The Xiaohongshu Radar Host adapter exposes source status, on-demand keyword search, selected-note detail, and cover delivery. Its source calls use fixed loopback endpoints and approved read operations; the Renderer cannot choose an endpoint, header, tool name, or cover URL. Search and detail data stay in component memory, while covers cross the Remote only as opaque process-local references and validated image bytes. Failed searches return a closed error code, failure stage, duration, and optional HTTP status; raw exceptions and upstream response text remain Host-side. “爆文观察” orders only currently loaded results and is not a platform-wide ranking.

SCYS Radar uses a separate Host-owned OAuth grant and a fixed MCP read adapter. `ScysContentSummary`, `ScysProjectSummary`, and `ScysComment` contain only normalized source fields; missing values remain null. A content summary keeps its display id distinct from the source-provided `ScysTopicIdentity` required for detail and comments, and converts a numeric source publication time from Unix seconds to ISO 8601. Its status, content, project, and comment results distinguish empty lists from source errors, and no source tool is registered as a Harness tool. The trusted Desktop private Unix channel additionally exposes only `scys.recent`, `scys.hot`, and `scys.digested`; the Host constructs their `searchTopic` requests from the verified schema, uses a fixed seven-day window, at most two pages of ten, and a 12-second per-call timeout. Feed projections deduplicate and sort source identities/timestamps, discard body text, and report server filter acceptance separately from per-topic marker evidence. No HTTP or Typert Remote query was added, and no Radar UI behavior changed.

## Boundaries and limitations

- The current JSON backend permits one Runtime writer for one DSH home.
- Schema version `5` rejects all other versions during ordinary open. Its sole explicit migration converts validated V4 JSON after source-hash approval and never runs during startup.
- New Batches admit only `single` and `quad`; migrated `legacy-fixed4` data retains historical placeholders but excludes them from participating-Job projections.
- Startup completes abandoned XHS executions with verified authoritative output; other abandoned Attempts become interrupted. Recovery never retries model work. Independent observation receipts retain available metrics or explicitly record missing telemetry without changing V5.
- All restricted Agent actions enforce a fixed capability/Skill subset, origin and drift policy, empty tool set, and deny-all executor guard. The XHS production route can create and complete immutable intermediate draft bundles and bounded additive revisions but invokes no Workflow, semantic Validation, UI, approved-asset finalization, or Obsidian behavior.

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxbusinessworkbench--businessworkbenchservice"></a>

### `ctx.businessWorkbench` — `BusinessWorkbenchService`

Durable Business authority with an optional Host-restricted one-turn Agent route.

```ts cordis-catalog
/**
 * Create or recover one single- or four-participant Batch.
 * @param request - Closed mode, Project/type, matching inputs, and stable retry key.
 * @returns the ready durable Batch.
 */
createBatch(request: CreateBusinessBatchRequest): Promise<BusinessBatch>

/**
 * Return one immutable Batch snapshot.
 * @param batchId - Batch to read.
 * @returns the snapshot, or `undefined` when unknown.
 */
getBatch(batchId: BusinessBatchId): BusinessBatch | undefined

/**
 * Return ready Batches in stable creation order.
 * @returns immutable Batch snapshots.
 */
listBatches(): readonly BusinessBatch[]

/**
 * Return one immutable Job snapshot.
 * @param jobId - Job to read.
 * @returns the snapshot, or `undefined` when unknown.
 */
getJob(jobId: BusinessJobId): BusinessJob | undefined

/**
 * Return the owning Batch's one or four stored Jobs in Batch order.
 * @param batchId - Batch whose Jobs should be read.
 * @returns immutable Job snapshots, including legacy placeholders when present.
 */
listJobs(batchId: BusinessBatchId): readonly BusinessJob[]

/**
 * Read the fixed Account 2 Swiss sample as a provenance-preserving UI projection.
 * @returns Sample context assembled from configured read roots and durable records.
 */
@Remote('readXhsSwissContext') readXhsSwissContext(): Promise<XhsRealContext>

/** Read one bounded local AIHOT Article/Analysis page through the Host adapter.
 * @param request - Page size, optional cursor, and persisted-state filters.
 * @returns A validated read-only projection or an unavailable result.
 */
@Remote('listLocalAIHOTIntelligence') listLocalAIHOTIntelligence(request: LocalAIHOTIntelligenceRequest): Promise<LocalAIHOTIntelligenceResult>

/** Read one local AIHOT Article and its persisted Analysis projection.
 * @param articleId - Article identity supplied by a prior list projection.
 * @returns A validated read-only detail or an unavailable result.
 */
@Remote('readLocalAIHOTIntelligenceDetail') readLocalAIHOTIntelligenceDetail(articleId: string): Promise<LocalAIHOTIntelligenceDetailResult>

/** Read Human Reviews for one list page through the review-only Host credential.
 * @param articleIds - Article ids returned by the local intelligence projection.
 * @returns Stored human judgments only; no Article or Analysis fields are writable here.
 */
@Remote('listLocalAIHOTReviews') listLocalAIHOTReviews(articleIds: readonly string[]): Promise<LocalAIHOTReviewsResult>

/** Read one Article's current Human Review through the Host bridge.
 * @param articleId - Article identity returned by the local intelligence projection.
 * @returns The current judgment or null when none exists.
 */
@Remote('readLocalAIHOTReview') readLocalAIHOTReview(articleId: string): Promise<LocalAIHOTReviewResult>

/** Save one human verdict without changing AIHOT Analysis fields.
 * @param request - Article identity and human-authored verdict, reasons, and note.
 * @returns Whether the private API accepted the write; callers must read the row back.
 */
@Remote('writeLocalAIHOTReview') writeLocalAIHOTReview(request: LocalAIHOTReviewWriteRequest): Promise<LocalAIHOTReviewWriteResult>

/** Start a user-approved, explicitly selected bounded pending-analysis run.
 * @param request - Article ids, fixed article limit, provider-attempt cap, and retry-safe idempotency key.
 * @returns The Host-validated run or a content-free availability/eligibility result.
 */
@Remote('processLocalAIHOTPending') processLocalAIHOTPending(request: LocalAIHOTPendingRunRequest): Promise<LocalAIHOTPendingActionResult>

/** Reconnect to one process-local run without creating another analysis request.
 * @param runId - UUID returned by the start action.
 * @returns Current safe progress or an unavailable result.
 */
@Remote('readLocalAIHOTPendingRun') readLocalAIHOTPendingRun(runId: string): Promise<LocalAIHOTPendingActionResult>

/** Read recent controlled runs for Radar's compact history.
 * @returns The most recent process-local runs without provider diagnostics.
 */
@Remote('listLocalAIHOTPendingRuns') listLocalAIHOTPendingRuns(): Promise<{ readonly status: 'available'; readonly runs: readonly LocalAIHOTPendingRun[] } | { readonly status: 'unavailable' }>

/** Read only the Xiaohongshu logged-in boolean through the Host credential bridge.
 * @returns A content-free login status; upstream account identifiers are discarded.
 */
@Remote('getXhsLoginStatus') getXhsLoginStatus(): Promise<XhsLoginStatusResult>

/** Request one temporary Xiaohongshu QR image through the Host-only bridge.
 * @returns An in-memory display payload with expiry metadata, never persisted by this service.
 */
@Remote('getXhsLoginQrCode') getXhsLoginQrCode(): Promise<XhsLoginQrCodeResult>

/** Read Xiaohongshu connection state through the fixed status tool.
 * @returns Connected, logged-out, or unavailable source status.
 */
@Remote('getXhsSourceStatus') getXhsSourceStatus(): Promise<XhsSourceStatusResult>

/** Search one user-entered Xiaohongshu keyword with a source-supported sort.
 * @param input - One non-empty keyword and optional source sort; omitted sort defaults to `综合`.
 * @returns A bounded result projection or a source-specific failure state.
 */
@Remote('searchXhsFeeds') searchXhsFeeds(input: { readonly keyword: string; readonly sortBy?: XhsSearchSort }): Promise<XhsSearchResult>

/** Read one selected result; explicit comment loading uses the fixed bounded detail API.
 * @param input - The selected result id, source-returned access token, and optional comment-load request.
 * @returns A detail projection or a content-free failure state.
 */
@Remote('getXhsFeedDetail') getXhsFeedDetail(input: { readonly id: string; readonly xsecToken: string; readonly loadComments?: boolean }): Promise<XhsFeedDetailResult>

/** Return safe SCYS authorization and transport state without exposing Keychain values.
 * @returns Content-free connection state.
 */
@Remote('getScysSourceStatus') getScysSourceStatus(): Promise<ScysSourceStatusResult>

/** Start the official browser-mediated SCYS OAuth flow.
 * @returns The current content-free connecting state.
 */
@Remote('connectScys') connectScys(): Promise<ScysSourceStatusResult>

/** Search SCYS content through fixed read-only tool names.
 * @param keyword - One user-entered query.
 * @returns Normalized content cards or a safe source error.
 */
@Remote('searchScysContent') searchScysContent(keyword: string): Promise<ScysContentSearchResult>

/** Read one SCYS topic selected from a prior search result.
 * @param identity - Source-provided entity type and id from the selected result.
 * @returns A normalized content detail or a safe source error.
 */
@Remote('getScysContentDetail') getScysContentDetail(identity: ScysTopicIdentity): Promise<ScysContentDetailResult>

/** Search the SCYS project library through fixed read-only tool names.
 * @param keyword - One user-entered query.
 * @returns Normalized project cards or a safe source error.
 */
@Remote('searchScysProjects') searchScysProjects(keyword: string): Promise<ScysProjectSearchResult>

/** Read one SCYS project selected from a prior search result.
 * @param id - Source project id from the selected result.
 * @returns A normalized project detail or a safe source error.
 */
@Remote('getScysProjectDetail') getScysProjectDetail(id: string): Promise<ScysProjectDetailResult>

/** Load one bounded page of SCYS comments after explicit user action.
 * @param identity - Source-provided entity type and id from the selected result.
 * @returns Normalized comments or a safe source error.
 */
@Remote('loadScysComments') loadScysComments(identity: ScysTopicIdentity): Promise<ScysCommentLoadResult>

/** Fetch one mapped XHS cover or detail image through the bounded Host cache.
 * @param input - An opaque image reference returned by a prior XHS search or detail.
 * @returns An in-memory image payload or a content-free failure result.
 */
@Remote('getXhsCoverAsset') getXhsCoverAsset(input: { readonly assetId: string }): Promise<XhsCoverAssetResult>

/** Analyze one note's loaded comments through the independent stateless XHS model route.
 * @param request - One note and no more than the first ten loaded comment texts.
 * @returns Validated insights or content-free route, provider, or validation diagnostics.
 */
@Remote('analyzeXhsComments') async analyzeXhsComments(request: XhsCommentAnalysisRequest): Promise<XhsCommentAnalysisResult>

/**
 * Apply a non-execution Job transition with compare-and-swap.
 * @param request - Observed Job revision, target state, and retry key.
 * @returns the committed Job snapshot.
 */
transitionJob(request: TransitionBusinessJobRequest): Promise<BusinessJob>

/**
 * Create a pending Attempt without claiming execution ownership.
 * @param request - Observed Job revision and retry key.
 * @returns the Job containing the new pending Attempt.
 */
createAttempt(request: CreateBusinessAttemptRequest): Promise<BusinessJob>

/**
 * Acquire the sole valid execution lease for a pending Attempt.
 * @param request - Attempt, owner, observed revision, and retry key.
 * @returns the running Job snapshot.
 */
acquireExecutionLease(request: AcquireBusinessExecutionLeaseRequest): Promise<BusinessJob>

/**
 * Renew the current owner's non-expired lease through Job CAS.
 * @param request - Current owner and observed Job revision.
 * @returns the Job containing the renewed lease.
 */
renewExecutionLease(request: RenewBusinessExecutionLeaseRequest): Promise<BusinessJob>

/**
 * Release execution ownership and retain the Attempt as interrupted history.
 * @param request - Current owner, observed revision, and optional reason.
 * @returns the interrupted Job snapshot.
 */
releaseExecutionLease(request: ReleaseBusinessExecutionLeaseRequest): Promise<BusinessJob>

/**
 * Freeze one current Attempt's exact inputs and declarative capability lists.
 * @param request - Input files, allow-lists, owner, and observed revision.
 * @returns the immutable execution package.
 */
createExecutionPackage(request: CreateBusinessExecutionPackageRequest): Promise<BusinessExecutionPackage>

/**
 * Resolve one formal XHS production slot and freeze it into the current Attempt.
 * @param request - Exact slot identity plus current lease and compare-and-swap facts.
 * @returns the durable package and content-free source evidence.
 */
async createXhsProductionExecutionPackage( request: CreateXhsProductionExecutionPackageRequest, ): Promise<XhsProductionExecutionPackageResult>

/**
 * Persist one immutable business review on a new additive Revision Job.
 * @param request - Target Revision Job, reviewed candidate identity, review text, and compare-and-swap facts.
 * @returns the committed Review Artifact and its verified document.
 */
createXhsReviewArtifact(request: CreateXhsReviewArtifactRequest): Promise<XhsReviewArtifactResult>

/** Persist the only human APPROVE/REJECT decision over a machine-valid length patch.
 * @param request - Target decision Job, repaired Candidate identity, and terminal decision.
 * @returns Immutable Patch Approval Artifact without promotion or another repair.
 */
createXhsLengthRepairApproval( request: CreateXhsLengthRepairApprovalRequest, ): Promise<XhsLengthRepairApprovalResult>

/**
 * Verify that one persisted MODIFY review can start an additive Revision execution.
 * @param jobId - Target Revision Job that owns the Review Artifact.
 * @param attemptId - Active target Attempt that will receive the revision package.
 * @param reviewArtifactId - Persisted Review Artifact bound to the reviewed candidate.
 * @returns the ready state and deterministic next revision number.
 */
async preflightXhsRevision( jobId: BusinessJobId, attemptId: BusinessAttemptId, reviewArtifactId: BusinessArtifactId, ): Promise<XhsSecondPassPreflight>

/**
 * Verify structural retry eligibility without creating or running a Retry Job.
 * @param sourceJobId - Failed source Job whose structural evidence is authoritative.
 * @param sourceAttemptId - Failed source Attempt to inspect.
 * @returns the ready state and evidence-derived retry reason.
 */
async preflightXhsRetry(sourceJobId: BusinessJobId, sourceAttemptId: BusinessAttemptId): Promise<XhsSecondPassPreflight>

/**
 * Verify that a PASS-reviewed Candidate has only admitted deterministic failures.
 * @param jobId - Target Contract Repair Job that owns the PASS Review.
 * @param attemptId - Active target Attempt that would receive the repair package.
 * @param reviewArtifactId - PASS Review bound to the exact source Candidate.
 * @returns the ready state, matching validation evidence, and closed repair scope.
 */
async preflightXhsContractRepair( jobId: BusinessJobId, attemptId: BusinessAttemptId, reviewArtifactId: BusinessArtifactId, ): Promise<XhsSecondPassPreflight>

/** Verify that a PASS-reviewed Candidate has only title/body range failures.
 * @param jobId - Target length-repair Job owning the PASS Review.
 * @param attemptId - Active target Attempt.
 * @param reviewArtifactId - PASS Review bound to the exact source Candidate.
 * @returns Zero-model length-repair readiness and exact evidence identities.
 */
async preflightXhsLengthRepair( jobId: BusinessJobId, attemptId: BusinessAttemptId, reviewArtifactId: BusinessArtifactId, ): Promise<XhsSecondPassPreflight>

/** Verify length-repair eligibility without creating a Batch, Job, Attempt, or Artifact.
 * @param sourceJobId - Exact PASS-reviewed source Candidate Job.
 * @param sourceAttemptId - Exact source Attempt.
 * @param reviewArtifactId - Existing PASS Review Artifact bound to that Candidate.
 * @returns Read-only readiness and exact durable evidence identities.
 */
async preflightXhsLengthRepairSource( sourceJobId: BusinessJobId, sourceAttemptId: BusinessAttemptId, reviewArtifactId: BusinessArtifactId, ): Promise<XhsSecondPassPreflight>

/**
 * Freeze production truth, the reviewed candidate, and its Review into a revision package.
 * @param request - Active target Attempt, production identity, Review Artifact, lease, and compare-and-swap facts.
 * @returns the immutable revision execution package and source evidence.
 */
async createXhsRevisionExecutionPackage(request: CreateXhsRevisionExecutionPackageRequest): Promise<XhsProductionExecutionPackageResult>

/**
 * Freeze production truth for one source-only structural retry package.
 * @param request - Active target Attempt, failed source identity, retry reason, lease, and compare-and-swap facts.
 * @returns the immutable retry execution package and source evidence.
 */
async createXhsRetryExecutionPackage(request: CreateXhsRetryExecutionPackageRequest): Promise<XhsProductionExecutionPackageResult>

/**
 * Freeze only TaskCard, source Candidate, PASS Review, and hard-failure evidence for Contract Repair.
 * @param request - Active target Attempt, production identity, PASS Review, lease, and compare-and-swap facts.
 * @returns the immutable Skill-free Contract Repair package and source evidence.
 */
async createXhsContractRepairExecutionPackage( request: CreateXhsContractRepairExecutionPackageRequest, ): Promise<XhsProductionExecutionPackageResult>

/** Freeze only the TaskCard and exact PASS/length-failure evidence for one safe patch.
 * @param request - Active target Attempt, production identity, PASS Review, and lease facts.
 * @returns Immutable Skill-free length-repair package.
 */
async createXhsLengthRepairExecutionPackage( request: CreateXhsLengthRepairExecutionPackageRequest, ): Promise<XhsProductionExecutionPackageResult>

/**
 * Read one exact frozen input after lease, policy, and drift verification.
 * @param request - Current owner and exact package input path.
 * @returns verified input metadata and UTF-8 content.
 */
async readExecutionInput(request: ReadBusinessExecutionInputRequest): Promise<BusinessExecutionInputContent>

/**
 * Recompute all source hashes in one frozen execution package.
 * @param jobId - Owning Job.
 * @param attemptId - Attempt containing the package.
 * @returns package identity and verification counts.
 */
async verifyExecutionPackage(jobId: BusinessJobId, attemptId: BusinessAttemptId): Promise<BusinessExecutionPackageVerification>

/**
 * Execute one frozen package through a fresh tool-free Agent and commit its output.
 * @param request - exact Job, Attempt, package, owner, action, and retry identity.
 * @returns the durable Agent Run and its authoritative Artifact or output bundle.
 */
async runRestrictedAgent(request: RunRestrictedBusinessAgentRequest): Promise<RestrictedBusinessAgentResult>

/**
 * Return derived ownership without treating expired or foreign leases as live.
 * @param jobId - Job whose execution should be inspected.
 * @returns current derived execution status.
 */
getExecutionStatus(jobId: BusinessJobId): BusinessExecutionStatus

/**
 * Complete verified authoritative XHS outputs without model I/O; interrupt other abandoned executions.
 * @returns the number of recovered Jobs.
 */
recoverInterruptedExecutions(): Promise<number>

/** Complete only execution of the latest verified XHS intermediate bundle, never content approval or promotion.
 * Missing telemetry is durably marked incomplete. Repeated calls preserve the same receipt and Job revision.
 * @param jobId - Owning Job; failed, cancelled, superseded, or output-less Attempts are rejected.
 * @param attemptId - Latest Attempt with an authoritative bundle and its completed Agent Run.
 * @returns completed Job without model calls, source reads, or changes to output bytes.
 */
finalizeXhsOutputBundle(jobId: BusinessJobId, attemptId: BusinessAttemptId): Promise<BusinessJob>

/**
 * Finish the active owned Attempt and release its lease.
 * @param request - Current owner, terminal outcome, and observed revision.
 * @returns the terminal Job snapshot.
 */
completeAttempt(request: CompleteBusinessAttemptRequest): Promise<BusinessJob>

/**
 * Atomically publish a text Artifact for the active execution owner.
 * @param request - Current owner, Artifact metadata, bytes, and observed revision.
 * @returns the committed immutable Artifact reference.
 */
commitArtifact(request: CommitBusinessArtifactRequest): Promise<BusinessArtifact>

/**
 * Read and verify one Artifact by opaque id.
 * @param artifactId - Artifact to locate and verify.
 * @returns verified reference and UTF-8 body.
 */
async getArtifact(artifactId: BusinessArtifactId): Promise<BusinessArtifactContent>

/**
 * Verify every Artifact referenced by one Job.
 * @param jobId - Job whose references should be verified.
 * @returns verification facts in reference order.
 */
async verifyArtifacts(jobId: BusinessJobId): Promise<readonly BusinessArtifactVerification[]>

/**
 * Discover verified orphan Artifact files without changing them.
 * @returns referenced count and orphan summaries.
 */
reconcileArtifacts(): Promise<BusinessArtifactReconciliation>

/**
 * Read and structurally verify one authoritative XHS output bundle.
 * @param bundleId - opaque bundle identity.
 * @returns immutable manifest and its three verified files.
 */
getOutputBundle(bundleId: BusinessOutputBundleId): Promise<BusinessOutputBundleContent>

/**
 * Discover output-bundle staging or publication orphans without changing them.
 * @returns referenced count and orphan summaries.
 */
reconcileOutputBundles(): Promise<BusinessOutputBundleReconciliation>
```

Source: [`packages/business/business-workbench/src/index.ts`](../../packages/business/business-workbench/src/index.ts)
<!-- END GENERATED cordis-surface -->
