/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import type { TemplateEntry } from './registry.ts'
import { CrownMeEmail, SITE_NAME, SITE_URL } from './_layout.tsx'

interface Props { username?: string; first_name?: string }

const Email = ({ username, first_name }: Props) => {
  const name = first_name || username || 'Royal'
  return (
    <CrownMeEmail
      preview="Welcome to CrownMe — your reign begins now."
      heroFile="crownme-welcome-full-design.png"
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
  subject: `Welcome to ${SITE_NAME} — your reign begins now`,
  displayName: 'Welcome',
  previewData: { username: 'royal_one', first_name: 'Alex' },
} satisfies TemplateEntry
