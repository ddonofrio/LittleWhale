/**
 * Establish the next durable goal before a user request reaches the agent.
 * Every direct user request is given to a fresh structured-output subagent
 * together with the same clean transcript used by the completion checker.
 *
 * @module @ddonofrio/littlewhale-plan-goal
 */

import { Context } from '@deepseek-ai/cordis'
import type { Agent, PreStepDecision } from '@deepseek-ai/dsh-agent'
import type { ContentBlock } from '@deepseek-ai/dsh-llm'
import type { UserMessage } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-goal'
import type { ObjectJsonSchema } from '@deepseek-ai/dsh-tools'
import type { SubagentResult, SubagentRun } from '@deepseek-ai/dsh-subagent'
import { installSettingsSection, settingsNamespace } from '@deepseek-ai/dsh-settings'
import z from '@deepseek-ai/schemastery'

/** Plugin configuration. */
export interface Config {
  /** Whether automatic goal assignment is enabled by default. */
  enabled?: boolean
  /** Registry name of the one-shot subagent provider. */
  provider?: string
}

/** Default provider used by the shipped composition. */
export const DEFAULT_PLAN_GOAL_PROVIDER = 'spawn'

/** Settings namespace exposed on the General settings surface. */
export const PLAN_GOAL_SETTINGS_NAMESPACE = settingsNamespace('plan-goal')

/** Whether automatic goal assignment is enabled when no user override exists. */
export const DEFAULT_PLAN_GOAL_ENABLED = true

/** Schema for the plugin's composition configuration. */
export const Config: z<Config> = z.object({
  enabled: z.boolean().default(DEFAULT_PLAN_GOAL_ENABLED),
  provider: z.string().default(DEFAULT_PLAN_GOAL_PROVIDER),
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
export const inject = ['subagents', 'goals']

const PLUGIN_NAME = 'plan-goal'
const PLAN_GOAL_OUTPUT_SCHEMA: ObjectJsonSchema = {
  type: 'object',
  properties: {
    goal: { type: 'string' },
  },
  required: ['goal'],
  additionalProperties: false,
}

const OMITTED_TOOL_ARGUMENT_KEYS = new Set(['content', 'patch', 'body'])

type PlanGoalState = {
  readonly provider: string
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

function toolArgumentsSummary(argumentsText: string): string {
  try {
    const parsed: unknown = JSON.parse(argumentsText)
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return clip(argumentsText, 600)
    const summary = Object.fromEntries(Object.entries(parsed).map(([key, value]) => {
      if (OMITTED_TOOL_ARGUMENT_KEYS.has(key) && typeof value === 'string') {
        return [key, `[${value.length} characters omitted]`]
      }
      if (typeof value === 'string') return [key, clip(value, 240)]
      return [key, value]
    }))
    return clip(JSON.stringify(summary), 600)
  } catch {
    return clip(argumentsText, 600)
  }
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
        if (event.data.name !== 'completion_check') {
          entries.push(`Agent used ${event.data.name}: ${toolArgumentsSummary(event.data.arguments)}`)
        }
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

function plannerPrompt(agent: Agent, messages: readonly UserMessage[]): string {
  return [
    'Understand the conversation and the latest user request below.',
    'Define the next goal that the current agent should pursue.',
    'Always define a goal, even when the user only greets, acknowledges, makes small talk, or asks for a simple reply. For a greeting, the goal is to reply appropriately to the user.',
    'Rewrite the goal before returning it when needed: fix typos and spelling, and make it clearer and more concise without changing the user’s intent or constraints.',
    'Return exactly one concise paragraph describing that goal, with no plan, analysis, preamble, or extra goals.',
    'You must report it by calling the structured_output tool with the required goal field.',
    'Do not modify files, execute tasks, or call tools for any other purpose.',
    '',
    'Clean conversation transcript:',
    cleanConversation(agent),
    '',
    'Latest user request:',
    currentRequest(messages),
  ].join('\n')
}

function structuredGoal(result: SubagentResult): string | undefined {
  if (result.stopReason !== 'completed' || typeof result.structured !== 'object' || result.structured === null) return undefined
  const value = (result.structured as { goal?: unknown }).goal
  if (typeof value !== 'string' || value.trim() === '') return undefined
  return value.trim()
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
): Promise<string | undefined> {
  if (ctx.subagents.getProvider(state.provider) === undefined) return undefined
  let run: SubagentRun | undefined
  try {
    run = await ctx.subagents.start(state.provider, {
      label: PLUGIN_NAME,
      prompt: [{ type: 'text', text: plannerPrompt(agent, messages) }],
      parent: agent,
      signal,
      outputSchema: PLAN_GOAL_OUTPUT_SCHEMA,
      agentOptions: {
        loopDetection: {
          ...agent.options.loopDetection,
          enabled: true,
        },
      },
    })
    return structuredGoal(await run.result)
  } catch (error: unknown) {
    if (!signal.aborted) ctx.logger.warn(`plan-goal: planner failed: ${renderError(error)}`)
    return undefined
  } finally {
    if (run !== undefined) await run.dispose()
  }
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
    provider: config.provider ?? DEFAULT_PLAN_GOAL_PROVIDER,
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

    const objective = await deriveGoal(ctx, state, agent, messages, signal) ?? currentRequest(messages)
    if (signal.aborted || objective.trim() === '') return decision

    try {
      persistGoal(ctx, agent, objective)
    } catch (error: unknown) {
      ctx.logger.warn(`plan-goal: could not persist goal: ${renderError(error)}`)
    }
    return { kind: 'enter', messages: goalInstruction(decision.messages, objective) }
  })
}

export const name = 'plan-goal'
