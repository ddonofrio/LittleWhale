// Shared plumbing for the assembled Web snapshots.
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

/** The built page under test; `pnpm run test:web` rebuilds it before running. */
export const DIST_INDEX = fileURLToPath(new URL('../dist/index.html', import.meta.url))

export const REPO_ROOT = fileURLToPath(new URL('../../..', import.meta.url))

/** Fail loud on a stale checkout instead of testing yesterday's bundle. */
export function requireDist(): void {
  if (!existsSync(DIST_INDEX)) {
    throw new Error('web app dist not built — run `pnpm run build` from the repository root (`pnpm run test:web` does this first)')
  }
}
