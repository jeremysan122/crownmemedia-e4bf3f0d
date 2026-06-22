/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import type { TemplateEntry } from './registry.ts'
import { CrownMeEmail, SITE_URL } from './_layout.tsx'

interface Props { won?: boolean; battle_url?: string; opponent_username?: string }

const Email = ({ won, battle_url, opponent_username }: Props) => (
  <CrownMeEmail
    preview={won ? 'You won the battle — the crown is yours.' : 'The battle is decided — your rival took it this round.'}
    heroFile="crownme-battle-result-full-design.png"
    heroAlt="CrownMe battle result"
    heroHref={battle_url || SITE_URL}
    heading={won ? 'Victory is yours.' : 'A noble defeat.'}
    paragraphs={
      won
        ? [<>The court has spoken. You bested {opponent_username ? <>@{opponent_username}</> : 'your rival'} and the crown is yours.</>, <>Defend it — challengers are circling.</>]
        : [<>{opponent_username ? <>@{opponent_username}</> : 'Your rival'} took this round. Every legend has a loss in their tale.</>, <>Post a new entry and challenge them again.</>]
    }
    ctaLabel={won ? 'View My Crown' : 'Plan My Comeback'}
    ctaHref={won ? (battle_url || `${SITE_URL}/profile`) : `${SITE_URL}/upload`}
  />
)

export const template = {
  component: Email,
  subject: (d: Record<string, any>) => d?.won ? '👑 You won the battle' : 'Battle result — the court has decided',
  displayName: 'Battle result',
  previewData: { won: true, opponent_username: 'crown_hunter' },
} satisfies TemplateEntry
