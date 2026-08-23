export const ROOT: string
export const MANIFEST_PATH: string
export const LOCK_PATH: string
export function manifest(): unknown
export function lock(): unknown
export function git(cwd: string, args: string[]): string
export function packageDirs(root?: string): string[]
export function ownership(path: string, manifest?: unknown): string
export function treeHash(dir: string): string
export function cloneCanonical(ref: string): { dir: string; checkout: string; resolved: string }
export function internalDependencies(packageDir: string, root?: string): string[]
export function packageNameMap(root?: string): Map<string, string>
export function cleanupClone(clone: { dir: string }): void
export function writeYaml(path: string, value: unknown): void
export function replaceDirectory(source: string, destination: string): Promise<void>
