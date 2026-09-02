/** Settings controller shared by the two Models > Behavior boolean preferences. */

import type { SettingsScope, SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import { booleanField, CardForm, type CardActions, type CardFieldState, type CardShell } from './card-form.ts'

/** The one boolean field edited by the shared row. */
export interface BooleanSetting {
  [field: string]: boolean | undefined
}

/** State rendered by a Models > Behavior boolean row. */
export interface BooleanSettingRowState extends CardShell {
  value: CardFieldState
}

/** Registration-side face for a Models > Behavior boolean row. */
export interface BooleanSettingRowFace extends CardActions {
  hooks: {
    booleanSetting: SnapshotStore<BooleanSettingRowState>
  }
}

/** Bridge a boolean settings namespace onto the shared Models > Behavior row. */
export class BooleanSettingRowController {
  private readonly form: CardForm<BooleanSetting>
  private readonly store: SnapshotStore<BooleanSettingRowState>

  /** @param scope - the bound settings scope for one boolean preference. */
  constructor(scope: SettingsScope<BooleanSetting>, private readonly field: string) {
    this.form = new CardForm(scope, [booleanField(field)])
    this.store = this.form.bind(() => this.projection())
  }

  private projection(): BooleanSettingRowState {
    return { ...this.form.shell(), value: this.form.field(this.field) }
  }

  /**
   * Build the row face consumed by the slot registration.
   * @returns the snapshot store and staged form actions.
   */
  inject(): BooleanSettingRowFace {
    return { hooks: { booleanSetting: this.store }, ...this.form.actions() }
  }
}
