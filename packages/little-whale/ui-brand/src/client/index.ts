import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import { LittleWhaleHeroMark, LittleWhaleMark, LittleWhaleName } from './Brand.tsx'

export const inject = ['slots']

/** Install Little Whale occupants after the generic upstream UI declares them. */
export function apply(ctx: ClientContext): void {
  ctx.slots.inject('sidebar.brand.mark', () =>
    ctx.slots.inject('sidebar.brand.name', () =>
      ctx.slots.inject('conversation.hero.brand.mark', function* () {
        yield ctx.slots.register({ name: 'sidebar.brand.mark' }, LittleWhaleMark)
        yield ctx.slots.register({ name: 'sidebar.brand.name' }, LittleWhaleName)
        yield ctx.slots.register({ name: 'conversation.hero.brand.mark' }, LittleWhaleHeroMark)
      })))
}
