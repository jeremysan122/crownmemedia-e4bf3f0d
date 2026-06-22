/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import type { TemplateEntry } from './registry.ts'
import { CrownMeEmail, SITE_URL } from './_layout.tsx'

interface Props { post_url?: string; category?: string }

const Email = ({ post_url, category }: Props) => (
  <CrownMeEmail
    preview="Your post is live — the votes begin now."
    heroFile="crownme-post-live-full-design.png"
    heroAlt="Your CrownMe post is live"
    heroHref={post_url || SITE_URL}
    heading="Your post is live."
    paragraphs={[
      <>Your entry is now in front of the court{category ? ` in ${category}` : ''}. Every vote pushes you closer to the crown.</>,
      <>Share it with your tribe — the loudest reigns always win.</>,
    ]}
    ctaLabel="View My Post"
    ctaHref={post_url || `${SITE_URL}/feed`}
  />
)

export const template = {
  component: Email,
  subject: 'Your post is live on CrownMe 👑',
  displayName: 'Post live',
  previewData: { post_url: 'https://crownmemedia.com/post/abc', category: 'Style' },
} satisfies TemplateEntry
