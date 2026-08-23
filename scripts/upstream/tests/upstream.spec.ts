import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
// The boundary helpers are intentionally plain ESM so the sync scripts can run
// directly under Node without a build step.
// @ts-expect-error TypeScript does not consume declarations beside .mjs imports in this project.
import { ROOT, manifest, ownership } from '../common.mjs'

describe('upstream boundary', () => {
  it('has the required provenance files and immutable source records', () => {
    expect(existsSync(join(ROOT, 'upstream/manifest.yml'))).toBe(true)
    const diff = JSON.parse(readFileSync(join(ROOT, 'upstream/bootstrap-diff.json'), 'utf8'))
    expect(diff.bootstrapSha).toMatch(/^[0-9a-f]{40}$/)
    expect(diff.canonicalSha).toMatch(/^[0-9a-f]{40}$/)
  })

  it('keeps product overlays outside the mirror boundary', () => {
    const m = manifest()
    expect(ownership('packages/little-whale/ui-brand', m)).toBe('little-whale')
    expect(ownership('packages/client/ui-settings-models', m)).toBe('adapted-upstream')
    expect(ownership('packages/client/ui-conversation', m)).toBe('adapted-upstream')
  })
})
