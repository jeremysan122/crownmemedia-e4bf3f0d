/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import type { TemplateEntry } from './registry.ts'
import { CrownMeEmail, SITE_URL } from './_layout.tsx'

interface Props { sender_username?: string; gift_name?: string; post_url?: string }

const Email = ({ sender_username, gift_name, post_url }: Props) => (
  <CrownMeEmail
    preview="A gift has arrived at your throne."
    heroFile="crownme-gift-received-full-design.png"
    heroAlt="You received a gift on CrownMe"
    heroHref={post_url || SITE_URL}
    heading="A royal gift has arrived."
    paragraphs={[
      <>{sender_username ? <>@{sender_username}</> : 'A patron'} sent you {gift_name ? <strong>{gift_name}</strong> : 'a gift'}. Tribute earns favour in the court.</>,
      <>Open your wallet to see your latest gifts.</>,
    ]}
    ctaLabel="Open My Wallet"
    ctaHref={`${SITE_URL}/wallet`}
  />
)

export const template = {
  component: Email,
  subject: '🎁 You received a gift on CrownMe',
  displayName: 'Gift received',
  previewData: { sender_username: 'royal_patron', gift_name: 'Golden Crown' },
} satisfies TemplateEntry
