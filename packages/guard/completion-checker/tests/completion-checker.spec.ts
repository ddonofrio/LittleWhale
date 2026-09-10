import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import type { Agent } from '@deepseek-ai/dsh-agent'
import Commands from '@deepseek-ai/dsh-commands'
import { mountAgentLoopTestDependencies } from '@deepseek-ai/dsh-agent-loop-testkit'
import * as CompletionChecker from '@deepseek-ai/dsh-completion-checker'
import type { SubagentStartRequest, SubagentResult, SubagentRun } from '@deepseek-ai/dsh-subagent'
import SubagentRuntime from '@deepseek-ai/dsh-subagent'
import * as SpawnSubagent from '@deepseek-ai/dsh-subagent-spawn-in-process'
import { STRUCTURED_OUTPUT_TOOL } from '@deepseek-ai/dsh-subagent-in-process-driver'
import { SessionId } from '@deepseek-ai/dsh-session'
import { MemorySettings } from '../../../settings/settings/tests/memory.ts'
import { MockAdapter, textResponse, toolCallResponse } from '../../../core/agent-loop/tests/mock-adapter.ts'

const contexts: Context[] = []
afterEach(async () => { await Promise.allSettled(contexts.splice(0).map(context => context.fiber.dispose())) })

async function harness(
  reviews: Array<{ status: 'OK' | 'KO'; instruction: string }>,
  startErrors: Error[] = [],
) {
  const ctx = new Context(); contexts.push(ctx)
  await mountAgentLoopTestDependencies(ctx)
  const starts: SubagentStartRequest[] = []
  ctx.provide('subagents', {
    getProvider: () => ({}),
    start: async (_provider: string, request: SubagentStartRequest): Promise<SubagentRun> => {
      const startError = startErrors.shift()
      if (startError !== undefined) throw startError
      starts.push(request)
      const result: SubagentResult = { output: [], structured: reviews.shift() ?? { status: 'OK', instruction: 'The response is valid.' }, stopReason: 'completed' }
      return { id: SessionId(`review-${starts.length}`), localAgent: undefined, result: Promise.resolve(result), dispose: async () => {} }
    },
  } as never)
  await ctx.plugin(MemorySettings, { doc: { 'completion-checker': { enabled: true, masterProvider: 'mock', masterModel: 'master' } } })
  await ctx.plugin(AgentLoop, { agents: [] }); await ctx.plugin(Commands)
  await ctx.plugin(CompletionChecker, { retryDelayMs: 0 })
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
    expect(prompt).toContain('project coding preferences')
    expect(prompt).toContain('All project-owned code')
    expect(prompt).toContain('Agent used bash')
    expect(starts[0]!.agentOptions).toMatchObject({ provider: 'mock', model: 'master' })
    expect(starts[0]!.outputSchema).toMatchObject({ required: ['status', 'instruction'] })
  })

  it('reviews agents created from a sibling application scope', async () => {
    const { ctx, starts } = await harness([])
    let agent: Agent | undefined
    await ctx.plugin(Object.assign((appCtx: Context) => {
      agent = appCtx.agentLoop.create(SessionId('sibling-parent'), { provider: 'mock', model: 'student' })
    }, { inject: ['agentLoop'] }))
    expect(agent).toBeDefined()
    agent!.followup(createUserMessage({ content: [{ type: 'text', text: 'task' }], source: { kind: 'user' } }))
    await idle(ctx, agent!)
    expect(starts).toHaveLength(1)
  })

  it('shows an explicit unvalidated notice when the master provider fails', async () => {
    const { ctx, agent } = await harness([], [new Error('authentication failed')])
    agent.followup(createUserMessage({ content: [{ type: 'text', text: 'task' }], source: { kind: 'user' } }))
    await idle(ctx, agent)
    expect(agent.session.events.some(event => event.type === 'user/message'
      && event.data.source.kind === 'plugin'
      && event.data.source.plugin === 'completion-checker'
      && event.data.source.form === 'notice'
      && event.data.source.summary === 'master review failed'
      && JSON.stringify(event.data.content).includes('authentication failed'))).toBe(true)
  })

  it('shows transient retry notices and succeeds after a 429 response', async () => {
    const { ctx, agent, starts } = await harness([], [
      new Error('429: master model rate limited'),
      new Error('429: master model rate limited'),
    ])
    agent.followup(createUserMessage({ content: [{ type: 'text', text: 'task' }], source: { kind: 'user' } }))
    await idle(ctx, agent)
    expect(starts).toHaveLength(1)
    expect(agent.session.events.filter(event => event.type === 'user/message'
      && event.data.source.kind === 'plugin'
      && event.data.source.plugin === 'completion-checker'
      && event.data.source.form === 'notice'
      && event.data.source.summary === 'master review retrying')).toHaveLength(2)
    expect(agent.session.events.some(event => event.type === 'user/message'
      && event.data.source.kind === 'plugin'
      && event.data.source.plugin === 'completion-checker'
      && event.data.source.form === 'notice'
      && event.data.source.summary === 'master validated response')).toBe(true)
  })

  it('stops retrying and reports an unvalidated response after repeated 429 responses', async () => {
    const { ctx, agent } = await harness([], Array.from({ length: 4 }, () => new Error('429: master model rate limited')))
    agent.followup(createUserMessage({ content: [{ type: 'text', text: 'task' }], source: { kind: 'user' } }))
    await idle(ctx, agent)
    expect(agent.session.events.filter(event => event.type === 'user/message'
      && event.data.source.kind === 'plugin'
      && event.data.source.plugin === 'completion-checker'
      && event.data.source.form === 'notice'
      && event.data.source.summary === 'master review retrying')).toHaveLength(3)
    expect(agent.session.events.some(event => event.type === 'user/message'
      && event.data.source.kind === 'plugin'
      && event.data.source.plugin === 'completion-checker'
      && event.data.source.form === 'notice'
      && event.data.source.summary === 'master review failed')).toBe(true)
  })

  it('runs the real spawn reviewer as a child session in the application topology', async () => {
    const ctx = new Context(); contexts.push(ctx)
    await mountAgentLoopTestDependencies(ctx)
    await ctx.plugin(MemorySettings, { doc: { 'completion-checker': { enabled: true, masterProvider: 'mock', masterModel: 'master' } } })
    await ctx.plugin(AgentLoop, { agents: [] })
    await ctx.plugin(Commands)
    await ctx.plugin(SubagentRuntime)
    await ctx.plugin(SpawnSubagent, { providerName: 'spawn' })
    await new Promise<void>((resolve, reject) => {
      ctx.inject(['subagents', 'commands', 'settings'], (pluginCtx) => {
        try {
          CompletionChecker.apply(pluginCtx, {})
          resolve()
        } catch (error: unknown) {
          reject(error instanceof Error ? error : new Error(String(error)))
        }
      })
    })
    await vi.waitFor(() => {
      expect(ctx.settings.describe().some(section => section.ns === 'completion-checker')).toBe(true)
    })
    expect(ctx.settings.describe().find(section => section.ns === 'completion-checker')?.value).toEqual({
      enabled: true,
      masterProvider: 'mock',
      masterModel: 'master',
    })
    const adapter = new MockAdapter([
      toolCallResponse('student-tool', 'missing-test-tool', {}, 'tool result'),
      textResponse('student response'),
      toolCallResponse('review-verdict', STRUCTURED_OUTPUT_TOOL, { status: 'OK', instruction: 'Validated.' }),
      textResponse('The master model validated the response successfully.'),
    ])
    ctx.llm.registerAdapter(['mock'], adapter)
    const warnings: string[] = []
    ctx.logger.warn = ((message: unknown) => { warnings.push(String(message)) }) as typeof ctx.logger.warn

    let childParent: string | undefined
    ctx.on('subagent/start', ({ id }) => {
      childParent = ctx.agents.get(id)?.session.header.parentSession
    }, { global: true })
    let agent: Agent | undefined
    await ctx.plugin(Object.assign((appCtx: Context) => {
      agent = appCtx.agentLoop.create(SessionId('composed-parent'), { provider: 'mock', model: 'student' })
    }, { inject: ['agentLoop'] }))
    agent!.followup(createUserMessage({ content: [{ type: 'text', text: 'task' }], source: { kind: 'user' } }))
    await idle(ctx, agent!)

    expect(agent!.session.events.some(event => event.type === 'tool/call')).toBe(true)
    expect(agent!.session.events.findLast(event => event.type === 'turn/end')?.data.reason.kind).toBe('completed')
    expect(warnings).toEqual([])
    expect(adapter.requests).toHaveLength(4)
    expect(agent!.session.events.some(event => event.type === 'user/message'
      && event.data.source.kind === 'plugin'
      && event.data.source.plugin === 'completion-checker'
      && event.data.source.form === 'notice'
      && event.data.source.summary === 'master validated response')).toBe(true)
    expect(childParent).toBe(agent!.session.id)
  })

  it('feeds REVISE feedback back as a real user message', async () => {
    const { ctx, agent, starts } = await harness([{ status: 'KO', instruction: 'Fix the implementation and continue.' }, { status: 'OK', instruction: 'Validated.' }])
    agent.followup(createUserMessage({ content: [{ type: 'text', text: 'task' }], source: { kind: 'user' } }))
    await idle(ctx, agent)
    expect(starts).toHaveLength(2)
    expect(agent.session.events.some(event => event.type === 'user/message' && event.data.source.kind === 'user' && JSON.stringify(event.data.content).includes('Fix the implementation'))).toBe(true)
  })

  it('stops on STOP and reports that the student is less capable', async () => {
    const { ctx, agent, starts } = await harness([{ status: 'KO', instruction: 'The student model is less capable than the task and execution must stop.' }])
    agent.followup(createUserMessage({ content: [{ type: 'text', text: 'task' }], source: { kind: 'user' } }))
    await idle(ctx, agent)
    expect(starts).toHaveLength(1)
    expect(agent.session.events.some(event => event.type === 'user/message' && JSON.stringify(event.data.content).includes('less capable'))).toBe(true)
  })
})
