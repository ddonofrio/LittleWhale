import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { SettingsProvider, settingsNamespace, type SettingsNamespace } from '@deepseek-ai/dsh-settings'
import CompactionPolicy, {
  COMPACTION_POLICY_SETTINGS_NAMESPACE,
  DEFAULT_COMPACT_AT_RATIO,
} from '../src/index.ts'

const POLICY_NAMESPACE = settingsNamespace(COMPACTION_POLICY_SETTINGS_NAMESPACE)

class MemorySettings extends SettingsProvider {
  doc: Record<string, unknown> = {}

  get writable(): boolean {
    return true
  }

  protected load(): Promise<Record<string, unknown>> {
    return Promise.resolve(structuredClone(this.doc))
  }

  protected persist(ns: SettingsNamespace, section: Record<string, unknown>): Promise<void> {
    this.doc = { ...this.doc, [ns]: structuredClone(section) }
    return Promise.resolve()
  }
}

async function boot() {
  const ctx = new Context()
  const settings = ctx.plugin(MemorySettings)
  await settings.await()
  await ctx.plugin(CompactionPolicy)
  return { ctx, settings }
}

describe('CompactionPolicy', () => {
  it('defaults every route to 75 percent', async () => {
    const bench = await boot()
    expect(bench.ctx.compactionPolicy.ratioFor({ provider: 'p', model: 'm' }))
      .toBe(DEFAULT_COMPACT_AT_RATIO)
    await bench.ctx.fiber.dispose()
  })

  it('layers an exact route override over the global value', async () => {
    const bench = await boot()
    await bench.settings.ctx.settings.update(POLICY_NAMESPACE, {
      compactAtRatio: 0.7,
      overrides: [{ provider: 'p', model: 'm', compactAtRatio: 0.84 }],
    })
    expect(bench.ctx.compactionPolicy.ratioFor({ provider: 'p', model: 'm' })).toBe(0.84)
    expect(bench.ctx.compactionPolicy.ratioFor({ provider: 'p', model: 'other' })).toBe(0.7)
    await bench.ctx.fiber.dispose()
  })

  it('returns to the global value when the route override is removed', async () => {
    const bench = await boot()
    await bench.settings.ctx.settings.update(POLICY_NAMESPACE, {
      overrides: [{ provider: 'p', model: 'm', compactAtRatio: 0.9 }],
    })
    await bench.settings.ctx.settings.update(POLICY_NAMESPACE, { overrides: [] })
    expect(bench.ctx.compactionPolicy.ratioFor({ provider: 'p', model: 'm' })).toBe(0.75)
    await bench.ctx.fiber.dispose()
  })

  it('rejects duplicate exact route overrides', async () => {
    const bench = await boot()
    await expect(bench.settings.ctx.settings.update(POLICY_NAMESPACE, {
      overrides: [
        { provider: 'p', model: 'm', compactAtRatio: 0.7 },
        { provider: 'p', model: 'm', compactAtRatio: 0.8 },
      ],
    })).rejects.toThrow('duplicate override for p/m')
    await bench.ctx.fiber.dispose()
  })
})
