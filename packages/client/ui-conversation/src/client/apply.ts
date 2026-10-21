/** Registers the conversation components, shared store, and service callbacks. */
import type { Context } from '@deepseek-ai/cordis'
import { resolveSlotLabel, type BoundActions } from '@deepseek-ai/dsh-client-ui-slots'
import {
  resolveWorkspacePath, type ISessions, type SessionId,
} from '@deepseek-ai/dsh-client-runtime/client'
// Type-only: the ctx.settingsScope Context merge. Cross-plugin collaboration
// goes through the service, never a value import (client bundle purity gate).
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
// Type-only: imports the selected Host Remote namespace declarations.
import type {} from '@deepseek-ai/dsh-api-remotes/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type { ViewTab } from './contract/views.ts'
import type {
  ApprovalWait, ChatNodeTurnDataInjected, ChatScrollPosition, ChatViewInjected, ComposerBarInjected,
  ComposerChainProps, ConversationInjected, ConversationSessionHeaderInjected, ConversationSessionInjected,
  DetailsInjected,
} from './contract/slots.ts'
import type { InputNotice } from './input/contract.ts'
import { createChatStore } from './stores.ts'
import { ConversationController, UnsupportedImageMediaTypeError } from './service.ts'
import type { IConversation } from './service.ts'
import { scysRemoteStatusFailure } from './skeleton/scys-status-diagnostic.ts'
import { ComposerBlockRegistry } from './input/blocks.ts'
import type { ComposerBlock } from './input/blocks.ts'
import { InputHub } from './input/hub.ts'
import { ComposerSubmissionPolicy } from './input/submission-policy.ts'
import { InputBar } from './skeleton/InputBar.tsx'
import { EnterBehaviorRow } from './settings/EnterBehaviorRow.tsx'
import type { EnterBehaviorRowInjected } from './settings/EnterBehaviorRow.tsx'
import { ChatView } from './chat/ChatView.tsx'
import { StatsLine } from './chat/StatsLine.tsx'
import { ApprovalPanel } from './skeleton/ApprovalPanel.tsx'
import { todoDockEntry } from './skeleton/TodoPanel.tsx'
import { queueDockEntry } from './queue/QueueDock.tsx'
import { ConversationRoot } from './skeleton/ConversationRoot.tsx'
import { publishXhsRealContext } from './skeleton/xhs-real-context-store.ts'
import { ConversationSession, ConversationSessionHeader } from './skeleton/ConversationSession.tsx'
import { DetailsPanel } from './skeleton/DetailsPanel.tsx'
import { en, NS, zh, type ConversationKey } from './locales.ts'
import { registerConversationNodes } from './conversation-nodes/register.ts'
import { registerChatNodeRenderers } from './chat/register-node-renderers.ts'
import { CONVERSATION_SETTINGS_NAMESPACE, type ConversationSettings } from '../submission-settings.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The conversation skeleton, chat flow, commands, details, and docks copy. */
    conversation: ConversationKey
  }
}

/** Services required by the conversation plugin. */
export const inject = [
  'slots', 'layout', 'sessions', 'workspaces', 'locale', 'connection', 'remote', 'remote.businessWorkbench', 'settingsScope',
  'conversationEvents', 'conversationViews',
]

// Static no-session sources for the composer-bar hooks compartment: module
// constants so the render side's per-source hook cache (observableHook) keeps
// one identity across every no-session render.
const ABSENT_NOTICES = {
  getSnapshot: (): InputNotice | null => null,
  subscribe: () => () => {},
}
/** No session, therefore nothing to block; same one-identity rule as above. */
const ABSENT_BLOCK = {
  getSnapshot: (): ComposerBlock | undefined => undefined,
  subscribe: () => () => {},
}
const EMPTY_LEXICON: ReadonlyMap<'/' | '@', readonly string[]> = new Map()
const ABSENT_LEXICON = {
  getSnapshot: () => EMPTY_LEXICON,
  subscribe: () => () => {},
}
const ABSENT_MENU_LAUNCHER = {
  getSnapshot: (): string | null => null,
  subscribe: () => () => {},
}

const CHAT_NODE_INJECT: ChatNodeTurnDataInjected = {
  hooks: {
    turnData: ({ useSession }, nodeKey) => function useTurnData(key) {
      return useSession((snapshot) => {
        const location = snapshot.chat.nodes.get(nodeKey)?.location
        return location?.kind === 'turn' || location?.kind === 'step'
          ? location.turn.data.get(key)
          : undefined
      })
    },
  },
}

/** Resolve the session-scoped conversation face (scope-addressed send/cancel), failing loud. */
function scopedConversation(sessions: ISessions, id: SessionId): IConversation {
  const scoped = sessions.scope(id)
  if (scoped === undefined) throw new Error(`ui-conversation: session "${id}" resolved no scope`)
  const conversation = scoped.get('conversation')
  if (conversation === undefined) throw new Error('ui-conversation: conversation service unavailable through the session scope')
  return conversation
}

/** Resolve package-internal attachment operations from the public service registration. */
function concreteConversation(ctx: Context): ConversationController {
  const conversation = ctx.get('conversation') as ConversationController | undefined
  if (conversation === undefined) throw new Error('ui-conversation: conversation service unavailable')
  return conversation
}

/** Chain routing: claim the composer while an approval wait is pending (pure — owner props only). */
function selectApproval({ interactions }: ComposerChainProps): ApprovalWait | null {
  return interactions.find((i): i is ApprovalWait => i.kind === 'approval') ?? null
}

/** Mounts the conversation plugin.
 * @param ctx - Client root context.
 */
export function apply(ctx: Context): void {
  void ctx.remote.businessWorkbench.readXhsSwissContext().then(
    (result) => {
      publishXhsRealContext(result.ok ? { status: 'ready', context: result.value } : { status: 'unavailable' })
    },
    () => { publishXhsRealContext({ status: 'unavailable' }) },
  )
  const sessions = ctx.sessions
  const workspaces = ctx.workspaces
  const layout = ctx.layout
  const slots = ctx.slots

  registerConversationNodes(ctx)
  registerChatNodeRenderers(ctx)

  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-conversation: dictionaries')

  // Registration-time text (the view tab label) reads through the bound
  // translate as a thunk, so it follows the active locale without
  // re-registration; components read the standard `t` seat instead.
  const t = ctx.locale.bind(NS)

  // Apply-time construction keeps store identity bound to this fiber.
  const chatStore = createChatStore()
  const submissionPolicy = new ComposerSubmissionPolicy(
    ctx.settingsScope.bind<ConversationSettings>({ namespace: CONVERSATION_SETTINGS_NAMESPACE }),
  )

  ctx.slots.inject('settings.general.item', () => ctx.slots.register({
    name: 'settings.general.item',
    id: 'composer-enter',
    order: 20,
    locale: NS,
    inject: (): EnterBehaviorRowInjected => ({
      hooks: { busyEnter: submissionPolicy.busyEnter },
      setBusyEnter: (behavior) => { submissionPolicy.setBusyEnter(behavior) },
    }),
  }, EnterBehaviorRow))

  // Chat semantic reader positions by session, surviving view switches and
  // width reflow when the tab ring remounts the view. Deliberately not
  // persisted: a fresh page load keeps the open-jump-to-bottom default.
  const chatScrollPositions = new Map<SessionId, ChatScrollPosition>()

  const viewTabs = (): ViewTab[] => {
    const tabs: ViewTab[] = []
    for (const entry of slots.entries('conversation.view')) {
      /* v8 ignore next -- unreachable: list registration validates id at load. */
      if (entry.options.id === undefined) continue
      tabs.push({ id: entry.options.id, label: resolveSlotLabel(entry.options.label) ?? entry.options.id })
    }
    return tabs
  }
  const views = {
    list: viewTabs,
    subscribe: (fn: () => void) => slots.subscribe('conversation.view', fn),
    version: () => slots.getVersion('conversation.view'),
  }

  const localAIHOT = {
    list: async (request: import('@deepseek-ai/dsh-business-workbench/types').LocalAIHOTIntelligenceRequest) => {
      const result = await ctx.remote.businessWorkbench.listLocalAIHOTIntelligence(request)
      return result.ok ? result.value : { status: 'unavailable' as const }
    },
    detail: async (articleId: string) => {
      const result = await ctx.remote.businessWorkbench.readLocalAIHOTIntelligenceDetail(articleId)
      return result.ok ? result.value : { status: 'unavailable' as const }
    },
    reviews: async (articleIds: readonly string[]) => {
      const result = await ctx.remote.businessWorkbench.listLocalAIHOTReviews(articleIds)
      return result.ok ? result.value : { status: 'unavailable' as const }
    },
    review: async (articleId: string) => {
      const result = await ctx.remote.businessWorkbench.readLocalAIHOTReview(articleId)
      return result.ok ? result.value : { status: 'unavailable' as const }
    },
    writeReview: async (request: import('@deepseek-ai/dsh-business-workbench/types').LocalAIHOTReviewWriteRequest) => {
      const result = await ctx.remote.businessWorkbench.writeLocalAIHOTReview(request)
      return result.ok ? result.value : { status: 'unavailable' as const }
    },
    processPending: async (request: import('@deepseek-ai/dsh-business-workbench/types').LocalAIHOTPendingRunRequest) => {
      const result = await ctx.remote.businessWorkbench.processLocalAIHOTPending(request)
      return result.ok ? result.value : { status: 'unavailable' as const }
    },
    pendingRun: async (runId: string) => {
      const result = await ctx.remote.businessWorkbench.readLocalAIHOTPendingRun(runId)
      return result.ok ? result.value : { status: 'unavailable' as const }
    },
    pendingRuns: async () => {
      const result = await ctx.remote.businessWorkbench.listLocalAIHOTPendingRuns()
      return result.ok ? result.value : { status: 'unavailable' as const }
    },
  }

  const xhsRadar = {
    getSourceStatus: async () => {
      const result = await ctx.remote.businessWorkbench.getXhsSourceStatus()
      return result.ok ? result.value : { status: 'source_offline' as const }
    },
    search: async (request: { readonly keyword: string; readonly sortBy?: import('@deepseek-ai/dsh-business-workbench/types').XhsSearchSort }) => {
      const startedAt = performance.now()
      try {
        const result = await ctx.remote.businessWorkbench.searchXhsFeeds(request)
        if (result.ok) return result.value
        const mappingFailure = result.error.code === 'result-invalid'
        return {
          status: mappingFailure ? 'search_error' as const : 'source_offline' as const,
          diagnostic: {
            errorCode: mappingFailure ? 'RESULT_MAPPING_ERROR' as const : 'REMOTE_TRANSPORT_ERROR' as const,
            failureStage: mappingFailure ? 'result_mapping' as const : 'remote_transport' as const,
            durationMs: Math.round(performance.now() - startedAt),
            httpStatus: null,
          },
        }
      } catch {
        return {
          status: 'source_offline' as const,
          diagnostic: {
            errorCode: 'REMOTE_TRANSPORT_ERROR' as const,
            failureStage: 'remote_transport' as const,
            durationMs: Math.round(performance.now() - startedAt),
            httpStatus: null,
          },
        }
      }
    },
    detail: async (request: { readonly id: string; readonly xsecToken: string; readonly loadComments?: boolean }) => {
      const result = await ctx.remote.businessWorkbench.getXhsFeedDetail(request)
      return result.ok ? result.value : { status: 'detail_error' as const }
    },
    getCoverAsset: async (request: { readonly assetId: string }) => {
      const result = await ctx.remote.businessWorkbench.getXhsCoverAsset(request)
      return result.ok ? result.value : { status: 'error' as const }
    },
    analyzeComments: async (request: import('@deepseek-ai/dsh-business-workbench/types').XhsCommentAnalysisRequest) => {
      const result = await ctx.remote.businessWorkbench.analyzeXhsComments(request)
      return result.ok ? result.value : {
        status: 'error' as const,
        errorCode: 'UNKNOWN_ANALYSIS_ERROR' as const,
        providerId: null,
        modelId: null,
        llmStreamCalled: false,
        providerRequestSent: 'not_started' as const,
        providerResponseReceived: false,
        failureStage: 'remote_transport' as const,
        durationMs: 0,
        streamEventCount: 0,
        responseCharacterCount: 0,
      }
    },
  }

  const scysRadar = {
    getSourceStatus: async () => {
      try {
        const result = await ctx.remote.businessWorkbench.getScysSourceStatus()
        return result.ok ? result.value : scysRemoteStatusFailure(result.error.code)
      } catch {
        return scysRemoteStatusFailure('transport')
      }
    },
    connect: async () => {
      const result = await ctx.remote.businessWorkbench.connectScys()
      return result.ok ? result.value : { status: 'error' as const }
    },
    searchContent: async (keyword: string) => {
      const result = await ctx.remote.businessWorkbench.searchScysContent(keyword)
      return result.ok ? result.value : { status: 'SCYS_MCP_UNAVAILABLE' as const }
    },
    contentDetail: async (identity: import('@deepseek-ai/dsh-business-workbench/types').ScysTopicIdentity) => {
      const result = await ctx.remote.businessWorkbench.getScysContentDetail(identity)
      return result.ok ? result.value : { status: 'SCYS_MCP_UNAVAILABLE' as const }
    },
    searchProjects: async (keyword: string) => {
      const result = await ctx.remote.businessWorkbench.searchScysProjects(keyword)
      return result.ok ? result.value : { status: 'SCYS_MCP_UNAVAILABLE' as const }
    },
    projectDetail: async (id: string) => {
      const result = await ctx.remote.businessWorkbench.getScysProjectDetail(id)
      return result.ok ? result.value : { status: 'SCYS_MCP_UNAVAILABLE' as const }
    },
    loadComments: async (identity: import('@deepseek-ai/dsh-business-workbench/types').ScysTopicIdentity) => {
      const result = await ctx.remote.businessWorkbench.loadScysComments(identity)
      return result.ok ? result.value : { status: 'SCYS_MCP_UNAVAILABLE' as const }
    },
  }

  const mediaStudio = {
    models: async (modality: import('@deepseek-ai/dsh-business-workbench/types').MediaStudioModality) => {
      const result = await ctx.remote.businessWorkbench.listMediaStudioModels(modality)
      if (!result.ok) throw new Error('Media Studio model list is unavailable')
      return result.value
    },
    sessions: async (modality: import('@deepseek-ai/dsh-business-workbench/types').MediaStudioModality) => {
      const result = await ctx.remote.businessWorkbench.listMediaStudioSessions(modality)
      if (!result.ok) throw new Error('Media Studio session list is unavailable')
      return result.value
    },
    read: async (sessionId: string) => {
      const result = await ctx.remote.businessWorkbench.readMediaStudioSession(sessionId)
      if (!result.ok) throw new Error('Media Studio session is unavailable')
      return result.value
    },
    create: async (request: import('@deepseek-ai/dsh-business-workbench/types').CreateCreativeTurnRequest) => {
      const result = await ctx.remote.businessWorkbench.createMediaStudioTurn(request)
      if (!result.ok) throw new Error('Media Studio Mock task could not be saved')
      return result.value
    },
    poll: async (taskId: string) => {
      const result = await ctx.remote.businessWorkbench.pollMediaStudioTask(taskId)
      if (!result.ok) throw new Error('Media Studio task state is unavailable')
      return result.value
    },
    cancel: async (taskId: string) => {
      const result = await ctx.remote.businessWorkbench.cancelMediaStudioTask(taskId)
      if (!result.ok) throw new Error('Media Studio task could not be cancelled')
      return result.value
    },
  }

  const videoPackaging = {
    aiModels: async () => {
      const result = await ctx.remote.businessWorkbench.listVideoPackagingAiModels()
      if (!result.ok) throw new Error('Harness 语言模型目录不可用')
      return result.value
    },
    runPlan: async (request: import('@deepseek-ai/dsh-business-workbench/types').RunVideoPackagingPlanRequest) => {
      const result = await ctx.remote.businessWorkbench.requestVideoPackagingAiPlan(request)
      if (!result.ok) throw new Error(`AI 包装方案请求被拒绝（${result.error.code}）：${result.error.message}`)
      return result.value
    },
    upload: async (file: File, mediaType: 'video/mp4' | 'image/png') => {
      const bytes = new Uint8Array(await file.arrayBuffer())
      const digest = await crypto.subtle.digest('SHA-256', bytes)
      const sha256 = [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join('')
      const begun = await ctx.remote.businessWorkbench.beginVideoPackagingUpload({ name: file.name, mediaType, bytes: bytes.byteLength, sha256 })
      if (!begun.ok) throw new Error(`MP4/PNG 导入未开始：Host 视频包装服务不可用（${begun.error.code}）。原文件未修改；请检查连接或服务配置后重新选择文件。`)
      try {
        for (let offset = 0; offset < bytes.byteLength; offset += begun.value.chunkBytes) {
          const chunk = bytes.subarray(offset, Math.min(bytes.byteLength, offset + begun.value.chunkBytes))
          let binary = ''
          for (let index = 0; index < chunk.length; index += 0x8000) binary += String.fromCharCode(...chunk.subarray(index, Math.min(index + 0x8000, chunk.length)))
          const appended = await ctx.remote.businessWorkbench.appendVideoPackagingUploadChunk({ uploadId: begun.value.uploadId, offset, data: btoa(binary) })
          if (!appended.ok) throw new Error(`Host 媒体分块上传失败（${appended.error.code}）`)
        }
        const finished = await ctx.remote.businessWorkbench.finishVideoPackagingUpload(begun.value.uploadId)
        if (!finished.ok) throw new Error(`Host 媒体校验失败（${finished.error.code}）`)
        return finished.value
      } catch (error) {
        await ctx.remote.businessWorkbench.abortVideoPackagingUpload(begun.value.uploadId)
        throw error
      }
    },
    asset: async (assetId: string) => {
      const result = await ctx.remote.businessWorkbench.readVideoPackagingAsset(assetId)
      if (!result.ok) throw new Error('Host 素材信息不可用')
      return result.value
    },
    assetChunk: async (assetId: string, offset: number, maxBytes: number) => {
      const result = await ctx.remote.businessWorkbench.readVideoPackagingAssetChunk({ assetId, offset, maxBytes })
      if (!result.ok) throw new Error('Host 素材分块不可用')
      return result.value
    },
    createProject: async (name: string, sourceVideoAssetId: string) => {
      const result = await ctx.remote.businessWorkbench.createVideoPackagingProject({ name, sourceVideoAssetId })
      if (!result.ok) throw new Error('Host 包装工程创建失败')
      return result.value
    },
    project: async (projectId: string) => {
      const result = await ctx.remote.businessWorkbench.readVideoPackagingProject(projectId)
      if (!result.ok) throw new Error('Host 包装工程读取失败')
      return result.value
    },
    projectAssets: async (projectId: string) => {
      const result = await ctx.remote.businessWorkbench.listVideoPackagingProjectAssets(projectId)
      if (!result.ok) throw new Error('Host 工程素材列表不可用')
      return result.value
    },
    saveProject: async (projectId: string, expectedRevision: number, document: import('@deepseek-ai/dsh-session/types').JsonValue) => {
      const result = await ctx.remote.businessWorkbench.saveVideoPackagingProject({ projectId, expectedRevision, document })
      if (!result.ok) throw new Error(`工程未保存（${result.error.code}）。修改仍在当前页面；请检查组件范围与 Host 连接后重试，成功前不要刷新。`)
      return result.value
    },
    submitRender: async (projectId: string) => {
      const result = await ctx.remote.businessWorkbench.submitVideoPackagingRender(projectId)
      if (!result.ok) throw new Error('Host 渲染任务提交失败')
      return result.value
    },
    render: async (renderTaskId: string) => {
      const result = await ctx.remote.businessWorkbench.readVideoPackagingRender(renderTaskId)
      if (!result.ok) throw new Error('Host 渲染任务状态不可用')
      return result.value
    },
    cancelRender: async (renderTaskId: string) => {
      const result = await ctx.remote.businessWorkbench.cancelVideoPackagingRender(renderTaskId)
      if (!result.ok) throw new Error('Host 渲染任务无法取消')
      return result.value
    },
  }

  // The per-session input machine registry (SessionInputResolver face; published as
  // ctx.conversation.input by the service below sharing this one instance).
  const inputHub = new InputHub(ctx, t)

  // The composer-block registry: a plugin that knows a session cannot send —
  // ui-model-selection, when no adapter serves the session's route — raises a block
  // here, and the bar reads its own session's store. It cannot flow the other
  // way: this package must not import the plugins that would know.
  const composerBlocks = new ComposerBlockRegistry()

  // The input machine feeds every session-scope slot
  // component through the standard provide channel — the 'input' hook plus
  // the two public actions. Materialization is the shell creation trigger
  // (per-session lazy; scope disposer tears down).
  ctx.effect(() => sessions.provide({
    hooks: ['input'],
    props: ['inputActions'],
    resolve: (binding) => {
      const shell = inputHub.shellFor(binding)
      return {
        hooks: { input: shell.state },
        props: { inputActions: shell.actions },
      }
    },
  }), 'ui-conversation: input standard-kit provider')

  // Resident current-session-optional shell. It owns the stable Hero/composer
  // frame while strict session slots fill only their session-bound regions.
  slots.register({
    name: 'conversation',
    locale: NS,
    children: {
      'conversation.session': { kind: 'single', scope: 'session' },
      'conversation.session.header': { kind: 'single', scope: 'session' },
      'conversation.composer': { kind: 'chain', scope: 'session' },
      'conversation.composer.bar': { kind: 'single', scope: 'session-maybe' },
      'conversation.input.overlay': { kind: 'list', scope: 'session' },
      'conversation.input.dock': { kind: 'list', scope: 'session' },
      'conversation.composer.dock': { kind: 'list', scope: 'session' },
      'conversation.input.left': { kind: 'list', scope: 'session' },
      'conversation.input.right': { kind: 'list', scope: 'session' },
      'conversation.hero.brand.mark': { kind: 'single', scope: 'root' },
      'conversation.hero.workspace': { kind: 'single', scope: 'root' },
      'conversation.hero.agentPreset': { kind: 'single', scope: 'root' },
      'conversation.command.workspaceBrowser': { kind: 'single', scope: 'root' },
    },
    inject: (sessionId: SessionId | undefined): ConversationInjected => ({
      hooks: { composerBlock: sessionId === undefined ? ABSENT_BLOCK : composerBlocks.storeFor(sessionId) },
      localAIHOT,
      xhsRadar,
      scysRadar,
      mediaStudio,
      videoPackaging,
      selectWorkspace: async (workspaceId) => {
        const nextId = await workspaces.connectWorkspace(workspaceId)
        if (sessionId !== undefined && nextId !== sessionId) {
          const from = inputHub.shell(sessionId)
          const draft = from.snapshot.draft
          const imageIds = from.snapshot.imageIds
          const next = inputHub.shell(nextId)
          if (imageIds.length === 0 || next.addImages(imageIds)) {
            if (draft !== '') {
              next.setDraft(draft)
              from.setDraft('')
            }
            if (imageIds.length > 0) {
              for (const id of imageIds) from.removeImage(id)
            }
          }
        }
        sessions.open(nextId)
      },
    }),
  }, ConversationRoot)

  // The strict session body fills the resident scrollport without owning it;
  // the Hero/composer path therefore stays fixed while the first blank
  // session appears after a Workspace pick.
  slots.register({
    name: 'conversation.session',
    children: {
      'conversation.view': { kind: 'list', scope: 'session' },
    },
    store: chatStore,
    inject: (sessionId: SessionId, _actions: BoundActions<typeof chatStore>): ConversationSessionInjected => {
      const conversation = concreteConversation(ctx)
      return {
        views,
        releaseSessionImages: (id) => { conversation.releaseSessionImages(id) },
        bindDraftMirror: write => inputHub.shell(sessionId).bindMirror(write),
      }
    },
  }, ConversationSession)

  // Header chrome sits above the resident scrollport but shares the same
  // per-session chat store (active view) as its body and view entries.
  slots.register({
    name: 'conversation.session.header',
    locale: NS,
    children: {
      'conversation.session.header.lineage': { kind: 'single', scope: 'session' },
      'conversation.session.header.actions': { kind: 'list', scope: 'session' },
      'conversation.session.header.utilities': { kind: 'list', scope: 'session' },
    },
    store: chatStore,
    inject: (): ConversationSessionHeaderInjected => ({
      views,
      open: (id) => { sessions.open(id) },
    }),
  }, ConversationSessionHeader)

  // The default composer body: its own single slot inside the composer
  // chain's fallback. Public machine surface arrives via the
  // provide channel above; the keyboard command face and the stop/retry
  // verbs ride this inject (package-internal — hub and bar are one plugin).
  // Session-maybe: with no current session the machine faces are absent and
  // the hooks compartment binds static empty sources (module constants, so
  // observableHook caching and hook order stay stable across transitions).
  slots.register({
    name: 'conversation.composer.bar',
    locale: NS,
    // The two named control seats in the bar's tool row (plan beside the
    // access control, model right); empty until their owning plugins
    // register.
    children: {
      'conversation.input.attachments': { kind: 'single', scope: 'session-maybe' },
      'conversation.input.plan': { kind: 'single', scope: 'session' },
      'conversation.input.model': { kind: 'single', scope: 'session' },
    },
    inject: (sessionId: SessionId | undefined): ComposerBarInjected => {
      if (sessionId === undefined) {
        return {
          keyboard: undefined,
          addImages: undefined,
          removeImage: undefined,
          draftImages: undefined,
          resolveSubmitMode: (running, gesture, steeringAvailable) =>
            submissionPolicy.resolve(running, gesture, steeringAvailable),
          toggleCommandMenu: undefined,
          stop: undefined,
          command: undefined,
          hooks: { notices: ABSENT_NOTICES, lexicon: ABSENT_LEXICON, menuLauncher: ABSENT_MENU_LAUNCHER },
        }
      }
      const conversation = concreteConversation(ctx)
      const shell = inputHub.shell(sessionId)
      const inputTriggers = inputHub.inputTriggers(sessionId)
      return {
        keyboard: shell,
        addImages: (files) => {
          try {
            const images = conversation.createDraftImages(files)
            if (!shell.addImages(images.map(image => image.id))) {
              conversation.releaseDraftImages(images)
            }
            return null
          } catch (error: unknown) {
            if (error instanceof UnsupportedImageMediaTypeError) {
              // Positive copy: the supported list is fixed in imageMediaType,
              // and naming it beats echoing the rejected MIME type back.
              return t('image.unsupportedType')
            }
            return error instanceof Error ? error.message : String(error)
          }
        },
        removeImage: (id) => {
          conversation.releaseDraftImage(id)
          shell.removeImage(id)
        },
        draftImages: ids => conversation.draftImages(ids),
        resolveSubmitMode: (running, gesture, steeringAvailable) =>
          submissionPolicy.resolve(running, gesture, steeringAvailable),
        toggleCommandMenu: inputTriggers === undefined
          ? undefined
          : (selection) => {
            shell.dismissPopup()
            const snapshot = shell.snapshot
            inputTriggers.toggleSource('command', {
              trigger: '/',
              query: '',
              quoted: false,
              position: snapshot.draft.slice(0, selection.start).trim() === '' ? 'leading' : 'inline',
              span: { ...selection, draftRev: snapshot.draftRev },
            })
          },
        stop: () => {
          scopedConversation(sessions, sessionId).cancel().catch(() => {
            // Stop failure surfaces via snapshot.promptError; nothing to restore.
          })
        },
        command: async (line) => {
          const session = sessions.binding(sessionId)?.session
          if (session === undefined) return false
          const result = await session.command(line)
          return result.ok && result.value.matched
        },
        hooks: {
          notices: shell.notices,
          lexicon: shell.lexicon,
          menuLauncher: inputTriggers?.launcher ?? ABSENT_MENU_LAUNCHER,
        },
      }
    },
  }, InputBar)

  // The approval takeover: a selector-routed entry of the chain this package
  // just declared (the ui-user-questions registration pattern; the entry lives here
  // because approval answering is core conversation UX, not an optional tool).
  // Zero business face — data and verbs both ride the matched carrier.
  // priority 1: question takeovers (default 0) win when both kinds are
  // pending — a question is a conversation the model is waiting on, while an
  // approval only blocks one tool call; answering the question first cannot
  // strand the approval (it re-elects the moment the question resolves).
  slots.register({ name: 'conversation.composer', select: selectApproval, priority: 1, locale: NS }, ApprovalPanel)

  // The chat view: first entry of the ring this package just declared.
  // ChatView owns only the stable ordered Node list. Business renderers are
  // independently keyed behind its one Node seat.
  slots.register({
    name: 'conversation.view',
    id: 'chat',
    order: 0,
    label: () => t('view.chat'),
    locale: NS,
    children: {
      'conversation.chat.node': { kind: 'keyed', scope: 'session', inject: CHAT_NODE_INJECT },
      'conversation.message.images': { kind: 'single', scope: 'session' },
    },
    store: chatStore,
    inject: (sessionId: SessionId, actions: BoundActions<typeof chatStore>): ChatViewInjected => {
      const conversation = concreteConversation(ctx)
      const scoped = scopedConversation(sessions, sessionId)
      return {
        openDetails: (target) => {
          actions.select(target)
          layout.openDetails()
        },
        fileMentions: owner => ctx.get('chatFileMentions')?.forClosing(owner),
        openFile: (path) => {
          const cwd = sessions.list.getSnapshot().byId[sessionId]?.cwd
          return workspaces.openPath(resolveWorkspacePath(cwd, path))
        },
        loadOlder: () => { void scoped.loadOlder() },
        loadImage: attachment => conversation.resolveImage(sessionId, attachment),
        // Unregistered 'trajectory' id is safe: the tab ring falls back to
        // the first view, and the untouched inspect target stays inert.
        inspectCall: (callId) => {
          actions.setInspect({ callId })
          actions.setView('trajectory')
        },
        chatScroll: {
          save: (position) => {
            if (position === null) chatScrollPositions.delete(sessionId)
            else chatScrollPositions.set(sessionId, position)
          },
          read: () => chatScrollPositions.get(sessionId) ?? null,
        },
        forkAt: (seq) => {
          sessions.fork({ sessionId, atSeq: seq, increaseTitle: true })
            .then((childId) => { sessions.open(childId) })
            .catch(() => {
              // Fork or child-rename failure keeps the source view untouched.
            })
        },
      }
    },
  }, ChatView)

  // Session stats stick with the composer (composer.dock = stats-line family).
  slots.register({ name: 'conversation.composer.dock', id: 'stats', order: 0, locale: NS }, StatsLine)

  // Class-plugin mount (packages/AGENTS.md service form): the service
  // registers itself as `conversation` and lives on its own child fiber.
  // Presentation registrants depend directly on their slot declarations;
  // this service remains only where conversation actions are required.
  ctx.plugin(ConversationController, { input: inputHub, blocks: composerBlocks })

  // The plan strip rides the input dock above the queue rows (same posture).
  ctx.plugin(todoDockEntry)

  // The read-only queue dock entry rides the same
  // registration path into the input dock declared above.
  ctx.plugin(queueDockEntry)

  slots.register({
    name: 'details',
    locale: NS,
    children: {
      'conversation.details.tool': { kind: 'single', scope: 'session' },
    },
    store: chatStore,
    inject: (): DetailsInjected => ({
      closeDetails: () => { layout.closeDetails() },
    }),
  }, DetailsPanel)

}
