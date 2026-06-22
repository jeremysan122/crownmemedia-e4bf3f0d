/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import type { TemplateEntry } from './registry.ts'
import { CrownMeEmail, SITE_URL } from './_layout.tsx'
import { safeOptionalString, safeOptionalUrl, safeParse, z } from './_validate.ts'

const schema = z.object({
  battle_url: safeOptionalUrl(),
  opponent_username: safeOptionalString(),
})

const Email = (raw: unknown) => {
  const { battle_url, opponent_username } = safeParse(schema, raw)
  const href = battle_url || `${SITE_URL}/battles`
  return (
    <CrownMeEmail
      preview="Your battle has begun — rally the court."
      heroFile="crownme-battle-started-full-design.png"
      heroAlt="CrownMe battle has begun"
      heroHref={href}
      heading="The battle has begun."
      paragraphs={[
        <>Voting is now open{opponent_username ? <> against @{opponent_username}</> : ''}. The crown goes to whoever rallies the loudest court.</>,
        <>Share your battle link — every vote shifts the throne.</>,
      ]}
      ctaLabel="Open Battle"
      ctaHref={href}
    />
  )
}

export const template = {
  component: Email,
  schema,
  subject: 'Your battle has begun ⚔️',
  displayName: 'Battle started',
  previewData: { opponent_username: 'crown_hunter' },
} satisfies TemplateEntry
