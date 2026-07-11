/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import type { TemplateEntry } from '../registry.ts'
import { CrownMeEmail, SITE_NAME, SITE_URL } from '../_layout.tsx'
import { safeOptionalString, safeOptionalUrl, safeParse, z } from '../_validate.ts'

const schema = z.object({
  site_name: safeOptionalString(),
  site_url: safeOptionalUrl(),
  confirmation_url: safeOptionalUrl(),
})

const Email = (raw: unknown) => {
  const { site_name, site_url, confirmation_url } = safeParse(schema, raw)
  const name = site_name || SITE_NAME
  const href = confirmation_url || site_url || SITE_URL
  return (
    <CrownMeEmail
      preview={`You've been summoned to ${name} 👑`}
      heroFile="99d80aaf-6a87-4f46-b1ed-79959812aaa1/crownme-invite-hero.jpg"
      heroAlt={`${name} — Invitation`}
      heroHref={href}
      heading="A summons to the court."
      paragraphs={[
        <>You've been invited to join <strong>{name}</strong>. Accept the seal below to claim your crown and begin your reign.</>,
      ]}
      ctaLabel="Accept the Summons"
      ctaHref={href}
      footerNote="If you weren't expecting this invitation, ignore this scroll. No crown will be issued in your name."
    />
  )
}

export const template = {
  component: Email,
  schema,
  subject: "You've been summoned to CrownMe 👑",
  displayName: 'Auth · Invite (test)',
  previewData: { site_name: SITE_NAME, site_url: SITE_URL, confirmation_url: `${SITE_URL}/auth/invite?token=preview` },
} satisfies TemplateEntry
