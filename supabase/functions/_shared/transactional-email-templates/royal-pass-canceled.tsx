/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import type { TemplateEntry } from './registry.ts'
import { CrownMeEmail, SITE_URL } from './_layout.tsx'
import { safeOptionalString, safeParse, z } from './_validate.ts'

const schema = z.object({
  expires_on: safeOptionalString(),
})

const Email = (raw: unknown) => {
  const { expires_on } = safeParse(schema, raw)
  return (
    <CrownMeEmail
      preview="Your Royal Pass cancellation is confirmed."
      heroFile="929930d7-8057-4d1c-a439-cbd892b273f9/crownme-dethroned-hero.jpg"
      heroAlt="Royal Pass cancellation confirmed"
      heroHref={`${SITE_URL}/royal-pass`}
      heading="Your Royal Pass is winding down."
      paragraphs={[
        <>We've confirmed your cancellation. You'll keep every Royal perk until <strong>{expires_on || 'the end of your current period'}</strong> — after that, your account returns to the standard court.</>,
        <>Change your mind? Reactivate any time before then to keep your streak alive with no gap in benefits.</>,
        <>Thank you for your reign. The gates remain open should you return.</>,
      ]}
      ctaLabel="Reactivate Royal Pass"
      ctaHref={`${SITE_URL}/royal-pass`}
      footerNote="This is confirmation of your cancellation — no further charges will be made."
    />
  )
}

export const template = {
  component: Email,
  schema,
  subject: 'Your Royal Pass cancellation is confirmed',
  displayName: 'Royal Pass cancellation',
  previewData: { expires_on: 'August 1, 2026' },
} satisfies TemplateEntry
