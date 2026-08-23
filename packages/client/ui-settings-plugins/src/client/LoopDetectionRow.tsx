/** General Settings row for the agent's LLM loop recovery policy. */

import { useState } from 'react'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { IconChevronDownOutline14 } from '@deepseek-ai/dsh-client-ui-primitives'
import { CheckboxField, SelectField, TextAreaField, ValueField } from './fields.tsx'
import type { LoopDetectionRowFace } from './agent-loop-card-controller.ts'
import type { PluginsSettingsLocaleKey } from './locales.ts'
import css from './LoopDetectionRow.module.css'

/** Full General-settings row props. */
export type LoopDetectionRowProps =
  PropsRuntime<'settings.general.item'>
  & PropsLocale<'settings.plugins'>
  & InjectFace<LoopDetectionRowFace>

/** Render the loop policy below the Composer busy-Enter preference. */
export function LoopDetectionRow(props: LoopDetectionRowProps) {
  const { t } = props
  const state = props.useLoopDetection(snapshot => snapshot)
  const [open, setOpen] = useState(false)
  const enabled = state.enabled.text === 'on'
  const field = (key: PluginsSettingsLocaleKey) => t(key)
  const selectedStreams = [state.detectOnText, state.detectOnReasoning, state.detectOnToolCall]
    .filter(value => value.text === 'on').length
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
          <span className={css.title}>{field('loopDetectionTitle')}</span>
          <span className={css.desc}>{field('loopDetectionDescription')}</span>
        </span>
        <span className={css.status}>{enabled ? field('loopDetectionOn') : field('loopDetectionOff')}</span>
        <IconChevronDownOutline14 className={css.chevron} />
      </button>
      {open
        ? (
          <div className={css.body}>
            {!state.writable ? <p className={css.readOnly}>{t('readOnly')}</p> : null}
            <SelectField
              id="general-loop-detection-enabled"
              label={field('loopDetectionEnabled')}
              hint={field('loopDetectionDescription')}
              options={[
                { value: 'off', label: field('loopDetectionOff') },
                { value: 'on', label: field('loopDetectionOn') },
              ]}
              {...common}
              {...state.enabled}
              onEdit={(text) => { props.edit('loopDetectionEnabled', text) }}
              onReset={() => { props.resetField('loopDetectionEnabled') }}
            />
            {enabled
              ? (
                <>
                  <p className={css.streamHeading}>{field('loopDetectionDetectOn')}</p>
                  <CheckboxField
                    id="general-loop-detection-text"
                    label={field('loopDetectionDetectOnText')}
                    hint={field('loopDetectionDetectOnTextHint')}
                    {...common}
                    {...state.detectOnText}
                    disabled={common.disabled || (selectedStreams === 1 && state.detectOnText.text === 'on')}
                    onEdit={(text) => { props.edit('loopDetectionDetectOnText', text) }}
                    onReset={() => { props.resetField('loopDetectionDetectOnText') }}
                  />
                  <CheckboxField
                    id="general-loop-detection-reasoning"
                    label={field('loopDetectionDetectOnReasoning')}
                    hint={field('loopDetectionDetectOnReasoningHint')}
                    {...common}
                    {...state.detectOnReasoning}
                    disabled={common.disabled || (selectedStreams === 1 && state.detectOnReasoning.text === 'on')}
                    onEdit={(text) => { props.edit('loopDetectionDetectOnReasoning', text) }}
                    onReset={() => { props.resetField('loopDetectionDetectOnReasoning') }}
                  />
                  <CheckboxField
                    id="general-loop-detection-tool-call"
                    label={field('loopDetectionDetectOnToolCall')}
                    hint={field('loopDetectionDetectOnToolCallHint')}
                    {...common}
                    {...state.detectOnToolCall}
                    disabled={common.disabled || (selectedStreams === 1 && state.detectOnToolCall.text === 'on')}
                    onEdit={(text) => { props.edit('loopDetectionDetectOnToolCall', text) }}
                    onReset={() => { props.resetField('loopDetectionDetectOnToolCall') }}
                  />
                  {state.detectOnToolCall.text === 'on'
                    ? (
                      <div className={css.toolCallChildren}>
                        <ValueField
                          id="general-loop-detection-max-tool-call-detections"
                          label={field('loopDetectionMaxToolCallDetections')}
                          hint={field('loopDetectionMaxToolCallDetectionsHint')}
                          numeric
                          {...common}
                          {...state.maxToolCallDetections}
                          onEdit={(text) => { props.edit('loopDetectionMaxToolCallDetections', text) }}
                          onReset={() => { props.resetField('loopDetectionMaxToolCallDetections') }}
                        />
                        <TextAreaField
                          id="general-loop-detection-tool-call-first-prompt"
                          label={field('loopDetectionToolCallFirstPrompt')}
                          hint={field('loopDetectionToolCallPromptHint')}
                          {...common}
                          {...state.toolCallFirstPrompt}
                          onEdit={(text) => { props.edit('loopDetectionToolCallFirstPrompt', text) }}
                          onReset={() => { props.resetField('loopDetectionToolCallFirstPrompt') }}
                        />
                        <TextAreaField
                          id="general-loop-detection-tool-call-second-prompt"
                          label={field('loopDetectionToolCallSecondPrompt')}
                          hint={field('loopDetectionToolCallPromptHint')}
                          {...common}
                          {...state.toolCallSecondPrompt}
                          onEdit={(text) => { props.edit('loopDetectionToolCallSecondPrompt', text) }}
                          onReset={() => { props.resetField('loopDetectionToolCallSecondPrompt') }}
                        />
                        <TextAreaField
                          id="general-loop-detection-tool-call-third-prompt"
                          label={field('loopDetectionToolCallThirdPrompt')}
                          hint={field('loopDetectionToolCallPromptHint')}
                          {...common}
                          {...state.toolCallThirdPrompt}
                          onEdit={(text) => { props.edit('loopDetectionToolCallThirdPrompt', text) }}
                          onReset={() => { props.resetField('loopDetectionToolCallThirdPrompt') }}
                        />
                      </div>
                    )
                    : null}
                  <SelectField
                    id="general-loop-detection-include"
                    label={field('loopDetectionIncludeLoop')}
                    hint={field('loopDetectionPromptHint')}
                    options={[
                      { value: 'on', label: field('loopDetectionYes') },
                      { value: 'off', label: field('loopDetectionNo') },
                    ]}
                    {...common}
                    {...state.includeLoop}
                    onEdit={(text) => { props.edit('loopDetectionIncludeLoop', text) }}
                    onReset={() => { props.resetField('loopDetectionIncludeLoop') }}
                  />
                  <ValueField
                    id="general-loop-detection-min-tokens"
                    label={field('loopDetectionMinTokens')}
                    hint={field('loopDetectionMinTokensHint')}
                    numeric
                    {...common}
                    {...state.minTokens}
                    onEdit={(text) => { props.edit('loopDetectionMinTokens', text) }}
                    onReset={() => { props.resetField('loopDetectionMinTokens') }}
                  />
                  <TextAreaField
                    id="general-loop-detection-first-prompt"
                    label={field('loopDetectionFirstPrompt')}
                    hint={field('loopDetectionPromptHint')}
                    {...common}
                    {...state.firstPrompt}
                    onEdit={(text) => { props.edit('loopDetectionFirstPrompt', text) }}
                    onReset={() => { props.resetField('loopDetectionFirstPrompt') }}
                  />
                  <TextAreaField
                    id="general-loop-detection-second-prompt"
                    label={field('loopDetectionSecondPrompt')}
                    hint={field('loopDetectionPromptHint')}
                    {...common}
                    {...state.secondPrompt}
                    onEdit={(text) => { props.edit('loopDetectionSecondPrompt', text) }}
                    onReset={() => { props.resetField('loopDetectionSecondPrompt') }}
                  />
                  <TextAreaField
                    id="general-loop-detection-third-prompt"
                    label={field('loopDetectionThirdPrompt')}
                    hint={field('loopDetectionPromptHint')}
                    {...common}
                    {...state.thirdPrompt}
                    onEdit={(text) => { props.edit('loopDetectionThirdPrompt', text) }}
                    onReset={() => { props.resetField('loopDetectionThirdPrompt') }}
                  />
                  <CheckboxField
                    id="general-loop-detection-compact-before-failing"
                    label={field('loopDetectionCompactBeforeFailing')}
                    hint={field('loopDetectionCompactBeforeFailingHint')}
                    {...common}
                    {...state.compactBeforeFailing}
                    onEdit={(text) => { props.edit('loopDetectionCompactBeforeFailing', text) }}
                    onReset={() => { props.resetField('loopDetectionCompactBeforeFailing') }}
                  />
                </>
              )
              : null}
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
