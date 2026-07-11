/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import type { TemplateEntry } from '../registry.ts'
import { CrownMeEmail, SITE_NAME, SITE_URL } from '../_layout.tsx'
import { safeOptionalString, safeOptionalUrl, safeParse, z } from '../_validate.ts'

const schema = z.object({
  site_name: safeOptionalString(),
  confirmation_url: safeOptionalUrl(),
})

const Email = (raw: unknown) => {
  const { site_name, confirmation_url } = safeParse(schema, raw)
  const name = site_name || SITE_NAME
  const href = confirmation_url || SITE_URL
  return (
    <CrownMeEmail
      preview={`Your royal key to ${name} awaits 👑`}
      heroFile="0529a9aa-596f-4854-8782-c62d0954a7dd/crownme-magic-link-hero.jpg"
      heroAlt={`${name} — Magic link sign-in`}
      heroHref={href}
      heading="Your royal key has arrived."
      paragraphs={[
        <>Tap the seal below to return to <strong>{name}</strong>. This key expires soon — use it before it turns to dust.</>,
      ]}
      ctaLabel="Enter the Court"
      ctaHref={href}
      footerNote="Didn't request this key? Ignore this scroll — your throne stays sealed."
    />
  )
}

export const template = {
  component: Email,
  schema,
  subject: 'Your royal key to CrownMe awaits 👑',
  displayName: 'Auth · Magic link (test)',
  previewData: { site_name: SITE_NAME, confirmation_url: `${SITE_URL}/auth/magic?token=preview` },
} satisfies TemplateEntry
