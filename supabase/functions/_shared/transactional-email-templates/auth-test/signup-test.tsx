/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import type { TemplateEntry } from '../registry.ts'
import { CrownMeEmail, SITE_NAME, SITE_URL } from '../_layout.tsx'
import { safeOptionalString, safeOptionalUrl, safeParse, z } from '../_validate.ts'

const schema = z.object({
  site_name: safeOptionalString(),
  site_url: safeOptionalUrl(),
  recipient: safeOptionalString(),
  confirmation_url: safeOptionalUrl(),
})

const Email = (raw: unknown) => {
  const { site_name, site_url, recipient, confirmation_url } = safeParse(schema, raw)
  const name = site_name || SITE_NAME
  const href = confirmation_url || site_url || SITE_URL
  const who = recipient || 'your email'
  return (
    <CrownMeEmail
      preview={`Claim your throne — confirm your ${name} email 👑`}
      heroFile="7e065d5a-5acb-4807-94f6-8406859cc51e/crownme-confirm-signup-hero.jpg"
      heroAlt={`${name} — Confirm your signup`}
      heroHref={href}
      heading="Claim your throne, royal."
      paragraphs={[
        <>Welcome to <strong>{name}</strong>. Your crown awaits — but first, let's confirm {who}.</>,
      ]}
      ctaLabel="Verify & Enter the Court"
      ctaHref={href}
      footerNote="If you didn't create a CrownMe account, you can safely ignore this email. No crown will be issued in your name."
    />
  )
}

export const template = {
  component: Email,
  schema,
  subject: 'Claim your throne — confirm your CrownMe email 👑',
  displayName: 'Auth · Confirm signup (test)',
  previewData: {
    site_name: SITE_NAME,
    site_url: SITE_URL,
    recipient: 'user@example.test',
    confirmation_url: `${SITE_URL}/auth/confirm?token=preview`,
  },
} satisfies TemplateEntry
