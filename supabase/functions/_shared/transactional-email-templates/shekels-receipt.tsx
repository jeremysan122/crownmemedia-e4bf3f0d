/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import type { TemplateEntry } from './registry.ts'
import { CrownMeEmail, SITE_URL } from './_layout.tsx'

interface Props { amount?: number; shekels?: number; order_id?: string; receipt_url?: string }

const Email = ({ amount, shekels, order_id, receipt_url }: Props) => (
  <CrownMeEmail
    preview="Your Shekels purchase is confirmed."
    heroFile="crownme-shekels-receipt-full-design.png"
    heroAlt="CrownMe Shekels purchase receipt"
    heroHref={receipt_url || `${SITE_URL}/wallet`}
    heading="Your treasury has grown."
    paragraphs={[
      <>{shekels ? <><strong>{shekels.toLocaleString()} Shekels</strong></> : 'Your Shekels'} have been added to your wallet{amount ? <> for <strong>${amount.toFixed(2)}</strong></> : ''}.</>,
      order_id ? <>Order ID: <code>{order_id}</code></> : <>Spend them on boosts, gifts, and crown plays.</>,
    ]}
    ctaLabel="Open My Wallet"
    ctaHref={`${SITE_URL}/wallet`}
    footerNote="Need help with this order? Reply to this email and the court will respond."
  />
)

export const template = {
  component: Email,
  subject: 'Your Shekels purchase receipt',
  displayName: 'Shekels purchase receipt',
  previewData: { amount: 19.99, shekels: 1000, order_id: 'ord_123' },
} satisfies TemplateEntry
