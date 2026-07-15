/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import type { TemplateEntry } from './registry.ts'
import { CrownMeEmail, SITE_URL } from './_layout.tsx'
import { safeOptionalNumber, safeOptionalString, safeParse, z } from './_validate.ts'

const schema = z.object({
  renews_on: safeOptionalString(),
  amount: safeOptionalNumber(),
  interval: safeOptionalString(),
})

const Email = (raw: unknown) => {
  const { renews_on, amount, interval } = safeParse(schema, raw)
  return (
    <CrownMeEmail
      preview="Your Royal Pass renews soon."
      heroFile="9ae73d0d-d4eb-46d7-9381-37b817959d44/crownme-welcome-hero.jpg"
      heroAlt="Royal Pass renewal reminder"
      heroHref={`${SITE_URL}/royal-pass`}
      heading="The crown renews soon."
      paragraphs={[
        <>Your Royal Pass will renew{renews_on ? <> on <strong>{renews_on}</strong></> : ''}{typeof amount === 'number' && amount > 0 ? <> for <strong>${amount.toFixed(2)}{interval ? `/${interval}` : ''}</strong></> : ''}.</>,
        <>No action needed — your perks (5 monthly Crown Shields, 500 Shekels, 3 Boost Tokens, and premium identity) continue uninterrupted.</>,
        <>Need to change plans or cancel? Manage your membership any time from your Royal Pass dashboard.</>,
      ]}
      ctaLabel="Manage Royal Pass"
      ctaHref={`${SITE_URL}/royal-pass`}
      footerNote="Questions? Reply and the court will respond."
    />
  )
}

export const template = {
  component: Email,
  schema,
  subject: 'Your Royal Pass renews in 3 days',
  displayName: 'Royal Pass renewal reminder',
  previewData: { renews_on: 'August 1, 2026', amount: 9.99, interval: 'month' },
} satisfies TemplateEntry
