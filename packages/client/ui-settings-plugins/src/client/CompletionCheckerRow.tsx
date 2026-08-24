/** General Settings row for completion review. */

import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { BooleanSettingRow } from './BooleanSettingRow.tsx'
import type { CompletionCheckerRowFace } from './completion-checker-controller.ts'

/** Full General-settings row props. */
export type CompletionCheckerRowProps =
  PropsRuntime<'settings.general.item'>
  & PropsLocale<'settings.plugins'>
  & InjectFace<CompletionCheckerRowFace>

/** Render the completion-review toggle in General settings. */
export function CompletionCheckerRow(props: CompletionCheckerRowProps) {
  return (
    <BooleanSettingRow
      {...props}
      useBooleanSetting={selector => props.useCompletionChecker(state => selector({ ...state, value: state.enabled }))}
      titleKey="completionCheckerTitle"
      descriptionKey="completionCheckerDescription"
      fieldKey="completionCheckerEnabled"
      field="enabled"
      id="general-completion-checker-enabled"
    />
  )
}
