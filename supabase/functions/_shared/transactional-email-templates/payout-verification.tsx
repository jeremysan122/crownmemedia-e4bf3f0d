/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import type { TemplateEntry } from './registry.ts'
import { CrownMeEmail, SITE_URL } from './_layout.tsx'

interface Props { amount?: number; status?: string }

const Email = ({ amount, status }: Props) => (
  <CrownMeEmail
    preview="Verify your payout request to release your earnings."
    heroFile="crownme-payout-verification-full-design.png"
    heroAlt="CrownMe payout verification"
    heroHref={`${SITE_URL}/wallet`}
    heading="Confirm your payout."
    paragraphs={[
      <>We received your payout request{amount ? <> for <strong>${amount.toFixed(2)}</strong></> : ''}. To protect your earnings, please verify your identity in the app.</>,
      status ? <>Current status: <strong>{status}</strong></> : <>Verification usually takes under a minute.</>,
    ]}
    ctaLabel="Verify Payout"
    ctaHref={`${SITE_URL}/wallet`}
    footerNote="If you didn't request this payout, contact support immediately."
  />
)

export const template = {
  component: Email,
  subject: 'Verify your CrownMe payout',
  displayName: 'Payout verification',
  previewData: { amount: 120.5, status: 'pending verification' },
} satisfies TemplateEntry
