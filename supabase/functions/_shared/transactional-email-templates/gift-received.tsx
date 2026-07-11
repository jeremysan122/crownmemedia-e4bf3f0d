/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import type { TemplateEntry } from './registry.ts'
import { CrownMeEmail, SITE_URL } from './_layout.tsx'
import { safeOptionalString, safeOptionalUrl, safeParse, z } from './_validate.ts'

const schema = z.object({
  sender_username: safeOptionalString(),
  gift_name: safeOptionalString(),
  post_url: safeOptionalUrl(),
})

const Email = (raw: unknown) => {
  const { sender_username, gift_name, post_url } = safeParse(schema, raw)
  const href = post_url || `${SITE_URL}/wallet`
  return (
    <CrownMeEmail
      preview="A gift has arrived at your throne."
      heroFile="96c33ae3-b0f1-4f4d-a475-f2df42c35d7e/crownme-gift-received-hero.jpg"
      heroAlt="You received a gift on CrownMe"
      heroHref={href}
      heading="A royal gift has arrived."
      paragraphs={[
        <>{sender_username ? <>@{sender_username}</> : 'A patron'} sent you {gift_name ? <strong>{gift_name}</strong> : 'a gift'}. Tribute earns favour in the court.</>,
        <>Open your wallet to see your latest gifts.</>,
      ]}
      ctaLabel="Open My Wallet"
      ctaHref={`${SITE_URL}/wallet`}
    />
  )
}

export const template = {
  component: Email,
  schema,
  subject: '🎁 You received a gift on CrownMe',
  displayName: 'Gift received',
  previewData: { sender_username: 'royal_patron', gift_name: 'Golden Crown' },
} satisfies TemplateEntry
