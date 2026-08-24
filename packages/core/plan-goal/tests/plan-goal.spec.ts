import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import { mountAgentLoopTestDependencies } from '@deepseek-ai/dsh-agent-loop-testkit'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { SessionId } from '@deepseek-ai/dsh-session'
import GoalService from '@deepseek-ai/dsh-goal'
import type { SubagentResult, SubagentRun, SubagentStartRequest } from '@deepseek-ai/dsh-subagent'
import * as PlanGoal from '../src/index.ts'
import { MockAdapter, textResponse } from '../../agent-loop/tests/mock-adapter.ts'

interface Harness {
  readonly ctx: Context
  readonly agent: Agent
  readonly starts: SubagentStartRequest[]
}

const contexts: Context[] = []

afterEach(async () => {
  await Promise.allSettled(contexts.splice(0).map(context => context.fiber.dispose()))
})

async function harness(
  structuredGoal: string,
  parentResponses = 2,
  planGoalConfig: PlanGoal.Config = { provider: 'spawn' },
): Promise<Harness> {
  const ctx = new Context()
  contexts.push(ctx)
  await mountAgentLoopTestDependencies(ctx)

  const starts: SubagentStartRequest[] = []
  ctx.provide('subagents', {
    getProvider: () => ({}),
    start: async (_provider: string, request: SubagentStartRequest): Promise<SubagentRun> => {
      starts.push(request)
      const result: SubagentResult = {
        output: [],
        structured: { goal: structuredGoal },
        stopReason: 'completed',
      }
      return {
        id: SessionId(`planner-${starts.length}`),
        localAgent: undefined,
        result: Promise.resolve(result),
        dispose: vi.fn(async () => {}),
      }
    },
  } as never)

  await ctx.plugin(AgentLoop, { agents: [] })
  await ctx.plugin(GoalService)
  await ctx.plugin(PlanGoal, planGoalConfig)
  ctx.llm.registerAdapter(['mock'], new MockAdapter(
    Array.from({ length: parentResponses }, (_, index) => textResponse(`parent answer ${index + 1}`)),
  ))
  const agent = ctx.agentLoop.create(SessionId('plan-goal-parent'), { provider: 'mock', model: 'mock' })
  agent.session.append('plan/mode', { active: false })
  return { ctx, agent, starts }
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
    const { ctx, agent, starts } = await harness('Reply to the user with a friendly greeting.')
    start(agent, 'Hi there')
    await waitForIdle(ctx, agent)

    expect(starts).toHaveLength(1)
    expect(starts[0]?.outputSchema).toMatchObject({
      type: 'object',
      required: ['goal'],
    })
    const prompt = (starts[0]?.prompt[0] as { type: 'text'; text: string }).text
    expect(prompt).toContain('Always define a goal')
    expect(prompt).toContain('For a greeting, the goal is to reply appropriately')
    expect(prompt).toContain('fix typos and spelling')
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
    const { ctx, agent, starts } = await harness('Implement the next house iteration in one focused pass.')
    start(agent, 'Build a small house')
    await waitForIdle(ctx, agent)
    start(agent, 'Now add a garage')
    await waitForIdle(ctx, agent)

    expect(starts).toHaveLength(2)
    expect(starts[1]?.outputSchema).toMatchObject({
      type: 'object',
      required: ['goal'],
    })
    const prompt = (starts[1]?.prompt[0] as { type: 'text'; text: string }).text
    expect(prompt).toContain('Clean conversation transcript:')
    expect(prompt).toContain('User:\nImplement the next house iteration in one focused pass.')
    expect(prompt).toContain('Agent:\nparent answer 1')
    expect(prompt).toContain('Latest user request:\nNow add a garage')
    expect(ctx.goals.get(agent)).toMatchObject({
      objective: 'Implement the next house iteration in one focused pass.',
    })
  })

  it('does not derive or create goals when automatic assignment is disabled', async () => {
    const { ctx, agent, starts } = await harness('should not be used', 1, { enabled: false, provider: 'spawn' })
    start(agent, 'Answer normally')
    await waitForIdle(ctx, agent)

    expect(starts).toHaveLength(0)
    expect(ctx.goals.get(agent)).toBeUndefined()
  })
})
