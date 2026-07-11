/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import type { TemplateEntry } from './registry.ts'
import { CrownMeEmail, SITE_URL } from './_layout.tsx'
import { safeOptionalNumber, safeOptionalString, safeParse, z } from './_validate.ts'

const schema = z.object({
  amount: safeOptionalNumber(),
  status: safeOptionalString(),
})

const Email = (raw: unknown) => {
  const { amount, status } = safeParse(schema, raw)
  return (
    <CrownMeEmail
      preview="Verify your payout request to release your earnings."
      heroFile="62b0f83c-2359-40b0-84c1-9cd67d6b89e7/crownme-payout-verification-hero.jpg"
      heroAlt="CrownMe payout verification"
      heroHref={`${SITE_URL}/wallet`}
      heading="Confirm your payout."
      paragraphs={[
        <>We received your payout request{typeof amount === 'number' && amount > 0 ? <> for <strong>${amount.toFixed(2)}</strong></> : ''}. To protect your earnings, please verify your identity in the app.</>,
        status ? <>Current status: <strong>{status}</strong></> : <>Verification usually takes under a minute.</>,
      ]}
      ctaLabel="Verify Payout"
      ctaHref={`${SITE_URL}/wallet`}
      footerNote="If you didn't request this payout, contact support immediately."
    />
  )
}

export const template = {
  component: Email,
  schema,
  subject: 'Verify your CrownMe payout',
  displayName: 'Payout verification',
  previewData: { amount: 120.5, status: 'pending verification' },
} satisfies TemplateEntry
