/** Behavior preference rows contributed by their owning feature plugins. */

import type { PropsRenderSlots, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import css from './ModelsBehaviorTab.module.css'

/** Props delivered by the Models tab slot. */
export type ModelsBehaviorTabProps =
  PropsRuntime<'settings.models.tab'>
  & PropsRenderSlots<'settings.models.item'>

/** Render all behavior settings registered by the active composition. */
export function ModelsBehaviorTab({ renderSlot }: ModelsBehaviorTabProps) {
  return (
    <div className={css.rows}>
      {renderSlot('settings.models.item', {})}
    </div>
  )
}
