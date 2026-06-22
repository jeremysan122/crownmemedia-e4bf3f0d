/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import type { TemplateEntry } from './registry.ts'
import { CrownMeEmail, SITE_URL } from './_layout.tsx'
import { safeOptionalNumber, safeOptionalString, safeParse, z } from './_validate.ts'

const schema = z.object({
  first_name: safeOptionalString(),
  votes: safeOptionalNumber(),
  crowns: safeOptionalNumber(),
  best_category: safeOptionalString(),
  best_rank: safeOptionalNumber(),
})

const Email = (raw: unknown) => {
  const { first_name, votes, crowns, best_category, best_rank } = safeParse(schema, raw)
  const crownCount = typeof crowns === 'number' ? crowns : 0
  return (
    <CrownMeEmail
      preview="Your weekly reign — the court's recap."
      heroFile="crownme-weekly-recap-full-design.png"
      heroAlt="Your CrownMe weekly recap"
      heroHref={`${SITE_URL}/profile`}
      heading={`Your week in the court${first_name ? `, ${first_name}` : ''}.`}
      paragraphs={[
        <>
          This week you earned{' '}
          <strong>{typeof votes === 'number' ? votes.toLocaleString() : '0'} votes</strong> and{' '}
          <strong>{crownCount} crown{crownCount === 1 ? '' : 's'}</strong>.
        </>,
        best_category
          ? <>Your strongest stage was <strong>{best_category}</strong>{typeof best_rank === 'number' ? <>, peaking at rank #{best_rank}</> : ''}.</>
          : <>Post more often to climb higher next week.</>,
      ]}
      ctaLabel="View My Throne"
      ctaHref={`${SITE_URL}/profile`}
    />
  )
}

export const template = {
  component: Email,
  schema,
  subject: 'Your CrownMe weekly recap 👑',
  displayName: 'Weekly recap',
  previewData: { first_name: 'Alex', votes: 1240, crowns: 2, best_category: 'Style', best_rank: 3 },
} satisfies TemplateEntry
