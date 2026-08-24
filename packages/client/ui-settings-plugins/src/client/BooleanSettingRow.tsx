/** A General-settings row for one live boolean preference. */

import { useState } from 'react'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { IconChevronDownOutline14 } from '@deepseek-ai/dsh-client-ui-primitives'
import { CheckboxField } from './fields.tsx'
import type { BooleanSettingRowFace } from './boolean-setting-controller.ts'
import type { PluginsSettingsLocaleKey } from './locales.ts'
import css from './LoopDetectionRow.module.css'

/** Full General-settings row props. */
export type BooleanSettingRowProps =
  PropsRuntime<'settings.general.item'>
  & PropsLocale<'settings.plugins'>
  & InjectFace<BooleanSettingRowFace>
  & {
    titleKey: PluginsSettingsLocaleKey
    descriptionKey: PluginsSettingsLocaleKey
    fieldKey: PluginsSettingsLocaleKey
    field: string
    id: string
  }

/** Render one staged boolean preference with the shared save controls. */
export function BooleanSettingRow(props: BooleanSettingRowProps) {
  const { t } = props
  const state = props.useBooleanSetting(snapshot => snapshot)
  const [open, setOpen] = useState(false)
  const enabled = state.value.text === 'on'
  const common = {
    overriddenLabel: t('overridden'),
    resetLabel: t('reset'),
    invalidLabel: t('invalidNumber'),
    disabled: !state.writable,
  }

  return (
    <div className={css.row}>
      <button
        type="button"
        className={css.header}
        aria-expanded={open}
        onClick={() => { setOpen(value => !value) }}
      >
        <span className={css.rowText}>
          <span className={css.title}>{t(props.titleKey)}</span>
          <span className={css.desc}>{t(props.descriptionKey)}</span>
        </span>
        <span className={css.status}>{enabled ? t('completionCheckerOn') : t('completionCheckerOff')}</span>
        <IconChevronDownOutline14 className={css.chevron} />
      </button>
      {open
        ? (
          <div className={css.body}>
            {!state.writable ? <p className={css.readOnly}>{t('readOnly')}</p> : null}
            <CheckboxField
              id={props.id}
              label={t(props.fieldKey)}
              hint={t(props.descriptionKey)}
              {...common}
              {...state.value}
              onEdit={(text) => { props.edit(props.field, text) }}
              onReset={() => { props.resetField(props.field) }}
            />
            <div className={css.footer}>
              {state.failed ? <p className={css.failed}>{t('saveFailed')}</p> : null}
              <button type="button" className={css.discard} disabled={!state.dirty || state.saving} onClick={props.discard}>
                {t('discard')}
              </button>
              <button type="button" className={css.save} disabled={!state.dirty || state.invalid || state.saving} onClick={props.save}>
                {t(state.saving ? 'saving' : 'save')}
              </button>
            </div>
          </div>
        )
        : null}
    </div>
  )
}
