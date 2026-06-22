/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import type { TemplateEntry } from './registry.ts'
import { CrownMeEmail, SITE_URL } from './_layout.tsx'

interface Props { category?: string; rival_username?: string }

const Email = ({ category, rival_username }: Props) => (
  <CrownMeEmail
    preview="A challenger has taken your crown."
    heroFile="crownme-dethroned-full-design.png"
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

export const template = {
  component: Email,
  subject: 'You have been dethroned',
  displayName: 'Dethroned',
  previewData: { category: 'Style', rival_username: 'crown_hunter' },
} satisfies TemplateEntry
