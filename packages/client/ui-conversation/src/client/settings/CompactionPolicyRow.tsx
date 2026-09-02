/** Models > Behavior row for the global automatic-compaction threshold. */

import { useState } from 'react'
import type { ObservableSnapshot } from '@deepseek-ai/dsh-client-runtime/client'
import type { CompactionPolicySettings } from '@deepseek-ai/dsh-compaction-policy/client'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import css from './CompactionPolicyRow.module.css'

const DEFAULT_COMPACT_AT_RATIO = 0.75

/** Registration-side face for the global policy row. */
export interface CompactionPolicyRowInjected {
  hooks: { settings: ObservableSnapshot<CompactionPolicySettings | undefined> }
  setGlobalRatio: (ratio: number) => void
}

/** Full Models > Behavior row props. */
export type CompactionPolicyRowProps =
  PropsRuntime<'settings.models.item'>
  & PropsLocale<'conversation'>
  & InjectFace<CompactionPolicyRowInjected>

function percent(ratio: number): number {
  return Math.round(ratio * 100)
}

/** Render and apply the global compaction threshold. */
export function CompactionPolicyRow({ useSettings, setGlobalRatio, t }: CompactionPolicyRowProps) {
  const settings = useSettings(value => value)
  const current = settings?.compactAtRatio ?? DEFAULT_COMPACT_AT_RATIO
  const [draft, setDraft] = useState<number | undefined>(undefined)
  const selected = draft ?? current

  return (
    <div className={css.row}>
      <div className={css.rowText}>
        <div className={css.title}>{t('settings.compaction.title')}</div>
        <div className={css.desc}>{t('settings.compaction.description')}</div>
      </div>
      <div className={css.control}>
        <output className={css.value}>{percent(selected)}%</output>
        <input
          className={css.range}
          type="range"
          min={1}
          max={100}
          step={1}
          value={percent(selected)}
          aria-label={t('settings.compaction.aria')}
          onChange={(event) => { setDraft(Number(event.target.value) / 100) }}
        />
        {draft !== undefined && (
          <button
            type="button"
            className={css.apply}
            onClick={() => {
              setGlobalRatio(draft)
              setDraft(undefined)
            }}
          >
            {t('context.apply')}
          </button>
        )}
      </div>
    </div>
  )
}
