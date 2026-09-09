import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import type { Agent } from '@deepseek-ai/dsh-agent'
import Commands from '@deepseek-ai/dsh-commands'
import { mountAgentLoopTestDependencies } from '@deepseek-ai/dsh-agent-loop-testkit'
import * as CompletionChecker from '@deepseek-ai/dsh-completion-checker'
import type { SubagentStartRequest, SubagentResult, SubagentRun } from '@deepseek-ai/dsh-subagent'
import { SessionId } from '@deepseek-ai/dsh-session'
import { MockAdapter, textResponse, toolCallResponse } from '../../../core/agent-loop/tests/mock-adapter.ts'

const contexts: Context[] = []
afterEach(async () => { await Promise.allSettled(contexts.splice(0).map(context => context.fiber.dispose())) })

async function harness(reviews: string[]) {
  const ctx = new Context(); contexts.push(ctx)
  await mountAgentLoopTestDependencies(ctx)
  const starts: SubagentStartRequest[] = []
  ctx.provide('subagents', {
    getProvider: () => ({}),
    start: async (_provider: string, request: SubagentStartRequest): Promise<SubagentRun> => {
      starts.push(request)
      const result: SubagentResult = { output: [{ type: 'text', text: reviews.shift() ?? 'ACCEPT\nThe response is valid.' }], stopReason: 'completed' }
      return { id: SessionId(`review-${starts.length}`), localAgent: undefined, result: Promise.resolve(result), dispose: async () => {} }
    },
  } as never)
  await ctx.plugin(AgentLoop, { agents: [] }); await ctx.plugin(Commands)
  await ctx.plugin(CompletionChecker, { masterProvider: 'mock', masterModel: 'master' })
  ctx.llm.registerAdapter(['mock'], new MockAdapter([
    toolCallResponse('tool', 'bash', {}, 'tool result'),
    ...reviews.map(() => textResponse('student response')),
    textResponse('student response'),
  ]))
  const agent = ctx.agentLoop.create(SessionId('parent'), { provider: 'mock', model: 'student' })
  return { ctx, agent, starts }
}

function idle(ctx: Context, agent: Agent): Promise<void> {
  return new Promise((resolve) => {
    const off = ctx.on('agent/status', (event) => { if (event.agent === agent && event.status === 'idle') { off(); resolve() } })
  })
}

describe('automatic master review', () => {
  it('does not review a completed turn that used no tools', async () => {
    const ctx = new Context(); contexts.push(ctx)
    await mountAgentLoopTestDependencies(ctx)
    ctx.provide('subagents', { getProvider: () => ({}), start: async () => { throw new Error('must not run') } } as never)
    await ctx.plugin(AgentLoop, { agents: [] }); await ctx.plugin(Commands); await ctx.plugin(CompletionChecker, { masterProvider: 'mock', masterModel: 'master' })
    ctx.llm.registerAdapter(['mock'], new MockAdapter([textResponse('answer')]))
    const agent = ctx.agentLoop.create(SessionId('no-tools'), { provider: 'mock', model: 'student' })
    agent.followup(createUserMessage({ content: [{ type: 'text', text: 'task' }], source: { kind: 'user' } }))
    await idle(ctx, agent)
  })

  it('passes the clean transcript and project-root guard to the master', async () => {
    const { ctx, agent, starts } = await harness([])
    agent.followup(createUserMessage({ content: [{ type: 'text', text: 'task' }], source: { kind: 'user' } }))
    await idle(ctx, agent)
    expect(starts).toHaveLength(1)
    const prompt = (starts[0]!.prompt[0] as { type: 'text'; text: string }).text
    expect(prompt).toContain('Clean conversation transcript:')
    expect(prompt).toContain('The project directory is:')
    expect(prompt).toContain('only project root')
    expect(prompt).toContain('Agent used bash')
    expect(starts[0]!.agentOptions).toMatchObject({ provider: 'mock', model: 'master' })
  })

  it('feeds REVISE feedback back as a real user message', async () => {
    const { ctx, agent, starts } = await harness(['REVISE\nFix the implementation and continue.'])
    agent.followup(createUserMessage({ content: [{ type: 'text', text: 'task' }], source: { kind: 'user' } }))
    await idle(ctx, agent)
    expect(starts).toHaveLength(2)
    expect(agent.session.events.some(event => event.type === 'user/message' && event.data.source.kind === 'user' && JSON.stringify(event.data.content).includes('Fix the implementation'))).toBe(true)
  })

  it('stops on STOP and reports that the student is less capable', async () => {
    const { ctx, agent, starts } = await harness(['STOP\nThe student model is less capable than this task.'])
    agent.followup(createUserMessage({ content: [{ type: 'text', text: 'task' }], source: { kind: 'user' } }))
    await idle(ctx, agent)
    expect(starts).toHaveLength(1)
    expect(agent.session.events.some(event => event.type === 'user/message' && JSON.stringify(event.data.content).includes('less capable'))).toBe(true)
  })
})
