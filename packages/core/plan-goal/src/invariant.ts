/** Package-owned invariant companion for the plan-goal policy. */

import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@ddonofrio/littlewhale-plan-goal'

/** Cordis companion plugin name. */
export const name = 'plan-goal-invariant'
/** Services required before the companion can register. */
export const inject = ['invariants']

/** No runtime invariant: the policy mutates the existing goal domain only. */
const install: InvariantInstaller = () => {}

/** Register the intentionally empty invariant contribution. */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
