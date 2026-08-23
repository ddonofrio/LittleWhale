import { cleanupClone, cloneCanonical, internalDependencies, manifest, packageDirs, ownership, ROOT, treeHash } from './common.mjs'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

const ref = process.argv[process.argv.indexOf('--ref') + 1]
if (!ref || ref.startsWith('--')) {
  console.error('Usage: pnpm upstream:plan --ref <commit-or-tag>')
  process.exit(2)
}

const m = manifest()
const clone = cloneCanonical(ref)
try {
  const changes = []
  for (const dir of packageDirs()) {
    if (ownership(dir, m) !== 'upstream-mirror') continue
    const upstreamDir = join(clone.checkout, dir)
    if (!existsSync(join(upstreamDir, 'package.json'))) continue
    const currentHash = treeHash(join(ROOT, dir))
    const upstreamHash = treeHash(upstreamDir)
    if (currentHash !== upstreamHash) changes.push({ package: dir, currentHash, upstreamHash })
  }
  const forbidden = []
  for (const dir of packageDirs(clone.checkout)) {
    const packageJson = join(clone.checkout, dir, 'package.json')
    const text = await import('node:fs/promises').then(fs => fs.readFile(packageJson, 'utf8'))
    if (m.forbiddenActiveIdentifiers.some(id => text.includes(id))) forbidden.push(dir)
  }
  const report = {
    resolvedSha: clone.resolved,
    packagesThatWouldChange: changes,
    adaptedPackagesTouched: packageDirs().filter(dir => ownership(dir, m) === 'adapted-upstream' && changes.some(change => change.package === dir)),
    forbiddenIdentifiersInUpstreamPackageMetadata: forbidden,
    dependencyClosure: packageDirs().map(dir => ({ package: dir, workspaceDependencies: internalDependencies(dir) })),
    productOwnedPathsAffected: [],
    readOnly: true,
  }
  console.log(JSON.stringify(report, null, 2))
} finally {
  cleanupClone(clone)
}
