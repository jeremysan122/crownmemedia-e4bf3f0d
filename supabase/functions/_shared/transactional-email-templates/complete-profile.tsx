/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import type { TemplateEntry } from './registry.ts'
import { CrownMeEmail, SITE_URL } from './_layout.tsx'
import { safeOptionalString, safeParse, z } from './_validate.ts'

const schema = z.object({ first_name: safeOptionalString() })

const Email = (raw: unknown) => {
  const { first_name } = safeParse(schema, raw)
  return (
    <CrownMeEmail
      preview="Your throne is incomplete — finish your profile."
      heroFile="crownme-complete-profile-full-design.png"
      heroAlt="Complete your CrownMe profile"
      heroHref={`${SITE_URL}/edit-profile`}
      heading={`Finish your ascent${first_name ? `, ${first_name}` : ''}.`}
      paragraphs={[
        <>A crown without a face cannot be remembered. Add your avatar, bio, and category to be eligible for the leaderboards.</>,
        <>Profiles with a portrait and bio earn up to 3× more votes.</>,
      ]}
      ctaLabel="Complete My Profile"
      ctaHref={`${SITE_URL}/edit-profile`}
      footerNote="You can update your profile anytime from your settings."
    />
  )
}

export const template = {
  component: Email,
  schema,
  subject: 'Finish your CrownMe profile to be crowned',
  displayName: 'Complete profile',
  previewData: { first_name: 'Alex' },
} satisfies TemplateEntry
