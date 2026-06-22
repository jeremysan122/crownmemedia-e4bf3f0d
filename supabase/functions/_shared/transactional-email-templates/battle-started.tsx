/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import type { TemplateEntry } from './registry.ts'
import { CrownMeEmail, SITE_URL } from './_layout.tsx'

interface Props { battle_url?: string; opponent_username?: string }

const Email = ({ battle_url, opponent_username }: Props) => (
  <CrownMeEmail
    preview="Your battle has begun — rally the court."
    heroFile="crownme-battle-started-full-design.png"
    heroAlt="CrownMe battle has begun"
    heroHref={battle_url || SITE_URL}
    heading="The battle has begun."
    paragraphs={[
      <>Voting is now open{opponent_username ? <> against @{opponent_username}</> : ''}. The crown goes to whoever rallies the loudest court.</>,
      <>Share your battle link — every vote shifts the throne.</>,
    ]}
    ctaLabel="Open Battle"
    ctaHref={battle_url || `${SITE_URL}/battles`}
  />
)

export const template = {
  component: Email,
  subject: 'Your battle has begun ⚔️',
  displayName: 'Battle started',
  previewData: { opponent_username: 'crown_hunter' },
} satisfies TemplateEntry
