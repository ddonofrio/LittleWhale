import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { lock, manifest, packageDirs, ownership, ROOT, treeHash } from './common.mjs'

const m = manifest()
const l = lock()
const errors = []
if (!l) errors.push('upstream/lock.yml is missing; run upstream:sync first')
for (const dir of packageDirs()) {
  const mode = ownership(dir, m)
  const packagePath = join(ROOT, dir, 'package.json')
  const packageJson = JSON.parse(readFileSync(packagePath, 'utf8'))
  if (mode === 'upstream-mirror' && packageJson.license !== 'MIT') errors.push(`${dir}: upstream-mirror packages must retain MIT metadata`)
  if (mode === 'little-whale' && packageJson.license !== 'GPL-3.0-or-later') errors.push(`${dir}: Little Whale packages must declare GPL-3.0-or-later`)
  if (mode === 'upstream-mirror' && l?.packageHashes?.[dir] && treeHash(join(ROOT, dir)) !== l.packageHashes[dir]) errors.push(`${dir}: mirror hash differs from upstream/lock.yml`)
}
if (l) {
  for (const dir of l.importedPackages ?? []) if (!existsSync(join(ROOT, dir, 'package.json'))) errors.push(`${dir}: locked package is missing`)
}
const webComposition = readFileSync(join(ROOT, 'packages/bundle/web-app/cordis.patch.yml'), 'utf8')
for (const id of ['llm-deepseek', 'web-search-deepseek', 'session-telemetry-otel']) {
  const row = new RegExp(`- id: ${id}([\\s\\S]*?)(?=\\n- id:|$)`).exec(webComposition)?.[1] ?? ''
  if (!/disabled:\s*true/.test(row)) errors.push(`web composition activates forbidden row ${id}`)
}
const scan = (dir, prefix = '') => {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.git' || name === 'lib' || name === 'dist') continue
    const path = join(dir, name)
    const relativePath = `${prefix}${name}`
    if (statSync(path).isDirectory()) scan(path, `${relativePath}/`)
  }
}
scan(ROOT)
if (errors.length) {
  console.error(errors.map(error => `- ${error}`).join('\n'))
  process.exit(1)
}
console.log(JSON.stringify({ ok: true, canonicalSha: l?.canonicalSha, mirroredPackages: l?.importedPackages?.length ?? 0 }, null, 2))
