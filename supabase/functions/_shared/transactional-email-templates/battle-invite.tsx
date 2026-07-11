/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import type { TemplateEntry } from './registry.ts'
import { CrownMeEmail, SITE_URL } from './_layout.tsx'
import { safeOptionalString, safeOptionalUrl, safeParse, z } from './_validate.ts'

const schema = z.object({
  challenger_username: safeOptionalString(),
  battle_url: safeOptionalUrl(),
})

const Email = (raw: unknown) => {
  const { challenger_username, battle_url } = safeParse(schema, raw)
  const href = battle_url || `${SITE_URL}/battles`
  return (
    <CrownMeEmail
      preview="You've been challenged to a CrownMe battle."
      heroFile="ccf4911d-5b74-48db-a33a-0720b2b40745/crownme-battle-invite-hero-2.jpg"
      heroAlt="CrownMe battle invitation"
      heroHref={href}
      heading="You've been challenged."
      paragraphs={[
        <>{challenger_username ? <>@{challenger_username}</> : 'A rival'} has summoned you to a head-to-head battle. Accept and let the court decide.</>,
        <>Decline and the win goes to your rival by default.</>,
      ]}
      ctaLabel="View Battle"
      ctaHref={href}
    />
  )
}

export const template = {
  component: Email,
  schema,
  subject: '⚔️ A challenger has summoned you',
  displayName: 'Battle invite',
  previewData: { challenger_username: 'crown_hunter' },
} satisfies TemplateEntry
