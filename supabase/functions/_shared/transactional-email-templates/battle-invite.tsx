/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import type { TemplateEntry } from './registry.ts'
import { CrownMeEmail, SITE_URL } from './_layout.tsx'

interface Props { challenger_username?: string; battle_url?: string }

const Email = ({ challenger_username, battle_url }: Props) => (
  <CrownMeEmail
    preview="You've been challenged to a CrownMe battle."
    heroFile="crownme-battle-invite-full-design.png"
    heroAlt="CrownMe battle invitation"
    heroHref={battle_url || SITE_URL}
    heading="You've been challenged."
    paragraphs={[
      <>{challenger_username ? <>@{challenger_username}</> : 'A rival'} has summoned you to a head-to-head battle. Accept and let the court decide.</>,
      <>Decline and the win goes to your rival by default.</>,
    ]}
    ctaLabel="View Battle"
    ctaHref={battle_url || `${SITE_URL}/battles`}
  />
)

export const template = {
  component: Email,
  subject: '⚔️ A challenger has summoned you',
  displayName: 'Battle invite',
  previewData: { challenger_username: 'crown_hunter' },
} satisfies TemplateEntry
