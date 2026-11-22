import type { ReactNode } from 'react'
import { PageHero } from './PageHero'

export interface PageIntroProps {
  /** The page's only h1. */
  title: string
  lead: ReactNode
  actions?: ReactNode
  aside?: ReactNode
}

/** The opening of every page except the home page and the product pages. */
export function PageIntro({ title, lead, actions, aside }: PageIntroProps) {
  return (
    <PageHero
      title={title}
      lead={lead}
      {...(actions ? { actions } : {})}
      {...(aside ? { aside } : {})}
    />
  )
}
