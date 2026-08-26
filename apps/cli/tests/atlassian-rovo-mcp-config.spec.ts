import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { loadOverlayPatches } from '@deepseek-ai/dsh-app-boot'
import type { PatchOptions } from '@deepseek-ai/cordis-plugin-include'

interface InsertedRow {
  id?: string
  name?: string
  config?: Record<string, unknown>
}

const root = resolve(import.meta.dirname, '../../..')
const overlay = resolve(root, 'examples/mcp-atlassian-rovo/rovo.cordis.yml')

function insertedRow(patches: PatchOptions[]): InsertedRow {
  expect(patches).toHaveLength(1)
  const insert = patches[0]?.insert
  expect(insert).toHaveLength(1)
  return insert?.[0] as InsertedRow
}

describe('Atlassian Rovo MCP example overlay', () => {
  it('declares the generic Streamable HTTP bridge without embedding credentials', () => {
    const source = readFileSync(overlay, 'utf8')
    const row = insertedRow(loadOverlayPatches('atlassian-rovo-mcp-config-test', overlay))

    expect(row.id).toBe('mcp-atlassian-rovo')
    expect(row.name).toBe('@deepseek-ai/dsh-mcp-client')
    expect(row.config).toMatchObject({
      serverName: 'atlassian_rovo',
      transport: 'streamable-http',
      url: 'https://mcp.atlassian.com/v1/mcp',
      failOnStartupError: true,
    })
    const headers = row.config?.headers as { Authorization?: { __jsExpr?: string } } | undefined
    expect(headers?.Authorization?.__jsExpr).toContain('credentials.json')
    expect(source).toContain('examples/mcp-atlassian-rovo/credentials.json')
    expect(source).not.toMatch(/Basic\s+[A-Za-z0-9+/=]{12,}/)
    expect(source).not.toMatch(/Bearer\s+[A-Za-z0-9._-]{12,}/)
    expect(source).not.toMatch(/sk-[A-Za-z0-9_-]{8,}/)
  })
})
