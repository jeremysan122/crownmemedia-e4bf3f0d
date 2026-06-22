/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import type { TemplateEntry } from './registry.ts'
import { CrownMeEmail, SITE_URL } from './_layout.tsx'
import { safeOptionalNumber, safeOptionalUrl, safeParse, z } from './_validate.ts'

const schema = z.object({
  battle_url: safeOptionalUrl(),
  hours_left: safeOptionalNumber(),
})

const Email = (raw: unknown) => {
  const { battle_url, hours_left } = safeParse(schema, raw)
  const href = battle_url || `${SITE_URL}/battles`
  return (
    <CrownMeEmail
      preview="Your battle ends soon — the throne is still in play."
      heroFile="crownme-battle-ending-soon-full-design.png"
      heroAlt="CrownMe battle ending soon"
      heroHref={href}
      heading="Final hours."
      paragraphs={[
        <>Your battle ends{typeof hours_left === 'number' && hours_left > 0 ? ` in ${hours_left} hours` : ' soon'}. Every vote in these last hours weighs heaviest.</>,
        <>Rally your tribe — close ones are won at the wire.</>,
      ]}
      ctaLabel="Push for Victory"
      ctaHref={href}
    />
  )
}

export const template = {
  component: Email,
  schema,
  subject: '⏳ Your battle ends soon',
  displayName: 'Battle ending soon',
  previewData: { hours_left: 6 },
} satisfies TemplateEntry
