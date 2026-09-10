/** Expose a visible completion review and continue the parent when it finds unfinished work.
 *
 * The reviewer is a fresh one-shot subagent launched by a model-visible tool.
 * It receives a compact task brief built from the parent's session events.
 *
 * @module @deepseek-ai/dsh-completion-checker
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import type { ContentBlock, MessageSource } from '@deepseek-ai/dsh-llm'
import type { SessionEvent, TurnEndReason } from '@deepseek-ai/dsh-session'
import type { SubagentResult, SubagentRun } from '@deepseek-ai/dsh-subagent'
import { installSettingsSection, settingsNamespace } from '@deepseek-ai/dsh-settings'
import type { SettingsScope } from '@deepseek-ai/dsh-settings'
import type {} from '@ddonofrio/littlewhale'
import type {} from '@deepseek-ai/dsh-commands'

/** User-selectable completion-review settings. */
export interface CompletionCheckerSettings {
  /** Whether a completed turn receives a completion review. */
  enabled: boolean
  /** Provider and model used for the independent master review. */
  masterProvider?: string
  masterModel?: string
}

/** Plugin configuration. */
export interface Config {
  /** Whether reviews are enabled by default. */
  enabled?: boolean
  /** Registry name of the one-shot subagent provider used for reviews. */
  provider?: string
  /** Registry name of the provider used for the master review. */
  masterProvider?: string
  /** Model identifier used for the master review. */
  masterModel?: string
  /** Number of retries after a transient master-provider failure. */
  maxRetries?: number
  /** Initial retry delay; each subsequent retry doubles it. */
  retryDelayMs?: number
}

/** Settings namespace exposed on the General settings surface. */
export const COMPLETION_CHECKER_SETTINGS_NAMESPACE = settingsNamespace('completion-checker')

/** The shipped default for the General setting. */
export const DEFAULT_COMPLETION_CHECKER_ENABLED = true

/** The default provider, which starts with only the generated task brief. */
export const DEFAULT_COMPLETION_CHECKER_PROVIDER = 'spawn'

/** Schema for the plugin's composition configuration. */
export const Config: z<Config> = z.object({
  enabled: z.boolean().default(DEFAULT_COMPLETION_CHECKER_ENABLED),
  provider: z.string().default(DEFAULT_COMPLETION_CHECKER_PROVIDER),
  masterProvider: z.string().required(false),
  masterModel: z.string().required(false),
  maxRetries: z.number().step(1).min(0).max(10).default(3),
  retryDelayMs: z.number().step(1).min(0).max(60_000).default(5_000),
})

/** Schema for the user-owned settings section. */
export const COMPLETION_CHECKER_SETTINGS_SCHEMA: z<CompletionCheckerSettings> = z.object({
  enabled: z.boolean().default(DEFAULT_COMPLETION_CHECKER_ENABLED),
  masterProvider: z.string().required(false),
  masterModel: z.string().required(false),
})

/** Source stamped on review messages sent back to the parent agent. */
const PLUGIN_SOURCE: Extract<MessageSource, { kind: 'plugin' }> = { kind: 'plugin', plugin: 'completion-checker' }

/** Load once review execution, commands, and the selected master settings are available. */
export const inject = ['subagents', 'commands', 'settings']

type CompletionReview = { status: 'OK' | 'KO'; instruction: string }

const REVIEW_ACTION_MAX_CHARS = 600

type TurnStoppingPayload = {
  agent: Agent
  turn: number
  reason: TurnEndReason
  stepReason: TurnEndReason
  signal: AbortSignal
}

function clipReviewText(text: string, maxChars: number): string {
  return text.length <= maxChars ? text : `${text.slice(0, maxChars)}… [truncated]`
}

function textContent(blocks: readonly ContentBlock[]): string {
  return blocks
    .filter((block): block is Extract<ContentBlock, { type: 'text' }> => block.type === 'text')
    .map(block => block.text)
    .join('\n')
    .trim()
}

function appendNotice(agent: Agent, text: string, summary: string): void {
  agent.session.append('user/message', createUserMessage({
    content: [{ type: 'text', text }],
    source: { ...PLUGIN_SOURCE, form: 'notice', summary },
  }), { surfaceOp: 'append' })
}

function isTransientReviewError(error: unknown): boolean {
  const message = String(error)
  return /\b429\b|rate.?limit|temporar(?:y|ily)|\b(?:500|502|503|504)\b|timeout|timed out|ECONNRESET|ETIMEDOUT/i.test(message)
}

async function waitForRetry(delayMs: number, signal: AbortSignal): Promise<void> {
  const abortReason = () => signal.reason instanceof Error ? signal.reason : new Error('Master review retry cancelled')
  if (signal.aborted) throw abortReason()
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort)
      resolve()
    }, delayMs)
    const onAbort = () => {
      clearTimeout(timer)
      reject(abortReason())
    }
    signal.addEventListener('abort', onAbort, { once: true })
  })
}

function currentTurnEvents(agent: Agent, turn: number): SessionEvent[] {
  const start = agent.session.events.findLastIndex(event => event.type === 'turn/start' && event.data.turn === turn)
  return agent.session.events.slice(start < 0 ? 0 : start)
}

/** Project the session in the same clean transcript format used by Auto Goal and Auto TODOs. */
function cleanConversation(agent: Agent): string {
  const entries: string[] = []
  for (const event of agent.session.events) {
    switch (event.type) {
      case 'user/message': {
        if (event.data.source.kind !== 'user') break
        const text = textContent(event.data.content)
        if (text !== '') entries.push(`User:\n${text}`)
        break
      }
      case 'assistant/message': {
        const text = textContent(event.data.message.content)
        if (text !== '') entries.push(`Agent:\n${text}`)
        break
      }
      case 'tool/call':
        if (event.data.name !== 'completion_check') entries.push(`Agent used ${event.data.name}`)
        break
      case 'tool/result':
        if (event.data.error !== undefined) {
          entries.push(`Tool result: failed — ${clipReviewText(JSON.stringify(event.data.error), REVIEW_ACTION_MAX_CHARS)}`)
        }
        break
      case 'todo/write':
        entries.push(`Agent todos:\n${JSON.stringify(event.data.todos)}`)
        break
      default:
        break
    }
  }
  return entries.length === 0 ? '[No user-visible conversation was recorded.]' : entries.join('\n\n')
}

function isLoopRecoveryTurn(events: readonly SessionEvent[]): boolean {
  return events.some(event => event.type === 'user/message'
    && event.data.source.kind === 'plugin'
    && event.data.source.plugin === 'agent-loop'
    && event.data.source.form === 'notice'
    && event.data.source.summary === 'compacting after repeated loop')
}

/** Identify nested agents, which do not run the top-level completion policy. */
function isNestedAgent(agent: Agent): boolean {
  return agent.session.header.parentSession !== undefined
}

/** Prompt a fresh reviewer with the complete clean conversation transcript. */
function reviewPrompt(agent: Agent): string {
  const projectDirectory = agent.session.header.cwd ?? '[the current project directory]'
  return [
    'You are the master model reviewing a student model after it finished a task.',
    'You receive the same clean conversation transcript supplied to the Auto Goal and Auto TODO planners.',
    'It contains the complete user-visible chat, tool activity, tool failures, and TODO state recorded in the parent session.',
    'Review both the answer and the generated or modified files when present.',
    `The project directory is: ${projectDirectory}`,
    'Treat that directory as the only project root. Inspect files and run verification only inside this directory unless the user explicitly requested an external path.',
    'Do not follow references, imports, links, or similarly named directories outside the project root. If evidence is unavailable inside the project root, report that limitation instead of searching elsewhere.',
    'The parent agent is the implementer. You are only a reviewer: do not edit, create, delete, rename, or format files, and do not run commands that modify state.',
    'Also enforce the project coding preferences: keep changes simple, explicit, maintainable, minimal, and focused; preserve existing architecture; reuse existing patterns; avoid speculative work and duplication; inspect existing patterns, tests, configuration, and repository instructions before judging the change; follow the existing style and naming; keep responsibilities focused; handle errors explicitly; preserve compatibility; and do not leave dead code, temporary hacks, debug output, or commented-out implementations.',
    'All project-owned code, comments, documentation, docstrings, diagnostics, prompts, and user-visible strings must be in English. User and model content may remain Unicode-capable.',
    'Treat violations of these coding preferences as review issues. Return KO with a detailed corrective instruction when they are found.',
    'Check for: (1) scope drift, where the student did more or less than requested without telling the user; (2) mistakes or goal drift; (3) hallucinations; and (4) inability to complete the task after exhausting reasonable attempts.',
    'Do not make changes yourself. Do not fix files. If issues 1–3 exist, write a detailed instruction for the student as if it were the user saying what was actually wanted and what must be corrected.',
    'If issue 4 applies, clearly say that the agent is less capable than the task and that execution must stop so the message can be shown to the user.',
    'Return structured output with exactly these fields: {"status":"OK"|"KO","instruction":"..."}.',
    'Use OK only when there are no issues. Use KO when issues 1–4 apply. For issues 1–3, instruction must tell the student exactly what to correct. For issue 4, instruction must say the student model is less capable than the task and execution must stop.',
    'The transcript includes every user-visible turn and summarized tool activity, but excludes model reasoning, runtime context, and raw tool payloads/results.',
    'Use available tools only to verify the listed work. Do not make changes just to inspect it.',
    'Do not call completion_check or any reporting tool. The structured output is the only review result.',
    '',
    'Clean conversation transcript:',
    cleanConversation(agent),
  ].join('\n')
}

/** Collect and validate the reviewer's structured verdict. */
function reviewerResult(result: SubagentResult): CompletionReview {
  const structured = result.structured as Partial<CompletionReview> | undefined
  if (structured?.status === 'OK' || structured?.status === 'KO') {
    return { status: structured.status, instruction: structured.instruction ?? '' }
  }
  const text = result.output
    .filter((block): block is Extract<ContentBlock, { type: 'text' }> => block.type === 'text')
    .map(block => block.text)
    .join('\n')
    .trim()
  throw new Error(`master reviewer returned invalid structured output: ${text || result.diagnostic || result.stopReason}`)
}

/** Install the automatic master review after completed student turns. */
export function apply(ctx: Context, config: Config): void {
  const entry: CompletionCheckerSettings = {
    enabled: config.enabled ?? DEFAULT_COMPLETION_CHECKER_ENABLED,
  }
  let source: () => CompletionCheckerSettings = () => entry
  let settingsScope: SettingsScope<CompletionCheckerSettings> | undefined
  const disabledAgents = new WeakSet<Agent>()

  const reviewStates = new WeakMap<Agent, { turn: number; review: CompletionReview }>()
  const pendingReviews = new WeakSet<Agent>()
  const providerName = config.provider ?? DEFAULT_COMPLETION_CHECKER_PROVIDER
  const maxRetries = config.maxRetries ?? 3
  const retryDelayMs = config.retryDelayMs ?? 5_000
  const configuredMaster = config.masterModel === undefined || config.masterProvider === undefined
    ? undefined
    : { provider: config.masterProvider, model: config.masterModel }

  const onTurnStopping = async ({ agent, turn, reason, signal }: TurnStoppingPayload) => {
    const turnEvents = currentTurnEvents(agent, turn)
    const hasToolCall = turnEvents.some(event => event.type === 'tool/call')
    if (reason.kind !== 'completed'
      || isNestedAgent(agent)
      || !source().enabled
      || disabledAgents.has(agent)
      || (!pendingReviews.has(agent) && !hasToolCall)
      || (source().masterModel === undefined || source().masterProvider === undefined) && configuredMaster === undefined) return
    if (isLoopRecoveryTurn(turnEvents)) return
    const state = reviewStates.get(agent)
    if (state?.turn === turn) return
    const current = source()
    const master = current.masterProvider !== undefined && current.masterModel !== undefined
      ? { provider: current.masterProvider, model: current.masterModel }
      : configuredMaster
    if (master === undefined) return
    ctx.logger.info(`master-model: reviewing completed turn ${turn} (${hasToolCall ? 'tool-using' : 'corrective'})`)
    try {
      let review: CompletionReview | undefined
      for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
        let run: SubagentRun | undefined
        try {
          run = await ctx.subagents.start(providerName, {
            label: 'master-model', prompt: [{ type: 'text', text: reviewPrompt(agent) }], parent: agent, signal,
            outputSchema: {
              type: 'object', properties: { status: { type: 'string', enum: ['OK', 'KO'] }, instruction: { type: 'string' } },
              required: ['status', 'instruction'], additionalProperties: false,
            },
            agentOptions: { ...master, loopDetection: { ...agent.options.loopDetection, enabled: true } },
          })
          review = reviewerResult(await run.result)
          break
        } catch (error: unknown) {
          if (signal.aborted) throw error
          if (!isTransientReviewError(error) || attempt === maxRetries) throw error
          const delayMs = retryDelayMs * 2 ** attempt
          const nextAttempt = attempt + 2
          const totalAttempts = maxRetries + 1
          ctx.logger.warn(`master-model: transient review failure; retrying attempt ${nextAttempt}/${totalAttempts} in ${delayMs} ms: ${String(error)}`)
          appendNotice(agent, `Master review was temporarily unavailable. Retrying (${nextAttempt}/${totalAttempts}) in ${delayMs / 1_000} seconds.`, 'master review retrying')
          await waitForRetry(delayMs, signal)
        } finally {
          if (run !== undefined) await run.dispose()
        }
      }
      if (review === undefined) throw new Error('master reviewer exhausted retries without a result')
      if (review.status === 'OK') {
        pendingReviews.delete(agent)
        reviewStates.set(agent, { turn, review })
        agent.steer(createUserMessage({
          content: [{ type: 'text', text: 'Tell the user that the master model validated the response successfully. Do not perform any more work.' }],
          source: { ...PLUGIN_SOURCE, form: 'notice', summary: 'master validated response' },
        }))
        return
      }
      pendingReviews.add(agent)
      const stop = /less capable than the task|execution must stop/i.test(review.instruction)
      if (stop) { pendingReviews.delete(agent); reviewStates.set(agent, { turn, review }) }
      agent.steer(createUserMessage({
        content: [{ type: 'text', text: stop
          ? `Stop working. Tell the user that the selected student model is less capable than this task. Master review:\n\n${review.instruction}`
          : `The master model rejected the completed work. Treat the following as corrective user feedback, perform the requested corrections, and then finish again:\n\n${review.instruction}` }],
        source: stop
          ? { ...PLUGIN_SOURCE, form: 'notice', summary: 'master stopped task' }
          : { kind: 'user' },
      }))
    } catch (error: unknown) {
      if (signal.aborted) throw error
      ctx.logger.warn(`master-model: review failed: ${String(error)}`)
      appendNotice(agent, `Master review failed, so this response was not validated: ${String(error)}`, 'master review failed')
    }
  }

  const disposeTurnStopping = ctx.root.on('agent/turn-stopping', onTurnStopping, { global: true })
  ctx.effect(() => disposeTurnStopping)

  installSettingsSection(ctx, COMPLETION_CHECKER_SETTINGS_NAMESPACE, COMPLETION_CHECKER_SETTINGS_SCHEMA, entry, {
    setScope: (scope) => { settingsScope = scope },
    setSource: (current) => { source = current },
    onChange: () => {},
  })

  ctx.commands.register({
    name: 'master',
    description: 'Toggle master-model review',
    input: { hint: '[on|off]', images: false },
    async handler({ agent, rawInput }) {
      if (settingsScope === undefined) return { kind: 'error', text: 'Settings are not available.' }
      const input = rawInput.trim().toLowerCase()
      if (input === 'chat-off') {
        disabledAgents.add(agent)
        return { kind: 'success', text: 'Master disabled for this chat.' }
      }
      if (input !== '' && input !== 'on' && input !== 'off') return { kind: 'error', text: 'Usage: /master [on|off]' }
      const enabled = input === '' ? !source().enabled : input === 'on'
      await settingsScope.update({ enabled })
      return { kind: 'success', text: enabled ? 'Master enabled.' : 'Master disabled.' }
    },
  })

}

export const name = 'completion-checker'
