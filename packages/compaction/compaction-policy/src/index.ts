/** Global and per-route automatic compaction threshold policy. */

import { Context, Service } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { installSettingsSection, settingsNamespace } from '@deepseek-ai/dsh-settings'
import {
  COMPACTION_POLICY_SETTINGS_NAMESPACE,
  DEFAULT_COMPACT_AT_RATIO,
  type CompactionPolicyOverride,
  type CompactionPolicySettings,
  type CompactionPolicyTarget,
} from './client.ts'

export {
  COMPACTION_POLICY_SETTINGS_NAMESPACE,
  DEFAULT_COMPACT_AT_RATIO,
  type CompactionPolicyOverride,
  type CompactionPolicySettings,
  type CompactionPolicyTarget,
} from './client.ts'

const SETTINGS_NAMESPACE = settingsNamespace(COMPACTION_POLICY_SETTINGS_NAMESPACE)
const ratio = z.number().min(0.01).max(1)

const overrideSchema: z<CompactionPolicyOverride> = z.object({
  provider: z.string().required(),
  model: z.string().required(),
  compactAtRatio: ratio,
})

function validateSettings(value: CompactionPolicySettings): void {
  const seen = new Set<string>()
  for (const override of value.overrides) {
    const key = `${override.provider}\u0000${override.model}`
    if (seen.has(key)) {
      throw new Error(
        `compaction-policy: duplicate override for ${override.provider}/${override.model}`,
      )
    }
    seen.add(key)
  }
}

/** Schema for the user-owned global and per-route policy section. */
export const COMPACTION_POLICY_SETTINGS_SCHEMA: z<CompactionPolicySettings> = z.object({
  compactAtRatio: ratio.default(DEFAULT_COMPACT_AT_RATIO),
  overrides: z.array(overrideSchema).default([]),
})

/** Composition defaults for the policy service. */
export interface Config {
  /** Global default fraction when no user value exists. */
  compactAtRatio?: number
}

/** Public service consumed by automatic compaction and policy-aware UI hosts. */
export interface ICompactionPolicy {
  /**
   * Resolve the effective ratio for one exact provider/model route.
   * @param target provider/model route to resolve.
   * @returns effective compaction ratio.
   */
  ratioFor(target: CompactionPolicyTarget): number
  /**
   * Return the explicit override, if one exists for the route.
   * @param target provider/model route to inspect.
   * @returns matching override, if present.
   */
  overrideFor(target: CompactionPolicyTarget): CompactionPolicyOverride | undefined
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    compactionPolicy: ICompactionPolicy
  }
}

function routeMatches(left: CompactionPolicyTarget, right: CompactionPolicyTarget): boolean {
  return left.provider === right.provider && left.model === right.model
}

/** Resolve and serve the durable automatic-compaction policy. */
export class CompactionPolicy extends Service implements ICompactionPolicy {
  static Config: z<Config> = z.object({
    compactAtRatio: ratio.default(DEFAULT_COMPACT_AT_RATIO),
  })

  private source: () => CompactionPolicySettings

  constructor(ctx: Context, config: Config = {}) {
    super(ctx, 'compactionPolicy')
    const entry: CompactionPolicySettings = {
      compactAtRatio: config.compactAtRatio ?? DEFAULT_COMPACT_AT_RATIO,
      overrides: [],
    }
    this.source = () => entry
    installSettingsSection(ctx, SETTINGS_NAMESPACE, COMPACTION_POLICY_SETTINGS_SCHEMA, entry, {
      setSource: (source) => { this.source = source },
      validate: validateSettings,
      onChange: () => {},
    })
  }

  ratioFor(target: CompactionPolicyTarget): number {
    return this.overrideFor(target)?.compactAtRatio ?? this.source().compactAtRatio
  }

  overrideFor(target: CompactionPolicyTarget): CompactionPolicyOverride | undefined {
    return this.source().overrides.find(override => routeMatches(override, target))
  }
}

export default CompactionPolicy
