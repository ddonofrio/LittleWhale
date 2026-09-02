/** Run assembled Web snapshots serially. */
import { spawn } from 'node:child_process'
import { pnpmInvocation } from './pnpm-invocation.ts'

const invocation = pnpmInvocation(['exec', 'vitest', 'run', '--config', 'vitest.web.config.ts'])
process.exitCode = await run(invocation.command, invocation.args)

function run(command: string, args: string[]): Promise<number> {
  return new Promise((resolveRun, reject) => {
    const child = spawn(command, args, { stdio: 'inherit' })
    child.once('error', reject)
    child.once('exit', (exitCode, signalCode) => {
      if (signalCode !== null) {
        console.error(`web snapshots terminated by ${signalCode}`)
        resolveRun(1)
        return
      }
      resolveRun(exitCode ?? 1)
    })
  })
}
