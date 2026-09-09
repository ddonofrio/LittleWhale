import { useState, useSyncExternalStore } from 'react'
import type { SettingsScope } from '@deepseek-ai/dsh-client-runtime/client'
import type { SessionId } from '@deepseek-ai/dsh-client-runtime/client'
import { IconCloseFill14 } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import css from './AutomationChip.module.css'

export interface AutomationChipProps {
  sessionId: SessionId
  scope: SettingsScope<{ enabled?: boolean }>
  disabledSessions: Set<SessionId>
  label: string
  tone: 'orange' | 'purple'
  onDisable: (sessionId: SessionId) => Promise<void>
}

export type AutomationChipSlotProps = PropsRuntime<'conversation.input.left'> & Omit<AutomationChipProps, 'sessionId'>

export function AutomationChip({ sessionId, scope, disabledSessions, label, tone, onDisable }: AutomationChipProps) {
  const snapshot = useSyncExternalStore(scope.subscribe.bind(scope), scope.getSnapshot.bind(scope), scope.getSnapshot.bind(scope))
  const [closed, setClosed] = useState(false)
  if (snapshot.value?.enabled !== true || disabledSessions.has(sessionId) || closed) return null
  return <span className={`${css.wrap} ${tone === 'orange' ? css.orange : css.purple}`} data-testid={`automation-${tone}-chip`}>
    <button type="button" className={css.chip} aria-label={`Disable ${label} for this chat`} onClick={() => { setClosed(true); void onDisable(sessionId) }}>
      {label}<span className={css.close} aria-hidden><IconCloseFill14 size={12} /></span>
    </button>
  </span>
}
