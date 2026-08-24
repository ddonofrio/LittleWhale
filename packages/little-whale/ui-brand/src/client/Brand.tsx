import type { HeroBrandMarkOwnerProps } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { SidebarBrandMarkOwnerProps, SidebarBrandNameOwnerProps } from '@deepseek-ai/dsh-client-ui-sidebar/client'

type MarkProps = HeroBrandMarkOwnerProps & SidebarBrandMarkOwnerProps

const imageStyle = {
  display: 'block',
  objectFit: 'contain',
} as const

/** The supplied whale-only artwork for compact brand surfaces. */
export function LittleWhaleMark({ size, className }: MarkProps) {
  return <img src="/little-whale-logo.png" width={size} height={size} className={className} style={imageStyle} alt="" aria-hidden="true" />
}

/** The supplied combined artwork for the first empty-chat hero. */
export function LittleWhaleHeroMark({ size, className }: HeroBrandMarkOwnerProps) {
  return <img src="/little-whale-logo-text.png" width={size * 2.87} height={size} className={className} style={imageStyle} alt="Little Whale" />
}

/** The supplied text-only artwork for the expanded sidebar wordmark. */
export function LittleWhaleName(_props: SidebarBrandNameOwnerProps) {
  return <img src="/little-whale-text.png" width={82} height={24} style={imageStyle} alt="Little Whale" />
}
