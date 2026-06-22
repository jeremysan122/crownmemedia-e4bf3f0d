/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import type { TemplateEntry } from './registry.ts'
import { CrownMeEmail, SITE_URL } from './_layout.tsx'

interface Props { category?: string; rank?: number; post_url?: string }

const Email = ({ category, rank, post_url }: Props) => (
  <CrownMeEmail
    preview="You won the crown — long may you reign."
    heroFile="crownme-crown-won-full-design.png"
    heroAlt="You won the crown on CrownMe"
    heroHref={post_url || SITE_URL}
    heading="You wear the crown."
    paragraphs={[
      <>The court has voted. You took the top spot{category ? ` in ${category}` : ''}{rank ? ` at rank #${rank}` : ''}.</>,
      <>Defend your throne — challengers are already rising.</>,
    ]}
    ctaLabel="View My Crown"
    ctaHref={post_url || `${SITE_URL}/profile`}
  />
)

export const template = {
  component: Email,
  subject: '👑 You won the crown',
  displayName: 'Crown won',
  previewData: { category: 'Style', rank: 1 },
} satisfies TemplateEntry
