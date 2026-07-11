/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import type { TemplateEntry } from './registry.ts'
import { CrownMeEmail, SITE_URL } from './_layout.tsx'
import { safeOptionalString, safeParse, z } from './_validate.ts'

const schema = z.object({
  category: safeOptionalString(),
  rival_username: safeOptionalString(),
})

const Email = (raw: unknown) => {
  const { category, rival_username } = safeParse(schema, raw)
  return (
    <CrownMeEmail
      preview="A challenger has taken your crown."
      heroFile="929930d7-8057-4d1c-a439-cbd892b273f9/crownme-dethroned-hero.jpg"
      heroAlt="You have been dethroned on CrownMe"
      heroHref={SITE_URL}
      heading="A challenger took your crown."
      paragraphs={[
        <>{rival_username ? <>@{rival_username}</> : 'A new ruler'} just claimed the top spot{category ? ` in ${category}` : ''}.</>,
        <>Post a new entry and rally your tribe — the crown is never out of reach.</>,
      ]}
      ctaLabel="Reclaim My Throne"
      ctaHref={`${SITE_URL}/upload`}
    />
  )
}

export const template = {
  component: Email,
  schema,
  subject: 'You have been dethroned',
  displayName: 'Dethroned',
  previewData: { category: 'Style', rival_username: 'crown_hunter' },
} satisfies TemplateEntry
