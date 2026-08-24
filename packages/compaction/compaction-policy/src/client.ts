/** Client-safe contract for the durable compaction policy settings section. */

/** Settings namespace shared by the Host policy service and browser controls. */
export const COMPACTION_POLICY_SETTINGS_NAMESPACE = 'compaction-policy'

/** Default automatic-compaction position as a fraction of the full context window. */
export const DEFAULT_COMPACT_AT_RATIO = 0.75

/** Exact provider/model route whose override is being edited. */
export interface CompactionPolicyTarget {
  provider: string
  model: string
}

/** One persisted per-route threshold override. */
export interface CompactionPolicyOverride extends CompactionPolicyTarget {
  /** Fraction of the complete context window at which automatic compaction starts. */
  compactAtRatio: number
}

/** Durable global default plus explicit per-route overrides. */
export interface CompactionPolicySettings {
  /** Default fraction used by routes without an override. */
  compactAtRatio: number
  /** Explicit thresholds keyed by exact provider/model route. */
  overrides: CompactionPolicyOverride[]
}
