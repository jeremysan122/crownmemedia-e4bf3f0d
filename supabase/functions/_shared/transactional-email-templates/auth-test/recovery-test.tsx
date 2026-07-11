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
  const href = confirmation_url || `${SITE_URL}/reset-password`
  return (
    <CrownMeEmail
      preview={`Restore your reign at ${name}`}
      heroFile="f76c69f1-aecb-4bc8-92f5-6fcca7f19568/crownme-password-reset-hero.jpg"
      heroAlt={`${name} — Password reset`}
      heroHref={href}
      heading="Restore your reign."
      paragraphs={[
        <>We received a request to reset your password for <strong>{name}</strong>. Tap the seal below to forge a new key to your throne.</>,
      ]}
      ctaLabel="Reset My Password"
      ctaHref={href}
      footerNote="If you didn't request this, ignore this scroll. Your password remains untouched and your crown still yours."
    />
  )
}

export const template = {
  component: Email,
  schema,
  subject: 'Restore your reign at CrownMe',
  displayName: 'Auth · Password reset (test)',
  previewData: { site_name: SITE_NAME, confirmation_url: `${SITE_URL}/reset-password?token=preview` },
} satisfies TemplateEntry
