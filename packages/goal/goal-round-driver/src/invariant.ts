/** Package-owned goal-round prompt invariants. @module @deepseek-ai/dsh-goal-round-driver/invariant */

import { isDeepStrictEqual } from 'node:util'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-agent'
import { foldGoal, type FoldedGoal, type GoalMessageSource, type GoalView } from '@deepseek-ai/dsh-goal'
import type { InvariantFailure, InvariantInstaller } from '@deepseek-ai/dsh-invariants'
import type { ToolSchema } from '@deepseek-ai/dsh-llm'
import type { Session, SessionEvent } from '@deepseek-ai/dsh-session'
import { renderGoalRoundPrompt } from './prompt.ts'

const PACKAGE_NAME = '@deepseek-ai/dsh-goal-round-driver'

/** Optional tool-registry surface used to reconstruct model-visible schemas. */
interface GoalToolSchemaProvider {
  schemas(scope?: object): ToolSchema[]
}

/** Cordis companion plugin name. */
export const name = 'goal-round-driver-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/** Attribute strict goal-fold failures to this companion's reconstruction. */
function foldChecked(events: readonly SessionEvent[], fail: InvariantFailure): FoldedGoal {
  try {
    return foldGoal(events)
  } catch (error: unknown) {
    /* v8 ignore next -- the strict goal decoder throws Error instances */
    const message = error instanceof Error ? error.message : String(error)
    return fail(`cannot reconstruct the goal before a continuation message: ${message}`)
  }
}

/** Recreate the live-shaped view consumed by the package's pure prompt renderer. */
function goalView(folded: FoldedGoal, source: GoalMessageSource, fail: InvariantFailure): GoalView {
  const goal = folded.goal
  if (goal === undefined || folded.createdAt === undefined || folded.updatedAt === undefined
    || goal.phase !== 'active' || goal.id !== source.goalId || goal.revision !== source.revision
    || source.round !== folded.roundsStarted + 1 || source.round > goal.maxGoalRounds) {
    return fail(`goal round ${source.round} cannot be reconstructed from the preceding durable goal state`)
  }
  return {
    ...goal,
    roundsStarted: folded.roundsStarted,
    createdAt: folded.createdAt,
    updatedAt: folded.updatedAt,
    activation: 'armed',
  }
}

/** Read live goal-control schemas when the owning runtime is available. */
function goalToolsFor(ctx: Context, session: Session) {
  const tools = (ctx as unknown as { get(name: string): unknown }).get('tools') as GoalToolSchemaProvider | undefined
  if (tools === undefined) return []
  const agents = (ctx as unknown as { get(name: string): { get(id: Session['id']): object | undefined } | undefined }).get('agents')
  return tools.schemas(agents?.get(session.id))
}

/** Validate one package-owned continuation message against its durable prefix. */
function validateEvent(
  ctx: Context,
  session: Session,
  prior: readonly SessionEvent[],
  event: SessionEvent,
  fail: InvariantFailure,
): void {
  if (event.type !== 'user/message') return
  const source = event.data.source
  if (source.kind !== 'goal' || source.round <= 0) return
  const expected = renderGoalRoundPrompt(
    goalView(foldChecked(prior, fail), source, fail),
    source.round,
    goalToolsFor(ctx, session),
  )
  if (!isDeepStrictEqual(event.data.content, expected)) {
    fail(`goal round ${source.round} content does not match the package-owned continuation prompt`)
  }
}

/** Check existing sessions and every candidate event before Session publishes it. */
const install: InvariantInstaller = Object.assign((ctx: Context, fail: InvariantFailure) => {
  for (const session of ctx.sessions.list()) {
    const prior: SessionEvent[] = []
    for (const event of session.events) {
      validateEvent(ctx, session, prior, event, fail)
      prior.push(event)
    }
  }
  /* jscpd:ignore-start -- package companions share dispatch and registration plumbing */
  ctx.on('internal/dispatch', (_mode, eventName, args) => {
    if (eventName !== 'session/event') return
    const [session, event] = args as [Session, SessionEvent]
    validateEvent(ctx, session, session.events, event, fail)
  }, { global: true })
}, { inject: ['sessions'] })

/**
 * Register the goal-round-driver invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
/* jscpd:ignore-end */
