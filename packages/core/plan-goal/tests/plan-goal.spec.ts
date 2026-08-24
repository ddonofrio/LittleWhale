import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import { mountAgentLoopTestDependencies } from '@deepseek-ai/dsh-agent-loop-testkit'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import type { GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm'
import { SessionId } from '@deepseek-ai/dsh-session'
import GoalService from '@deepseek-ai/dsh-goal'
import * as PlanGoal from '../src/index.ts'
import { MockAdapter, textResponse, toolCallResponse } from '../../agent-loop/tests/mock-adapter.ts'

interface Harness {
  readonly ctx: Context
  readonly agent: Agent
  readonly requests: GenerateOptions[]
}

type PlannerResponse = StreamChunk[] | ((options: GenerateOptions) => StreamChunk[]) | 'hang'

const contexts: Context[] = []

function goalPlannerResponse(goal: string): (options: GenerateOptions) => StreamChunk[] {
  return (options) => {
    const prompt = (options.messages[0]?.content[0] as { type: 'text'; text: string }).text
    const marker = 'Latest user request:\n'
    const start = prompt.lastIndexOf(marker)
    const end = prompt.indexOf('\n\nRetry correction from the local validator:', start + marker.length)
    const request = start < 0
      ? ''
      : prompt.slice(start + marker.length, end < 0 ? undefined : end).trim()
    return toolCallResponse('goal-call', 'emit_goal', { goal, source_excerpt: request })
  }
}

afterEach(async () => {
  await Promise.allSettled(contexts.splice(0).map(context => context.fiber.dispose()))
})

async function harness(
  structuredGoal: string,
  parentResponses = 2,
  planGoalConfig: PlanGoal.Config = {},
  plannerResponse: PlannerResponse = goalPlannerResponse(structuredGoal),
  retryPlannerResponses: PlannerResponse[] = [],
): Promise<Harness> {
  const ctx = new Context()
  contexts.push(ctx)
  await mountAgentLoopTestDependencies(ctx)

  await ctx.plugin(AgentLoop, { agents: [] })
  await ctx.plugin(GoalService)
  await ctx.plugin(PlanGoal, planGoalConfig)
  const script: PlannerResponse[] = []
  if (retryPlannerResponses.length > 0) {
    script.push(...retryPlannerResponses, textResponse('parent answer 1'))
    for (let index = 1; index < parentResponses; index += 1) {
      script.push(plannerResponse, textResponse(`parent answer ${index + 1}`))
    }
  } else {
    script.push(...Array.from({ length: parentResponses }, (_, index) => [
      plannerResponse,
      textResponse(`parent answer ${index + 1}`),
    ]).flat())
  }
  const adapter = new MockAdapter(script)
  ctx.llm.registerAdapter(['mock'], adapter)
  const agent = ctx.agentLoop.create(SessionId('plan-goal-parent'), { provider: 'mock', model: 'mock' })
  agent.session.append('plan/mode', { active: false })
  return { ctx, agent, requests: adapter.requests }
}

function waitForIdle(ctx: Context, agent: Agent): Promise<void> {
  return new Promise((resolve) => {
    const off = ctx.on('agent/status', ({ agent: subject, status }) => {
      if (subject === agent && status === 'idle') {
        off()
        resolve()
      }
    })
  })
}

function start(agent: Agent, text: string): void {
  agent.followup(createUserMessage({ content: [{ type: 'text', text }], source: { kind: 'user' } }))
}

describe('plan-goal', () => {
  it('always starts a planner and defines a goal, including for a greeting', async () => {
    const { ctx, agent, requests } = await harness(
      'As the user, I want a friendly greeting, so that I receive a helpful response.',
    )
    start(agent, 'Hi there')
    await waitForIdle(ctx, agent)

    expect(requests).toHaveLength(2)
    expect(requests[0]?.purpose).toBe('goal')
    expect(requests[0]?.tools).toEqual([
      expect.objectContaining({ name: 'emit_goal' }),
    ])
    expect(requests[0]?.system).toContain('Never execute')
    expect(requests[0]?.system).toContain('must call the emit_goal tool exactly once')
    expect(requests[0]?.system).toContain('exactly one user story')
    expect(requests[0]?.system).toContain('Use exactly this structure')
    expect(requests[0]?.system).toContain('Start with “As” and use “I want” exactly once')
    expect(requests[0]?.system).toContain('Do not invent requirements')
    expect(requests[0]?.messages[0]?.content[0]).toMatchObject({ type: 'text' })
    const plannerPrompt = (requests[0]?.messages[0]?.content[0] as { type: 'text'; text: string }).text
    expect(plannerPrompt).toContain('Latest user request:')
    expect(plannerPrompt.split('Hi there')).toHaveLength(2)
    expect(ctx.goals.get(agent)).toMatchObject({
      objective: 'As the user, I want a friendly greeting, so that I receive a helpful response.',
      phase: 'active',
    })
    const userMessages = agent.session.events.filter(event => event.type === 'user/message'
      && event.data.source.kind === 'user')
    expect(userMessages).toHaveLength(1)
    const userMessage = userMessages[0]
    expect(userMessage?.type === 'user/message' && userMessage.data.content).toEqual([
      { type: 'text', text: 'Hi there' },
    ])
    const goalContext = agent.session.events.find(event => event.type === 'user/message'
      && event.data.source.kind === 'plugin'
      && event.data.source.plugin === 'plan-goal')
    expect(goalContext?.type === 'user/message' && goalContext.data).toMatchObject({
      content: [{
        type: 'text',
        text: 'SYSTEM: Just created the goal: As the user, I want a friendly greeting, so that I receive a helpful response.\nPLEASE STICK TO YOUR GOAL.',
      }],
      source: { kind: 'plugin', plugin: 'plan-goal', form: 'notice', summary: 'Goal created' },
    })
    const parentTexts = requests[1]?.messages
      .flatMap(message => message.content)
      .filter((block): block is { type: 'text'; text: string } => block.type === 'text')
      .map(block => block.text)
    expect(parentTexts).toContain('Hi there')
    expect(parentTexts).toContain('SYSTEM: Just created the goal: As the user, I want a friendly greeting, so that I receive a helpful response.\nPLEASE STICK TO YOUR GOAL.')
  })

  it('publishes the user message while goal planning is still running', async () => {
    const { ctx, agent, requests } = await harness('unused', 1, {}, 'hang')
    start(agent, 'Show this immediately')

    await vi.waitFor(() => expect(requests).toHaveLength(1))
    const userMessage = agent.session.events.find(event => event.type === 'user/message'
      && event.data.source.kind === 'user')
    expect(userMessage?.type === 'user/message' && userMessage.data.content).toEqual([
      { type: 'text', text: 'Show this immediately' },
    ])

    const idle = waitForIdle(ctx, agent)
    agent.cancel({ kind: 'user' })
    await idle
  })

  it('derives later goals from the clean transcript and the newly received request', async () => {
    const { ctx, agent, requests } = await harness(
      'As the user, I want the next house iteration implemented in one focused pass, so that the house is ready for the next step.',
    )
    start(agent, 'Build a small house')
    await waitForIdle(ctx, agent)
    start(agent, 'Now add a garage')
    await waitForIdle(ctx, agent)

    expect(requests).toHaveLength(4)
    expect(requests.map(request => request.purpose)).toEqual(['goal', undefined, 'goal', undefined])
    expect(requests[2]?.purpose).toBe('goal')
    const prompt = (requests[2]?.messages[0]?.content[0] as { type: 'text'; text: string }).text
    expect(prompt).toContain('Clean conversation transcript:')
    expect(prompt).toContain('Call emit_goal exactly once with two fields: goal and source_excerpt.')
    expect(prompt).toContain('User:\nBuild a small house')
    expect(prompt).toContain('Agent:\nparent answer 1')
    expect(prompt).toContain('Latest user request:\nNow add a garage')
    expect(ctx.goals.get(agent)).toMatchObject({
      objective: 'As the user, I want the next house iteration implemented in one focused pass, so that the house is ready for the next step.',
    })
  })

  it('does not derive or create goals when automatic assignment is disabled', async () => {
    const { ctx, agent, requests } = await harness('should not be used', 1, { enabled: false })
    start(agent, 'Answer normally')
    await waitForIdle(ctx, agent)

    expect(requests.filter(request => request.purpose === 'goal')).toHaveLength(0)
    expect(ctx.goals.get(agent)).toBeUndefined()
  })

  it('rejects free-form planner text instead of persisting it as a goal', async () => {
    const { ctx, agent, requests } = await harness(
      'unused',
      1,
      {},
      textResponse('<SYSTEM PROMPT>\n<goal_round>bad goal</goal_round>'),
      Array.from({ length: 11 }, () => textResponse('<SYSTEM PROMPT>\n<goal_round>bad goal</goal_round>')),
    )
    start(agent, 'Do not persist this')
    await waitForIdle(ctx, agent)

    expect(requests).toHaveLength(11)
    expect(ctx.goals.get(agent)).toBeUndefined()
    expect(agent.session.events.find(event => event.type === 'assistant/message')).toBeUndefined()
  })

  it('rejects a structured goal that contains a continuation prompt wrapper', async () => {
    const { ctx, agent, requests } = await harness(
      'unused',
      1,
      {},
      toolCallResponse('goal-call', 'emit_goal', {
        goal: '<SYSTEM PROMPT> <goal_round> As the user, I want current news, so that I stay informed. </goal_round>',
        source_excerpt: 'current news',
      }),
      Array.from({ length: 11 }, () => toolCallResponse('goal-call', 'emit_goal', {
        goal: '<SYSTEM PROMPT> <goal_round> As the user, I want current news, so that I stay informed. </goal_round>',
        source_excerpt: 'current news',
      })),
    )
    start(agent, 'Fetch current news')
    await waitForIdle(ctx, agent)

    expect(requests).toHaveLength(11)
    expect(ctx.goals.get(agent)).toBeUndefined()
    expect(agent.session.events.find(event => event.type === 'assistant/message')).toBeUndefined()
  })

  it('feeds validation feedback back to the planner and retries before admitting the request', async () => {
    const validGoal = goalPlannerResponse(
      'As the user, I want verified output, so that the requested outcome is achieved.',
    )
    const { ctx, agent, requests } = await harness(
      'unused',
      1,
      {},
      validGoal,
      [textResponse('free-form planner output'), validGoal],
    )
    start(agent, 'Return verified output')
    await waitForIdle(ctx, agent)

    expect(requests).toHaveLength(3)
    expect(requests[1]?.messages[0]?.content[0]).toMatchObject({ type: 'text' })
    const retryPrompt = (requests[1]?.messages[0]?.content[0] as { type: 'text'; text: string }).text
    expect(retryPrompt).toContain('Retry correction from the local validator:')
    expect(retryPrompt).toContain('expected exactly one emit_goal call with no visible text')
    expect(ctx.goals.get(agent)).toMatchObject({
      objective: 'As the user, I want verified output, so that the requested outcome is achieved.',
    })
    expect(agent.session.events.some(event => event.type === 'assistant/message')).toBe(true)
  })

  it('rejects a structured result whose source excerpt is not from the request', async () => {
    const { ctx, agent, requests } = await harness(
      'unused',
      1,
      {},
      toolCallResponse('goal-call', 'emit_goal', {
        goal: 'As the user, I want verified output, so that the requested outcome is achieved.',
        source_excerpt: 'not in the request',
      }),
      Array.from({ length: 11 }, () => toolCallResponse('goal-call', 'emit_goal', {
        goal: 'As the user, I want verified output, so that the requested outcome is achieved.',
        source_excerpt: 'not in the request',
      })),
    )
    start(agent, 'Return verified output')
    await waitForIdle(ctx, agent)

    expect(requests).toHaveLength(11)
    expect(ctx.goals.get(agent)).toBeUndefined()
    expect(agent.session.events.find(event => event.type === 'assistant/message')).toBeUndefined()
  })

  it('does not start the parent request when goal resolution fails', async () => {
    const { ctx, agent, requests } = await harness('unused', 1, {}, [
      { type: 'finish', reason: { kind: 'error', failure: { message: 'planner unavailable', code: 'SERVER' } } },
    ] satisfies StreamChunk[])

    start(agent, 'Do not silently continue')
    await waitForIdle(ctx, agent)

    expect(requests).toHaveLength(1)
    expect(requests[0]?.purpose).toBe('goal')
    expect(ctx.goals.get(agent)).toBeUndefined()
    expect(agent.session.events.find(event => event.type === 'assistant/message')).toBeUndefined()
  })
})
