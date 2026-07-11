/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import type { TemplateEntry } from './registry.ts'
import { CrownMeEmail, SITE_URL } from './_layout.tsx'
import { safeOptionalString, safeOptionalNumber, safeOptionalUrl, safeParse, z } from './_validate.ts'

const schema = z.object({
  category: safeOptionalString(),
  rank: safeOptionalNumber(),
  post_url: safeOptionalUrl(),
})

const Email = (raw: unknown) => {
  const { category, rank, post_url } = safeParse(schema, raw)
  const href = post_url || `${SITE_URL}/profile`
  return (
    <CrownMeEmail
      preview="You won the crown — long may you reign."
      heroFile="0b9fe473-88b9-421c-988d-f85743227950/crownme-crown-won-hero.jpg"
      heroAlt="You won the crown on CrownMe"
      heroHref={href}
      heading="You wear the crown."
      paragraphs={[
        <>The court has voted. You took the top spot{category ? ` in ${category}` : ''}{typeof rank === 'number' ? ` at rank #${rank}` : ''}.</>,
        <>Defend your throne — challengers are already rising.</>,
      ]}
      ctaLabel="View My Crown"
      ctaHref={href}
    />
  )
}

export const template = {
  component: Email,
  schema,
  subject: '👑 You won the crown',
  displayName: 'Crown won',
  previewData: { category: 'Style', rank: 1 },
} satisfies TemplateEntry
