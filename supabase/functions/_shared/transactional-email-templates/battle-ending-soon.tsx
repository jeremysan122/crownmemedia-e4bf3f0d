/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import type { TemplateEntry } from './registry.ts'
import { CrownMeEmail, SITE_URL } from './_layout.tsx'

interface Props { battle_url?: string; hours_left?: number }

const Email = ({ battle_url, hours_left }: Props) => (
  <CrownMeEmail
    preview="Your battle ends soon — the throne is still in play."
    heroFile="crownme-battle-ending-soon-full-design.png"
    heroAlt="CrownMe battle ending soon"
    heroHref={battle_url || SITE_URL}
    heading="Final hours."
    paragraphs={[
      <>Your battle ends{hours_left ? ` in ${hours_left} hours` : ' soon'}. Every vote in these last hours weighs heaviest.</>,
      <>Rally your tribe — close ones are won at the wire.</>,
    ]}
    ctaLabel="Push for Victory"
    ctaHref={battle_url || `${SITE_URL}/battles`}
  />
)

export const template = {
  component: Email,
  subject: '⏳ Your battle ends soon',
  displayName: 'Battle ending soon',
  previewData: { hours_left: 6 },
} satisfies TemplateEntry
