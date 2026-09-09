/** Composer controls for master-model review. */
import { useEffect, useId, useRef, useState, useSyncExternalStore } from 'react'
import clsx from 'clsx'
import type { ModelProviderGroup, ModelSelection, SessionId } from '@deepseek-ai/dsh-api-remotes/client'
import type { InjectFace, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { SettingsScope } from '@deepseek-ai/dsh-client-runtime/client'
import { IconCheckOutline16, IconChevronDownOutline14, IconCloseFill14 } from '@deepseek-ai/dsh-client-ui-primitives'
import css from './MasterModelSelect.module.css'

interface MasterSettings {
  enabled?: boolean
  masterProvider?: string
  masterModel?: string
}
export interface MasterSessionState {
  isDisabled(sessionId: SessionId): boolean
  subscribe(listener: () => void): () => void
  disable(sessionId: SessionId): void
}
export interface MasterModelSelectFace {
  settings: SettingsScope<MasterSettings>
  sessionState: MasterSessionState
  loadModels: () => Promise<{ groups: readonly ModelProviderGroup[]; student: ModelSelection }>
  setBlocked: (reason?: string) => void
}
type Props = PropsRuntime<'conversation.input.masterModel'> & InjectFace<MasterModelSelectFace>

function compactModelName(name: string): string {
  return name.length > 21 ? `${name.slice(0, 18)}...` : name
}

export function MasterModelSelect({ locked, settings, sessionState, loadModels, setBlocked, sessionId }: Props) {
  const snapshot = useSyncExternalStore(
    settings.subscribe.bind(settings), settings.getSnapshot.bind(settings), settings.getSnapshot.bind(settings),
  )
  const disabledForChat = useSyncExternalStore(
    sessionState.subscribe.bind(sessionState), () => sessionState.isDisabled(sessionId), () => sessionState.isDisabled(sessionId),
  )
  const [groups, setGroups] = useState<readonly ModelProviderGroup[]>([])
  const [student, setStudent] = useState<ModelSelection | null>(null)
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const id = useId()
  const refresh = () => {
    void loadModels().then((result) => { setGroups(result.groups); setStudent(result.student) })
  }
  useEffect(refresh, [loadModels])
  useEffect(() => {
    if (!open) return
    refresh()
    const close = (event: MouseEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open, loadModels])
  const value = snapshot.value
  const same = student !== null && value?.masterProvider === student.provider && value.masterModel === student.model
  useEffect(() => {
    setBlocked(value?.enabled === true && !disabledForChat && (!value.masterProvider || !value.masterModel || same)
      ? 'Select a master model different from the student model before sending.' : undefined)
    return () => setBlocked(undefined)
  }, [disabledForChat, same, setBlocked, value?.enabled, value?.masterModel, value?.masterProvider])
  if (value?.enabled !== true || disabledForChat) return null
  const selected = groups
    .flatMap(group => group.models.map(model => ({ group, model })))
    .find(choice => choice.group.id === value.masterProvider && choice.model.id === value.masterModel)
  const selectedName = selected?.model.name
  return <div ref={root} className={css.root}>
    <button type="button" className={css.trigger} aria-label="Master model" title={selectedName} aria-haspopup="menu" aria-expanded={open} disabled={locked} onClick={() => setOpen(current => !current)}>
      <span className={css.triggerLabel}>{selectedName === undefined ? 'Select model' : compactModelName(selectedName)}</span><IconChevronDownOutline14 className={clsx(css.chevron, open && css.chevronOpen)} />
    </button>
    {open && <div id={`${id}-menu`} className={css.menu} role="menu" aria-label="Master model"><div className={clsx(css.groups, 'scrollable')}>
      {groups.map(group => <section role="group" aria-label={group.name} className={css.group} key={group.id}><div className={css.groupTitle}>{group.name}</div>
        {group.models.map((model) => {
          const current = value.masterProvider === group.id && value.masterModel === model.id
          const disabled = student?.provider === group.id && student.model === model.id
          return <button type="button" role="menuitemradio" aria-checked={current} className={clsx(css.option, current && css.selected)} key={model.id} disabled={disabled} onClick={() => { void settings.set('masterProvider', group.id).then(() => settings.set('masterModel', model.id)); setOpen(false) }}><span><span className={css.modelName}>{model.name}</span>{model.description && <span className={css.description}>{model.description}</span>}</span><span className={css.check}>{current && <IconCheckOutline16 />}</span></button>
        })}
      </section>)}
    </div></div>}
  </div>
}

export function MasterChip({ settings, sessionState, sessionId, onDisable }: {
  sessionId: SessionId
  settings: SettingsScope<MasterSettings>
  sessionState: MasterSessionState
  onDisable: (sessionId: SessionId) => Promise<void>
}) {
  const snapshot = useSyncExternalStore(
    settings.subscribe.bind(settings), settings.getSnapshot.bind(settings), settings.getSnapshot.bind(settings),
  )
  const disabledForChat = useSyncExternalStore(
    sessionState.subscribe.bind(sessionState), () => sessionState.isDisabled(sessionId), () => sessionState.isDisabled(sessionId),
  )
  if (snapshot.value?.enabled !== true || disabledForChat) return null
  return <span className={css.chipWrap}><button type="button" className={css.chip} aria-label="Disable Master for this chat" onClick={() => { sessionState.disable(sessionId); void onDisable(sessionId) }}>Master<span className={css.close} aria-hidden><IconCloseFill14 size={12} /></span></button></span>
}
