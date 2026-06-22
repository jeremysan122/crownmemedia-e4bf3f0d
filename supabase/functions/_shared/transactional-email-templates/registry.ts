/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'

export interface TemplateEntry {
  component: React.ComponentType<any>
  subject: string | ((data: Record<string, any>) => string)
  to?: string
  displayName?: string
  previewData?: Record<string, any>
}

import { template as welcome } from './welcome.tsx'
import { template as completeProfile } from './complete-profile.tsx'
import { template as uploadFirstPost } from './upload-first-post.tsx'
import { template as postLive } from './post-live.tsx'
import { template as crownWon } from './crown-won.tsx'
import { template as dethroned } from './dethroned.tsx'
import { template as battleInvite } from './battle-invite.tsx'
import { template as battleStarted } from './battle-started.tsx'
import { template as battleEndingSoon } from './battle-ending-soon.tsx'
import { template as battleResult } from './battle-result.tsx'
import { template as giftReceived } from './gift-received.tsx'
import { template as shekelsReceipt } from './shekels-receipt.tsx'
import { template as payoutVerification } from './payout-verification.tsx'
import { template as weeklyRecap } from './weekly-recap.tsx'

export const TEMPLATES: Record<string, TemplateEntry> = {
  'welcome': welcome,
  'complete-profile': completeProfile,
  'upload-first-post': uploadFirstPost,
  'post-live': postLive,
  'crown-won': crownWon,
  'dethroned': dethroned,
  'battle-invite': battleInvite,
  'battle-started': battleStarted,
  'battle-ending-soon': battleEndingSoon,
  'battle-result': battleResult,
  'gift-received': giftReceived,
  'shekels-receipt': shekelsReceipt,
  'payout-verification': payoutVerification,
  'weekly-recap': weeklyRecap,
}
