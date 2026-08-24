/**
 * Establish the next durable goal before a user request reaches the agent.
 * Every direct user request is given to a tools-free auxiliary LLM call
 * together with the same clean transcript used by the completion checker.
 *
 * @module @ddonofrio/littlewhale-plan-goal
 */

import { Context } from '@deepseek-ai/cordis'
import type { Agent, PreStepDecision } from '@deepseek-ai/dsh-agent'
import { BlockAssembler, createUserMessage, deepFreeze } from '@deepseek-ai/dsh-llm'
import type { ContentBlock, FinishReason, GenerateOptions, Message } from '@deepseek-ai/dsh-llm'
import type { UserMessage } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-goal'
import { installSettingsSection, settingsNamespace } from '@deepseek-ai/dsh-settings'
import { deadline, MAX_TIMER_DELAY_MS } from '@deepseek-ai/dsh-timeout'
import z from '@deepseek-ai/schemastery'

/** Plugin configuration. */
export interface Config {
  /** Whether automatic goal assignment is enabled by default. */
  enabled?: boolean
  /** End-to-end deadline for the auxiliary goal-description request. */
  timeoutMs?: number
}

/** Default deadline for the auxiliary goal-description request. */
export const DEFAULT_PLAN_GOAL_TIMEOUT_MS = 60000

/** Settings namespace exposed on the General settings surface. */
export const PLAN_GOAL_SETTINGS_NAMESPACE = settingsNamespace('plan-goal')

/** Whether automatic goal assignment is enabled when no user override exists. */
export const DEFAULT_PLAN_GOAL_ENABLED = true

/** Schema for the plugin's composition configuration. */
export const Config: z<Config> = z.object({
  enabled: z.boolean().default(DEFAULT_PLAN_GOAL_ENABLED),
  timeoutMs: z.number().step(1).min(1).max(MAX_TIMER_DELAY_MS).default(DEFAULT_PLAN_GOAL_TIMEOUT_MS),
})

/** User-selectable automatic goal assignment settings. */
export interface PlanGoalSettings {
  /** Whether every direct user request receives a derived goal. */
  enabled: boolean
}

/** Schema for the user-owned General settings section. */
export const PLAN_GOAL_SETTINGS_SCHEMA: z<PlanGoalSettings> = z.object({
  enabled: z.boolean().default(DEFAULT_PLAN_GOAL_ENABLED),
})

/** Services used by the pre-step policy. */
export const inject = ['llm', 'goals']

const PLUGIN_NAME = 'plan-goal'

type PlanGoalState = {
  readonly timeoutMs: number
}

function clip(text: string, maxChars: number): string {
  return text.length <= maxChars ? text : `${text.slice(0, maxChars)}… [truncated]`
}

function textContent(blocks: readonly ContentBlock[]): string {
  return blocks
    .filter((block): block is Extract<ContentBlock, { type: 'text' }> => block.type === 'text')
    .map(block => block.text)
    .join('\n')
    .trim()
}

/** Render the same user-visible transcript shape as completion_check. */
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
          entries.push(`Tool result: failed — ${clip(JSON.stringify(event.data.error), 600)}`)
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

function currentRequest(messages: readonly UserMessage[]): string {
  const text = messages
    .filter(message => message.source.kind === 'user')
    .map(message => textContent(message.content))
    .filter(value => value !== '')
    .join('\n\n')
  return text === '' ? '[The user supplied non-text content.]' : text
}

function isNestedAgent(agent: Agent): boolean {
  return agent.session.header.parentSession !== undefined
}

function hasDirectUserInput(messages: readonly UserMessage[]): boolean {
  return messages.some(message => message.source.kind === 'user')
}

function plannerSystemPrompt(): string {
  return [
    'You are a goal-description extractor for the main AI coding assistant.',
    'You are not the main agent and you are not an executor.',
    'Never execute, solve, investigate, inspect, modify, or test the user request.',
    'Never call tools. You have no permission to act on the workspace or communicate with the user.',
    'Your only task is to convert the user’s request into exactly one user story that describes the goal the main agent must pursue.',
    'A user story is a precise statement of an intended outcome from the user’s point of view.',
    'It is not a narrative, explanation, plan, checklist, implementation log, corrected transcript, or quotation.',
    'Use exactly this structure: As <the person or role making the request>, I want <the desired outcome>, so that <the value or reason for wanting that outcome>.',
    'Start with “As” and use “I want” exactly once.',
    'Identify the person or role whose request is being fulfilled. Usually use “the user”; use a more specific role only when the request clearly provides one.',
    'Describe one desired outcome, not a sequence of implementation steps.',
    'Use an active verb such as answer, explain, implement, investigate, modify, create, fix, or review.',
    'Preserve every explicit requirement, constraint, scope limitation, target, format, and acceptance condition from the user’s request.',
    'Put the purpose, motivation, or expected benefit after “so that”.',
    'Do not invent requirements, motivations, files, tools, architecture, or acceptance criteria that the user did not imply.',
    'If the user gives no explicit reason, use the neutral purpose “so that the requested outcome is achieved”.',
    'Correct spelling and improve clarity while preserving the user’s intent.',
    'For greetings, acknowledgements, small talk, and requests that only need a reply, describe the required response as the desired outcome.',
    'The user story must be self-contained and understandable without the original request.',
    'Return exactly one user story as one plain-text paragraph.',
    'Do not add “Goal:”, “User story:”, analysis, explanation, Markdown, quotation marks, alternatives, or additional sentences.',
  ].join('\n')
}

function plannerUserPrompt(agent: Agent, messages: readonly UserMessage[]): string {
  return [
    'Understand the latest user request and convert it into exactly one user story.',
    'Preserve the user’s intent, constraints, scope, and requested outcome. Correct spelling and improve clarity, but do not add requirements or invent motivation.',
    'Return only the user story using this exact structure: As <role>, I want <desired outcome>, so that <value or reason>.',
    'Clean conversation transcript:',
    cleanConversation(agent),
    '',
    'Latest user request:',
    currentRequest(messages),
  ].join('\n')
}

function finishError(finish: FinishReason): Error | undefined {
  switch (finish.kind) {
    case 'stop': return undefined
    case 'error':
    case 'aborted': return new Error(finish.failure.message)
    case 'max-tokens': return new Error('plan-goal: goal description reached the model output limit')
    case 'tool-calls': return new Error('plan-goal: goal description unexpectedly requested a tool')
    default: return new Error(`plan-goal: unsupported finish reason "${String((finish as { kind?: unknown }).kind)}"`)
  }
}

function generatedGoal(blocks: readonly ContentBlock[]): string {
  if (blocks.some(block => block.type === 'tool-call')) {
    throw new Error('plan-goal: goal description must contain text only')
  }
  const value = blocks
    .filter((block): block is Extract<ContentBlock, { type: 'text' }> => block.type === 'text')
    .map(block => block.text)
    .join(' ')
    .replace(/\s+/gu, ' ')
    .trim()
  if (value === '') throw new Error('plan-goal: goal description produced no text')
  return value
}

/** Replace the current direct user request with the derived goal instruction. */
function goalInstruction(messages: readonly UserMessage[], objective: string): UserMessage[] {
  let target = -1
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.source.kind === 'user') {
      target = index
      break
    }
  }
  if (target < 0) return [...messages]

  return messages.map((message, index) => {
    if (index !== target) return message
    let inserted = false
    const content: ContentBlock[] = []
    for (const block of message.content) {
      if (block.type !== 'text') {
        content.push(block)
      } else if (!inserted) {
        inserted = true
        content.push({ type: 'text', text: objective })
      }
    }
    if (!inserted) content.push({ type: 'text', text: objective })
    return { ...message, content }
  })
}

function renderError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** Persist an objective through the same goal domain used by `/goal`. */
function persistGoal(ctx: Context, agent: Agent, objective: string): void {
  const current = ctx.goals.get(agent)
  if (current === undefined || current.phase === 'complete') {
    ctx.goals.create(agent, { objective })
  } else {
    ctx.goals.edit(agent, { id: current.id, revision: current.revision }, { objective })
  }
}

async function deriveGoal(
  ctx: Context,
  state: PlanGoalState,
  agent: Agent,
  messages: readonly UserMessage[],
  signal: AbortSignal,
): Promise<string> {
  const logged = agent.session.requestHeader()?.config
  const route = logged !== undefined
    ? { provider: logged.provider, model: logged.model }
    : agent.options.provider !== undefined && agent.options.model !== undefined
      ? { provider: agent.options.provider, model: agent.options.model }
      : undefined
  if (route === undefined) {
    throw new Error('plan-goal: no model route is available for goal resolution')
  }

  const requestMessages: Message[] = [createUserMessage({
    content: [{ type: 'text', text: plannerUserPrompt(agent, messages) }],
    source: { kind: 'plugin', plugin: PLUGIN_NAME },
  })]
  using callDeadline = deadline(signal, state.timeoutMs, 'PLAN_GOAL_TIMEOUT')
  const options: GenerateOptions = deepFreeze({
    ...route,
    messages: requestMessages,
    system: plannerSystemPrompt(),
    sessionId: agent.session.id,
    purpose: 'goal',
    signal: callDeadline.signal,
  })
  const assembler = new BlockAssembler()
  for await (const chunk of ctx.llm.stream(options)) {
    callDeadline.signal.throwIfAborted()
    assembler.push(chunk)
  }
  const error = finishError(assembler.finish)
  if (error !== undefined) throw error
  return generatedGoal(assembler.blocks())
}

/** Install goal derivation at the model-step boundary. */
export function apply(ctx: Context, config: Config = {}): void {
  const entry: PlanGoalSettings = {
    enabled: config.enabled ?? DEFAULT_PLAN_GOAL_ENABLED,
  }
  let source: () => PlanGoalSettings = () => entry
  installSettingsSection(ctx, PLAN_GOAL_SETTINGS_NAMESPACE, PLAN_GOAL_SETTINGS_SCHEMA, entry, {
    setSource: (current) => { source = current },
    onChange: () => {},
  })

  const state: PlanGoalState = {
    timeoutMs: config.timeoutMs ?? DEFAULT_PLAN_GOAL_TIMEOUT_MS,
  }

  ctx.on('agent/pre-step', async ({ agent, messages, signal }, next): Promise<PreStepDecision> => {
    const decision = await next()
    if (decision.kind === 'reject'
      || signal.aborted
      || isNestedAgent(agent)
      || !source().enabled
      || !hasDirectUserInput(messages)) {
      return decision
    }

    const objective = await deriveGoal(ctx, state, agent, messages, signal)

    try {
      persistGoal(ctx, agent, objective)
    } catch (error: unknown) {
      ctx.logger.warn(`plan-goal: could not persist goal: ${renderError(error)}`)
    }
    return { kind: 'enter', messages: goalInstruction(decision.messages, objective) }
  })
}

export const name = 'plan-goal'
