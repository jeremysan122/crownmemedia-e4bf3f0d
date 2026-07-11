/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import type { TemplateEntry } from './registry.ts'
import { CrownMeEmail, SITE_NAME, SITE_URL } from './_layout.tsx'
import { safeOptionalString, safeParse, z } from './_validate.ts'

const schema = z.object({
  username: safeOptionalString(),
  first_name: safeOptionalString(),
})
type Props = z.infer<typeof schema>

const Email = (raw: unknown) => {
  const { username, first_name } = safeParse(schema, raw)
  const name = first_name || username || 'Royal'
  return (
    <CrownMeEmail
      preview="Welcome to CrownMe — your reign begins now."
      heroFile="9ae73d0d-d4eb-46d7-9381-37b817959d44/crownme-welcome-hero.jpg"
      heroAlt="Welcome to CrownMe"
      heroHref={SITE_URL}
      heading={`Welcome, ${name}.`}
      paragraphs={[
        <>Your throne is ready. You're now part of the most exclusive creator competition on the internet — where votes crown kings and queens daily.</>,
        <>Post your first photo, claim a category, and start collecting crowns.</>,
      ]}
      ctaLabel="Claim Your Crown"
      ctaHref={`${SITE_URL}/upload`}
      footerNote="Tip: Complete your profile with an avatar and bio to win more votes."
    />
  )
}

export const template = {
  component: Email,
  schema,
  subject: `Welcome to ${SITE_NAME} — your reign begins now`,
  displayName: 'Welcome',
  previewData: { username: 'royal_one', first_name: 'Alex' },
} satisfies TemplateEntry
