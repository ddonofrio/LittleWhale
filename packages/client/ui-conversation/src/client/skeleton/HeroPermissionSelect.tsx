import type { PermissionSelect as PermissionSelectValue } from '@deepseek-ai/dsh-permission-presets/client'
import type { ComposerBarProps } from '../contract/slots.ts'
import { PermissionSelect } from './PermissionSelect.tsx'

interface HeroPermissionSelectProps {
  useProjection: ComposerBarProps['useProjection']
  command: (line: string) => Promise<boolean>
  t: ComposerBarProps['t']
}

/** Current-session access control hosted beside the hero workspace and preset selectors. */
export function HeroPermissionSelect({ useProjection, command, t }: HeroPermissionSelectProps) {
  const value = useProjection('permissions') as PermissionSelectValue | undefined
  if (value === undefined) return null
  return <PermissionSelect value={value} locked={false} command={command} t={t} />
}
