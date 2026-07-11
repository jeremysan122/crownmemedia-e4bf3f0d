/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import type { TemplateEntry } from './registry.ts'
import { CrownMeEmail, SITE_URL } from './_layout.tsx'
import { safeOptionalString, safeOptionalUrl, safeParse, z } from './_validate.ts'

const schema = z.object({
  post_url: safeOptionalUrl(),
  category: safeOptionalString(),
})

const Email = (raw: unknown) => {
  const { post_url, category } = safeParse(schema, raw)
  const href = post_url || `${SITE_URL}/feed`
  return (
    <CrownMeEmail
      preview="Your post is live — the votes begin now."
      heroFile="07982903-c7c5-476d-9cbc-2787458c0dbf/crownme-post-live-hero.jpg"
      heroAlt="Your CrownMe post is live"
      heroHref={href}
      heading="Your post is live."
      paragraphs={[
        <>Your entry is now in front of the court{category ? ` in ${category}` : ''}. Every vote pushes you closer to the crown.</>,
        <>Share it with your tribe — the loudest reigns always win.</>,
      ]}
      ctaLabel="View My Post"
      ctaHref={href}
    />
  )
}

export const template = {
  component: Email,
  schema,
  subject: 'Your post is live on CrownMe 👑',
  displayName: 'Post live',
  previewData: { post_url: 'https://crownmemedia.com/feed', category: 'Style' },
} satisfies TemplateEntry
