/** Models > Behavior row for completion review. */

import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { BooleanSettingRow } from './BooleanSettingRow.tsx'
import type { CompletionCheckerRowFace } from './completion-checker-controller.ts'

/** Full Models > Behavior row props. */
export type CompletionCheckerRowProps =
  PropsRuntime<'settings.models.item'>
  & PropsLocale<'settings.plugins'>
  & InjectFace<CompletionCheckerRowFace>

/** Render the completion-review toggle in Models > Behavior. */
export function CompletionCheckerRow(props: CompletionCheckerRowProps) {
  return (
    <BooleanSettingRow
      {...props}
      useBooleanSetting={selector => props.useCompletionChecker(state => selector({ ...state, value: state.enabled }))}
      titleKey="completionCheckerTitle"
      descriptionKey="completionCheckerDescription"
      fieldKey="completionCheckerEnabled"
      field="enabled"
      id="models-completion-checker-enabled"
    />
  )
}
