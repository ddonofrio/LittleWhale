import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import { mountAgentLoopTestDependencies } from '@deepseek-ai/dsh-agent-loop-testkit'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import type { GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm'
import { SessionId } from '@deepseek-ai/dsh-session'
import GoalService from '@deepseek-ai/dsh-goal'
import * as PlanGoal from '../src/index.ts'
import { MockAdapter, textResponse } from '../../agent-loop/tests/mock-adapter.ts'

interface Harness {
  readonly ctx: Context
  readonly agent: Agent
  readonly requests: GenerateOptions[]
}

const contexts: Context[] = []

afterEach(async () => {
  await Promise.allSettled(contexts.splice(0).map(context => context.fiber.dispose()))
})

async function harness(
  structuredGoal: string,
  parentResponses = 2,
  planGoalConfig: PlanGoal.Config = {},
  plannerResponse = textResponse(structuredGoal),
): Promise<Harness> {
  const ctx = new Context()
  contexts.push(ctx)
  await mountAgentLoopTestDependencies(ctx)

  await ctx.plugin(AgentLoop, { agents: [] })
  await ctx.plugin(GoalService)
  await ctx.plugin(PlanGoal, planGoalConfig)
  const adapter = new MockAdapter(Array.from({ length: parentResponses }, (_, index) => [
    plannerResponse,
    textResponse(`parent answer ${index + 1}`),
  ]).flat())
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
    const { ctx, agent, requests } = await harness('Reply to the user with a friendly greeting.')
    start(agent, 'Hi there')
    await waitForIdle(ctx, agent)

    expect(requests).toHaveLength(2)
    expect(requests[0]?.purpose).toBe('goal')
    expect(requests[0]?.tools).toBeUndefined()
    expect(requests[0]?.system).toContain('Never execute')
    expect(requests[0]?.system).toContain('Never call tools')
    expect(requests[0]?.system).toContain('exactly one user story')
    expect(requests[0]?.system).toContain('Use exactly this structure')
    expect(requests[0]?.system).toContain('Start with “As” and use “I want” exactly once')
    expect(requests[0]?.system).toContain('Do not invent requirements')
    expect(requests[0]?.messages[0]?.content[0]).toMatchObject({ type: 'text' })
    expect((requests[0]?.messages[0]?.content[0] as { type: 'text'; text: string }).text).toContain('Latest user request:')
    expect(ctx.goals.get(agent)).toMatchObject({
      objective: 'Reply to the user with a friendly greeting.',
      phase: 'active',
    })
    const userMessage = agent.session.events.find(event => event.type === 'user/message' && event.data.source.kind === 'user')
    expect(userMessage?.type === 'user/message' && userMessage.data.content).toEqual([
      { type: 'text', text: 'Reply to the user with a friendly greeting.' },
    ])
  })

  it('derives later goals from the clean transcript and the newly received request', async () => {
    const { ctx, agent, requests } = await harness('Implement the next house iteration in one focused pass.')
    start(agent, 'Build a small house')
    await waitForIdle(ctx, agent)
    start(agent, 'Now add a garage')
    await waitForIdle(ctx, agent)

    expect(requests).toHaveLength(4)
    expect(requests.map(request => request.purpose)).toEqual(['goal', undefined, 'goal', undefined])
    expect(requests[2]?.purpose).toBe('goal')
    const prompt = (requests[2]?.messages[0]?.content[0] as { type: 'text'; text: string }).text
    expect(prompt).toContain('Clean conversation transcript:')
    expect(prompt).toContain('Return only the user story using this exact structure: As <role>, I want <desired outcome>, so that <value or reason>.')
    expect(prompt).toContain('User:\nImplement the next house iteration in one focused pass.')
    expect(prompt).toContain('Agent:\nparent answer 1')
    expect(prompt).toContain('Latest user request:\nNow add a garage')
    expect(ctx.goals.get(agent)).toMatchObject({
      objective: 'Implement the next house iteration in one focused pass.',
    })
  })

  it('does not derive or create goals when automatic assignment is disabled', async () => {
    const { ctx, agent, requests } = await harness('should not be used', 1, { enabled: false })
    start(agent, 'Answer normally')
    await waitForIdle(ctx, agent)

    expect(requests.filter(request => request.purpose === 'goal')).toHaveLength(0)
    expect(ctx.goals.get(agent)).toBeUndefined()
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
