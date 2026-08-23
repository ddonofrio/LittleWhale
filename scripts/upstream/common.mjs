import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { cp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import yaml from 'js-yaml'

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
export const MANIFEST_PATH = join(ROOT, 'upstream', 'manifest.yml')
export const LOCK_PATH = join(ROOT, 'upstream', 'lock.yml')

export function manifest() {
  return yaml.load(readFileSync(MANIFEST_PATH, 'utf8'))
}

export function lock() {
  return existsSync(LOCK_PATH) ? yaml.load(readFileSync(LOCK_PATH, 'utf8')) : undefined
}

export function git(cwd, args) {
  const result = spawnSync('git', ['-C', cwd, ...args], { encoding: 'utf8' })
  if (result.status !== 0) throw new Error(result.stderr.trim() || `git ${args.join(' ')} failed`)
  return result.stdout.trim()
}

export function packageDirs(root = ROOT) {
  const result = []
  const visit = (dir, depth = 0) => {
    if (depth > 4 || !existsSync(dir)) return
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'lib') continue
      const path = join(dir, entry.name)
      if (entry.isDirectory()) visit(path, depth + 1)
      else if (entry.name === 'package.json' && relative(root, dir).split(/[\\/]/).length >= 2) result.push(relative(root, dir).replaceAll('\\', '/'))
    }
  }
  visit(root)
  return result.toSorted()
}

export function ownership(path, m = manifest()) {
  const normalized = path.replaceAll('\\', '/')
  const matches = pattern => normalized === pattern || (pattern.endsWith('/*') && normalized.startsWith(pattern.slice(0, -1)))
  if (m.ownership.excluded.some(matches)) return 'excluded'
  if (normalized.startsWith('packages/little-whale/') || m.ownership.littleWhale.some(matches)) return 'little-whale'
  if (m.ownership.adaptedUpstream.some(matches)) return 'adapted-upstream'
  return 'upstream-mirror'
}

export function treeHash(dir) {
  const files = []
  const visit = current => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === 'lib' || entry.name === '.git') continue
      const path = join(current, entry.name)
      if (entry.isDirectory()) visit(path)
      else files.push(path)
    }
  }
  visit(dir)
  const hash = createHash('sha256')
  for (const path of files.toSorted()) {
    hash.update(relative(dir, path).replaceAll('\\', '/') + '\0')
    hash.update(readFileSync(path))
    hash.update('\0')
  }
  return hash.digest('hex')
}

export function cloneCanonical(ref) {
  const dir = mkdtempSync(join(tmpdir(), 'little-whale-upstream-'))
  const checkout = join(dir, 'canonical')
  git(dir, ['clone', '--quiet', '--no-checkout', 'https://github.com/deepseek-ai/deepseek-harness.git', checkout])
  git(checkout, ['checkout', '--quiet', ref])
  const resolved = git(checkout, ['rev-parse', 'HEAD'])
  return { dir, checkout, resolved }
}

export function internalDependencies(packageDir, root = ROOT) {
  const packageJson = JSON.parse(readFileSync(join(root, packageDir, 'package.json'), 'utf8'))
  return Object.entries({ ...packageJson.dependencies, ...packageJson.peerDependencies, ...packageJson.optionalDependencies })
    .filter(([, value]) => String(value).startsWith('workspace:'))
    .map(([name]) => name)
    .toSorted()
}

export function packageNameMap(root = ROOT) {
  return new Map(packageDirs(root).map(dir => [JSON.parse(readFileSync(join(root, dir, 'package.json'), 'utf8')).name, dir]))
}

export function cleanupClone(clone) {
  if (clone?.dir) rmSync(clone.dir, { recursive: true, force: true })
}

export function writeYaml(path, value) {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, yaml.dump(value, { noRefs: true, lineWidth: 120 }))
}

export async function replaceDirectory(source, destination) {
  await rm(destination, { recursive: true, force: true })
  await cp(source, destination, { recursive: true, force: true })
}
