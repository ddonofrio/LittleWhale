import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { cleanupClone, cloneCanonical, git, internalDependencies, lock, manifest, packageDirs, ownership, replaceDirectory, ROOT, treeHash, writeYaml } from './common.mjs'

const ref = process.argv[process.argv.indexOf('--ref') + 1]
const allowDirty = process.argv.includes('--allow-dirty')
if (!ref || !/^[0-9a-f]{40}$/i.test(ref)) {
  console.error('Usage: pnpm upstream:sync --ref <immutable-sha> [--allow-dirty]')
  process.exit(2)
}
if (!allowDirty && git(ROOT, ['status', '--porcelain'])) {
  console.error('Refusing to synchronize a dirty worktree. Use --allow-dirty only when product-owned changes are documented.')
  process.exit(2)
}

const m = manifest()
const clone = cloneCanonical(ref)
try {
  if (clone.resolved !== ref) throw new Error(`Resolved ${clone.resolved}, expected ${ref}`)
  const imported = []
  const adapted = []
  for (const dir of packageDirs()) {
    const mode = ownership(dir, m)
    if (mode === 'adapted-upstream' || mode === 'little-whale') {
      if (mode === 'adapted-upstream') adapted.push(dir)
      continue
    }
    const source = join(clone.checkout, dir)
    if (!existsSync(join(source, 'package.json'))) continue
    await replaceDirectory(source, join(ROOT, dir))
    imported.push(dir)
  }
  const hashes = Object.fromEntries(imported.toSorted().map(dir => [dir, treeHash(join(ROOT, dir))]))
  const nextLock = {
    schemaVersion: 1,
    manifestVersion: m.schemaVersion,
    canonicalRepository: m.canonicalRepository,
    canonicalSha: clone.resolved,
    bootstrapRepository: m.bootstrapRepository,
    bootstrapSha: JSON.parse(readFileSync(join(ROOT, 'upstream', 'bootstrap-diff.json'), 'utf8')).bootstrapSha,
    synchronizedAt: new Date().toISOString(),
    importedPackages: imported.toSorted(),
    adaptedPackages: adapted.toSorted(),
    packageHashes: hashes,
    dependencyClosure: Object.fromEntries(imported.toSorted().map(dir => [dir, internalDependencies(dir)])),
  }
  writeYaml(join(ROOT, 'upstream', 'lock.yml'), nextLock)
  writeFileSync(join(ROOT, 'upstream', 'last-update-report.json'), JSON.stringify({ resolvedSha: clone.resolved, imported, adapted, idempotent: true }, null, 2) + '\n')
  console.log(JSON.stringify({ resolvedSha: clone.resolved, imported: imported.length, adapted: adapted.length }, null, 2))
} finally {
  cleanupClone(clone)
}
