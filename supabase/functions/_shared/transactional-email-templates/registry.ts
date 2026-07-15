/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import type { z } from 'npm:zod@3.25.76'

export interface TemplateEntry {
  component: React.ComponentType<any>
  subject: string | ((data: Record<string, any>) => string)
  to?: string
  displayName?: string
  previewData?: Record<string, any>
  /**
   * Optional Zod schema for strict validation + safe defaults.
   * When present, the send pipeline runs `safeParse(schema, templateData)`
   * BEFORE rendering and subject resolution, so a missing or malformed
   * field can never break rendering.
   */
  schema?: z.ZodTypeAny
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
import { template as royalPassRenewalReminder } from './royal-pass-renewal-reminder.tsx'
import { template as royalPassCanceled } from './royal-pass-canceled.tsx'
import { template as royalPassTrialEnding } from './royal-pass-trial-ending.tsx'

// Auth template designs, wrapped as transactional sends so they can be
// tested end-to-end (the real auth versions are wired via auth-email-hook).
import { template as authSignupTest } from './auth-test/signup-test.tsx'
import { template as authMagicLinkTest } from './auth-test/magic-link-test.tsx'
import { template as authRecoveryTest } from './auth-test/recovery-test.tsx'
import { template as authInviteTest } from './auth-test/invite-test.tsx'
import { template as authEmailChangeTest } from './auth-test/email-change-test.tsx'
import { template as authReauthTest } from './auth-test/reauthentication-test.tsx'

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
  'royal-pass-renewal-reminder': royalPassRenewalReminder,
  'royal-pass-canceled': royalPassCanceled,
  'royal-pass-trial-ending': royalPassTrialEnding,
  // Auth previews (sendable copies for testing the design end-to-end):
  'auth-signup-test': authSignupTest,
  'auth-magic-link-test': authMagicLinkTest,
  'auth-recovery-test': authRecoveryTest,
  'auth-invite-test': authInviteTest,
  'auth-email-change-test': authEmailChangeTest,
  'auth-reauthentication-test': authReauthTest,
}
