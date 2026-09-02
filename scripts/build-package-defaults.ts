import { globSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'tsdown'

const REPOSITORY_ROOT = fileURLToPath(new URL('../', import.meta.url))

/** Return package directories that use the conventional root build entries. */
function defaultPackageDirs(): string[] {
  return [
    ...globSync('vendor/*/package.json', { cwd: REPOSITORY_ROOT }),
    ...globSync('packages/*/*/package.json', { cwd: REPOSITORY_ROOT }),
  ]
    .map(dirname)
    .map(dir => dir.replaceAll('\\', '/'))
    .filter((dir, index, dirs) => dirs.indexOf(dir) === index)
    .filter(dir => globSync('tsdown.config.*', {
      cwd: join(REPOSITORY_ROOT, dir),
    }).length === 0)
    .sort()
}

const packageDirs = defaultPackageDirs()
if (packageDirs.length === 0) throw new Error('build:defaults: no package-json-only workspace packages found')

for (const dir of packageDirs) {
  const manifest = JSON.parse(readFileSync(resolve(REPOSITORY_ROOT, dir, 'package.json'), 'utf8')) as { name?: unknown }
  if (typeof manifest.name !== 'string') throw new Error(`build:defaults: ${dir}/package.json has no package name`)

  await build({
    config: false,
    cwd: resolve(REPOSITORY_ROOT, dir),
    entry: ['lib/types/{index,invariant,startup}.js'],
    outDir: 'lib',
    format: ['esm'],
    platform: 'node',
    target: 'es2024',
    fixedExtension: false,
    dts: false,
    clean: false,
    name: manifest.name,
  })
}
