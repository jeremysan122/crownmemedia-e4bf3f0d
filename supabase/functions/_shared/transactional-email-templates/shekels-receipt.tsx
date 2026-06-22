/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import type { TemplateEntry } from './registry.ts'
import { CrownMeEmail, SITE_URL } from './_layout.tsx'
import { safeOptionalNumber, safeOptionalString, safeOptionalUrl, safeParse, z } from './_validate.ts'

const schema = z.object({
  amount: safeOptionalNumber(),
  shekels: safeOptionalNumber(),
  order_id: safeOptionalString(),
  receipt_url: safeOptionalUrl(),
})

const Email = (raw: unknown) => {
  const { amount, shekels, order_id, receipt_url } = safeParse(schema, raw)
  const href = receipt_url || `${SITE_URL}/wallet`
  return (
    <CrownMeEmail
      preview="Your Shekels purchase is confirmed."
      heroFile="crownme-shekels-receipt-full-design.png"
      heroAlt="CrownMe Shekels purchase receipt"
      heroHref={href}
      heading="Your treasury has grown."
      paragraphs={[
        <>{typeof shekels === 'number' && shekels > 0 ? <><strong>{shekels.toLocaleString()} Shekels</strong></> : 'Your Shekels'} have been added to your wallet{typeof amount === 'number' && amount > 0 ? <> for <strong>${amount.toFixed(2)}</strong></> : ''}.</>,
        order_id ? <>Order ID: <code>{order_id}</code></> : <>Spend them on boosts, gifts, and crown plays.</>,
      ]}
      ctaLabel="Open My Wallet"
      ctaHref={`${SITE_URL}/wallet`}
      footerNote="Need help with this order? Reply to this email and the court will respond."
    />
  )
}

export const template = {
  component: Email,
  schema,
  subject: 'Your Shekels purchase receipt',
  displayName: 'Shekels purchase receipt',
  previewData: { amount: 19.99, shekels: 1000, order_id: 'ord_123' },
} satisfies TemplateEntry
