/** Composer context-occupancy meter: a ring beside the send button fed by the
 * `contextPressure` projection, with a click-open panel of the heuristic
 * `contextBreakdown` composition (system prompt, tools, conversation).
 * Renders nothing until a provider reports both pressure and a route
 * capacity. */

import { useEffect, useRef, useState } from 'react'
import type { UseProjection } from '@deepseek-ai/dsh-client-runtime/client'
import type { CompactionPolicySettings } from '@deepseek-ai/dsh-compaction-policy/client'
// Type-only: the `contextPressure` / `contextBreakdown` projection key merges.
import type {} from '@deepseek-ai/dsh-token-meter/client'
import { Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ComposerBarProps } from '../contract/slots.ts'
import { contextOccupancy, formatTokens } from '../chat/StatsLine.tsx'
import css from './ContextMeter.module.css'

const DEFAULT_COMPACT_AT_RATIO = 0.75

/** Ring geometry: 14px viewBox, 2px stroke. */
const RADIUS = 5.5
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

/**
 * Marker the localized occupancy sentence is split on, so the panel headline
 * keeps the reading in its own tone while each locale still owns the word
 * order (`45% of context used` / `上下文已用 45%`).
 */
const READING_SLOT = '\u0000'

/** Panel legend rows, in bar-segment order; each color class carries the shared swatch/segment tint. */
const ROWS = [
  { key: 'systemTokens', label: 'context.system', color: css.colorSystem },
  { key: 'toolsTokens', label: 'context.tools', color: css.colorTools },
  { key: 'messageTokens', label: 'context.messages', color: css.colorMessages },
] as const

export interface ContextMeterProps {
  useProjection: UseProjection
  /** The owning bar's locale seat, passed down as a plain prop. */
  t: ComposerBarProps['t']
  /** Current durable global/per-route policy value. */
  policy?: CompactionPolicySettings | undefined
  /** Save the active route's pending override. */
  setOverride?: (provider: string, model: string, ratio: number) => Promise<void>
  /** Remove the active route's override. */
  clearOverride?: (provider: string, model: string) => Promise<void>
}

export function ContextMeter({
  useProjection,
  t,
  policy,
  setOverride = async () => {},
  clearOverride = async () => {},
}: ContextMeterProps) {
  const pressure = useProjection('contextPressure')
  const breakdown = useProjection('contextBreakdown')
  const [open, setOpen] = useState(false)
  const [pendingRatio, setPendingRatio] = useState<number | undefined>(undefined)
  const [saving, setSaving] = useState(false)
  const rootRef = useRef<HTMLSpanElement | null>(null)
  const context = contextOccupancy(pressure)
  const available = context !== null
  const provider = pressure?.provider
  const model = pressure?.model
  const routeKey = provider === undefined || model === undefined ? undefined : `${provider}/${model}`
  const override = provider === undefined || model === undefined
    ? undefined
    : policy?.overrides.find(value => value.provider === provider && value.model === model)
  const effectiveRatio = override?.compactAtRatio ?? policy?.compactAtRatio ?? DEFAULT_COMPACT_AT_RATIO
  const ratio = pendingRatio ?? effectiveRatio

  // A model switch can temporarily remove capacity while this component stays
  // mounted. Close the now-unavailable panel instead of preserving stale UI.
  useEffect(() => {
    if (!available && open) setOpen(false)
  }, [available, open])

  useEffect(() => {
    setPendingRatio(undefined)
  }, [routeKey, effectiveRatio])

  const apply = async (): Promise<void> => {
    if (pendingRatio === undefined || provider === undefined || model === undefined) return
    setSaving(true)
    try {
      await setOverride(provider, model, pendingRatio)
      setPendingRatio(undefined)
    } finally {
      setSaving(false)
    }
  }

  const reset = async (): Promise<void> => {
    if (provider === undefined || model === undefined) return
    setSaving(true)
    try {
      await clearOverride(provider, model)
    } finally {
      setSaving(false)
    }
  }

  // Outside click / Escape close, one document listener while open (Menu's pattern).
  useEffect(() => {
    if (!open || !available) return
    const onPointerDown = (e: PointerEvent): void => {
      if (e.target instanceof Node && rootRef.current?.contains(e.target) === true) return
      setOpen(false)
    }
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [available, open])

  if (context === null) return null
  const percent = context.percent
  const reading = `${percent}%`
  const [headBefore = '', headAfter = ''] = t('context.aria', { percent: READING_SLOT })
    .split(READING_SLOT)
    .map(part => part.trim())

  // The bar's overall length stays the provider-exact percent; the heuristic
  // breakdown only proportions its colored parts. A zero-width part is dropped
  // instead of rendered: `.segment`'s min-width keeps a hairline part visible,
  // which at 0% occupancy would draw a filled bar over an empty context.
  const breakdownTotal = breakdown === undefined
    ? 0
    : breakdown.systemTokens + breakdown.toolsTokens + breakdown.messageTokens
  const parts = breakdown === undefined || breakdownTotal === 0
    ? [{ key: 'total', color: undefined, width: percent }]
    : ROWS.map(row => ({ key: row.key, color: row.color, width: percent * breakdown[row.key] / breakdownTotal }))
  const segments = parts.filter(part => part.width > 0)
  const compactAtTokens = Math.floor(context.contextWindow * ratio)

  return (
    <span ref={rootRef} className={css.root}>
      <Tooltip label={t('context.aria', { percent: reading })} side="top" delayMs={200} disabled={open}>
        <button
          type="button"
          className={css.trigger}
          aria-label={t('context.aria', { percent: reading })}
          aria-haspopup="dialog"
          aria-expanded={open}
          onClick={() => { setOpen(!open) }}
        >
          <svg viewBox="0 0 14 14" width="14" height="14" aria-hidden>
            <circle className={css.track} cx="7" cy="7" r={RADIUS} />
            <circle
              className={css.fill}
              cx="7"
              cy="7"
              r={RADIUS}
              strokeDasharray={`${CIRCUMFERENCE * percent / 100} ${CIRCUMFERENCE}`}
              transform="rotate(-90 7 7)"
            />
          </svg>
        </button>
      </Tooltip>
      {open && (
        <div className={css.panel} role="dialog" aria-label={t('context.used')}>
          <div className={css.header}>
            {/* Empty sides collapse through `.headline:empty` so the locale that
                needs no leading (or trailing) text spends no header gap. */}
            <span className={css.headline}>{headBefore}</span>
            <span className={css.percent}>{reading}</span>
            <span className={css.headline}>{headAfter}</span>
            <span className={css.figures}>
              {`~${formatTokens(context.usedTokens)} / ${formatTokens(context.contextWindow)}`}
            </span>
          </div>
          <div className={css.barShell}>
            <div className={css.bar}>
              {segments.map(segment => (
                <div
                  key={segment.key}
                  className={segment.color === undefined ? css.segment : `${css.segment} ${segment.color}`}
                  style={{ width: `${segment.width}%` }}
                />
              ))}
            </div>
            <span className={css.marker} style={{ left: `${ratio * 100}%` }} aria-hidden />
            <input
              className={css.thresholdInput}
              type="range"
              min={1}
              max={100}
              step={1}
              value={Math.round(ratio * 100)}
              aria-label={t('context.compactAtAria')}
              disabled={provider === undefined || model === undefined || saving}
              onChange={(event) => { setPendingRatio(Number(event.target.value) / 100) }}
            />
          </div>
          <div className={css.thresholdRow}>
            <span>
              <span className={css.thresholdSwatch} aria-hidden />
              {t('context.compactAt')}
            </span>
            <span className={css.thresholdValue}>{`${Math.round(ratio * 100)}% · ~${formatTokens(compactAtTokens)}`}</span>
          </div>
          {breakdown !== undefined && (
            <dl className={css.rows}>
              {ROWS.map(row => (
                <div key={row.key} className={css.row}>
                  <dt>
                    <span className={`${css.swatch} ${row.color}`} aria-hidden />
                    {t(row.label)}
                  </dt>
                  <dd>{`~${formatTokens(breakdown[row.key])}`}</dd>
                </div>
              ))}
            </dl>
          )}
          {(pendingRatio !== undefined || override !== undefined) && provider !== undefined && model !== undefined && (
            <div className={css.actions}>
              {pendingRatio !== undefined && (
                <button type="button" className={css.apply} disabled={saving} onClick={() => { void apply() }}>
                  {t('context.apply')}
                </button>
              )}
              {pendingRatio === undefined && override !== undefined && (
                <button type="button" className={css.reset} disabled={saving} onClick={() => { void reset() }}>
                  {t('context.useGlobal')}
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </span>
  )
}
