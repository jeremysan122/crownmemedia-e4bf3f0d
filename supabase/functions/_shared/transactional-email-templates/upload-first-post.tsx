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
      preview="Upload your first post and enter the arena."
      heroFile="crownme-upload-first-post-full-design.png"
      heroAlt="Upload your first CrownMe post"
      heroHref={`${SITE_URL}/upload`}
      heading={`The arena awaits${first_name ? `, ${first_name}` : ''}.`}
      paragraphs={[
        <>You can't be crowned without a single post. Upload your first shot to enter the daily competition and start collecting votes.</>,
        <>One post is all it takes to begin your reign.</>,
      ]}
      ctaLabel="Upload Your First Post"
      ctaHref={`${SITE_URL}/upload`}
    />
  )
}

export const template = {
  component: Email,
  schema,
  subject: 'Upload your first post — your throne awaits',
  displayName: 'Upload first post',
  previewData: { first_name: 'Alex' },
} satisfies TemplateEntry
