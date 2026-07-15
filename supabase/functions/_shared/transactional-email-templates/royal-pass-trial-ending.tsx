/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import type { TemplateEntry } from './registry.ts'
import { CrownMeEmail, SITE_URL } from './_layout.tsx'
import { safeOptionalNumber, safeOptionalString, safeParse, z } from './_validate.ts'

const schema = z.object({
  charges_on: safeOptionalString(),
  amount: safeOptionalNumber(),
  interval: safeOptionalString(),
})

const Email = (raw: unknown) => {
  const { charges_on, amount, interval } = safeParse(schema, raw)
  return (
    <CrownMeEmail
      preview="Your Royal Pass free trial is ending soon."
      heroFile="0b9fe473-88b9-421c-988d-f85743227950/crownme-crown-won-hero.jpg"
      heroAlt="Royal Pass trial ending"
      heroHref={`${SITE_URL}/royal-pass`}
      heading="Your free trial ends soon."
      paragraphs={[
        <>Your 7-day Royal Pass trial ends{charges_on ? <> on <strong>{charges_on}</strong></> : ' in 2 days'}. Your first charge{typeof amount === 'number' && amount > 0 ? <> of <strong>${amount.toFixed(2)}{interval ? `/${interval}` : ''}</strong></> : ''} will follow — and you'll keep all your Royal perks without interruption.</>,
        <>Not ready to commit? Cancel any time before the trial ends and you won't be charged.</>,
        <>Loving the crown? Do nothing — your reign continues.</>,
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
  subject: 'Your Royal Pass trial ends in 2 days',
  displayName: 'Royal Pass trial ending',
  previewData: { charges_on: 'July 20, 2026', amount: 9.99, interval: 'month' },
} satisfies TemplateEntry
