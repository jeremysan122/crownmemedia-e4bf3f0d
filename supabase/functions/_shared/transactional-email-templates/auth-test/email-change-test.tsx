/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import type { TemplateEntry } from '../registry.ts'
import { CrownMeEmail, SITE_NAME, SITE_URL } from '../_layout.tsx'
import { safeOptionalString, safeOptionalUrl, safeParse, z } from '../_validate.ts'

const schema = z.object({
  site_name: safeOptionalString(),
  old_email: safeOptionalString(),
  new_email: safeOptionalString(),
  confirmation_url: safeOptionalUrl(),
})

const Email = (raw: unknown) => {
  const { site_name, old_email, new_email, confirmation_url } = safeParse(schema, raw)
  const name = site_name || SITE_NAME
  const href = confirmation_url || SITE_URL
  return (
    <CrownMeEmail
      preview={`Confirm your email change for ${name}`}
      heroFile="crownme-email-change-full-design.png"
      heroAlt={`${name} — Confirm email change`}
      heroHref={href}
      heading="Confirm your new address."
      paragraphs={[
        <>You requested to update your <strong>{name}</strong> email{old_email ? <> from <strong>{old_email}</strong></> : ''}{new_email ? <> to <strong>{new_email}</strong></> : ''}.</>,
      ]}
      ctaLabel="Confirm Email Change"
      ctaHref={href}
      footerNote="If you didn't request this change, secure your account immediately — your crown may be at risk."
    />
  )
}

export const template = {
  component: Email,
  schema,
  subject: 'Confirm your email change for CrownMe',
  displayName: 'Auth · Email change (test)',
  previewData: { site_name: SITE_NAME, old_email: 'old@example.test', new_email: 'new@example.test', confirmation_url: `${SITE_URL}/auth/email-change?token=preview` },
} satisfies TemplateEntry
