/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import type { TemplateEntry } from './registry.ts'
import { CrownMeEmail, SITE_URL } from './_layout.tsx'

interface Props {
  first_name?: string
  votes?: number
  crowns?: number
  best_category?: string
  best_rank?: number
}

const Email = ({ first_name, votes, crowns, best_category, best_rank }: Props) => (
  <CrownMeEmail
    preview="Your weekly reign — the court's recap."
    heroFile="crownme-weekly-recap-full-design.png"
    heroAlt="Your CrownMe weekly recap"
    heroHref={`${SITE_URL}/profile`}
    heading={`Your week in the court${first_name ? `, ${first_name}` : ''}.`}
    paragraphs={[
      <>
        This week you earned{' '}
        <strong>{votes?.toLocaleString() ?? '—'} votes</strong> and{' '}
        <strong>{crowns ?? 0} crown{crowns === 1 ? '' : 's'}</strong>.
      </>,
      best_category
        ? <>Your strongest stage was <strong>{best_category}</strong>{best_rank ? <>, peaking at rank #{best_rank}</> : ''}.</>
        : <>Post more often to climb higher next week.</>,
    ]}
    ctaLabel="View My Throne"
    ctaHref={`${SITE_URL}/profile`}
  />
)

export const template = {
  component: Email,
  subject: 'Your CrownMe weekly recap 👑',
  displayName: 'Weekly recap',
  previewData: { first_name: 'Alex', votes: 1240, crowns: 2, best_category: 'Style', best_rank: 3 },
} satisfies TemplateEntry
