/**
 * Establish the next durable goal before a user request reaches a plan-mode
 * agent. Every direct user request is given to a fresh structured-output
 * subagent together with the same clean transcript used by the completion
 * checker.
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
import z from '@deepseek-ai/schemastery'
import type {} from '@ddonofrio/littlewhale-plan-mode'

/** Plugin configuration. */
export interface Config {
  /** Whether plan-goal processing is enabled. */
  enabled?: boolean
  /** Registry name of the one-shot subagent provider. */
  provider?: string
}

/** Default provider used by the shipped composition. */
export const DEFAULT_PLAN_GOAL_PROVIDER = 'spawn'

/** Schema for the plugin's composition configuration. */
export const Config: z<Config> = z.object({
  enabled: z.boolean().default(true),
  provider: z.string().default(DEFAULT_PLAN_GOAL_PROVIDER),
})

/** Services used by the pre-step policy. */
export const inject = ['subagents', 'goals', 'planMode']

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
  readonly enabled: boolean
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

function isPlanActive(ctx: Context, agent: Agent): boolean {
  const state = ctx.planMode.get(agent)
  return state.pending ?? state.active
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
  if (!state.enabled || ctx.subagents.getProvider(state.provider) === undefined) return undefined
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
  const state: PlanGoalState = {
    enabled: config.enabled ?? true,
    provider: config.provider ?? DEFAULT_PLAN_GOAL_PROVIDER,
  }

  ctx.on('agent/pre-step', async ({ agent, messages, signal }, next): Promise<PreStepDecision> => {
    const decision = await next()
    if (decision.kind === 'reject'
      || signal.aborted
      || isNestedAgent(agent)
      || !state.enabled
      || !isPlanActive(ctx, agent)
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
    return decision
  })
}

export const name = 'plan-goal'
