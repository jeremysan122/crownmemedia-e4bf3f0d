export type CrownMeExactEmailKey =
  | "confirmSignup"
  | "passwordReset"
  | "invite"
  | "magicLink"
  | "emailChange"
  | "reauthentication"
  | "welcomeToCrownMe"
  | "completeYourProfile"
  | "uploadYourFirstPost"
  | "postSubmittedLive"
  | "battleInvite"
  | "battleStarted"
  | "battleEndingSoon"
  | "battleResult"
  | "youWonACrown"
  | "youveBeenDethroned"
  | "weeklyLeaderboardRecap"
  | "giftReceived"
  | "shekelsPurchaseReceipt"
  | "payoutVerificationRequired";

export type CrownMeExactEmailContext = {
  siteUrl?: string;
  postUrl?: string;
  battleUrl?: string;
  battleResultUrl?: string;
  crownUrl?: string;
  leaderboardUrl?: string;
  giftUrl?: string;
  receiptUrl?: string;
  walletUrl?: string;
  verificationUrl?: string;
};

export type CrownMeExactEmailDefinition = {
  key: CrownMeExactEmailKey;
  label: string;
  category: "Supabase Auth Template" | "Product / Lifecycle Template";
  subject: string;
  fullDesignImage: string;
  href?: string;
  fallback?: boolean;
  note: string;
  supabase?: boolean;
  usesToken?: boolean;
};

export const crownmeExactEmailDefinitions: CrownMeExactEmailDefinition[] = [
  {
    key: "confirmSignup",
    label: "Confirm signup",
    category: "Supabase Auth Template",
    subject: "👑 Confirm your CrownMe email",
    fullDesignImage: "crownme-confirm-signup-full-design.png",
    href: "{{ .ConfirmationURL }}",
    fallback: true,
    note: "If you did not create a CrownMe account, you can safely ignore this email.",
    supabase: true,
  },
  {
    key: "passwordReset",
    label: "Password reset",
    category: "Supabase Auth Template",
    subject: "Reset your CrownMe password",
    fullDesignImage: "crownme-password-reset-full-design.png",
    href: "{{ .ConfirmationURL }}",
    fallback: true,
    note: "If you did not request a password reset, you can safely ignore this email.",
    supabase: true,
  },
  {
    key: "invite",
    label: "Invite",
    category: "Supabase Auth Template",
    subject: "You’ve been invited to CrownMe 👑",
    fullDesignImage: "crownme-invite-full-design.png",
    href: "{{ .ConfirmationURL }}",
    fallback: true,
    note: "If you were not expecting this invite, you can safely ignore this email.",
    supabase: true,
  },
  {
    key: "magicLink",
    label: "Magic link",
    category: "Supabase Auth Template",
    subject: "Your CrownMe sign-in link",
    fullDesignImage: "crownme-magic-link-full-design.png",
    href: "{{ .ConfirmationURL }}",
    fallback: true,
    note: "If you did not request this sign-in link, you can safely ignore this email.",
    supabase: true,
  },
  {
    key: "emailChange",
    label: "Email change",
    category: "Supabase Auth Template",
    subject: "Confirm your new CrownMe email",
    fullDesignImage: "crownme-email-change-full-design.png",
    href: "{{ .ConfirmationURL }}",
    fallback: true,
    note: "If you did not request this change, you can safely ignore this email.",
    supabase: true,
  },
  {
    key: "reauthentication",
    label: "Reauthentication",
    category: "Supabase Auth Template",
    subject: "{{ .Token }} is your CrownMe verification code",
    fullDesignImage: "crownme-reauthentication-full-design.png",
    note: "If you did not request this code, you can safely ignore this email.",
    supabase: true,
    usesToken: true,
  },
  {
    key: "welcomeToCrownMe",
    label: "Welcome to CrownMe",
    category: "Product / Lifecycle Template",
    subject: "Welcome to CrownMe 👑",
    fullDesignImage: "crownme-welcome-full-design.png",
    href: "https://crownmemedia.com",
    note: "The court is open, and your journey begins now.",
  },
  {
    key: "completeYourProfile",
    label: "Complete your profile",
    category: "Product / Lifecycle Template",
    subject: "Complete your CrownMe profile",
    fullDesignImage: "crownme-complete-profile-full-design.png",
    href: "https://crownmemedia.com/settings/profile",
    note: "The more you share, the more you connect and compete.",
  },
  {
    key: "uploadYourFirstPost",
    label: "Upload your first post",
    category: "Product / Lifecycle Template",
    subject: "Post your first CrownMe entry",
    fullDesignImage: "crownme-upload-first-post-full-design.png",
    href: "https://crownmemedia.com/upload",
    note: "Every legend starts somewhere. Your spotlight is waiting.",
  },
  {
    key: "postSubmittedLive",
    label: "Post submitted/live",
    category: "Product / Lifecycle Template",
    subject: "Your post is live on CrownMe",
    fullDesignImage: "crownme-post-live-full-design.png",
    href: "{{ post_url }}",
    note: "Champions rise with every vote.",
  },
  {
    key: "battleInvite",
    label: "Battle invite",
    category: "Product / Lifecycle Template",
    subject: "You’ve been challenged on CrownMe",
    fullDesignImage: "crownme-battle-invite-full-design.png",
    href: "{{ battle_url }}",
    note: "Every crown must be defended.",
  },
  {
    key: "battleStarted",
    label: "Battle started",
    category: "Product / Lifecycle Template",
    subject: "Your CrownMe battle has begun",
    fullDesignImage: "crownme-battle-started-full-design.png",
    href: "{{ battle_url }}",
    note: "The court is watching.",
  },
  {
    key: "battleEndingSoon",
    label: "Battle ending soon",
    category: "Product / Lifecycle Template",
    subject: "Your CrownMe battle is ending soon",
    fullDesignImage: "crownme-battle-ending-soon-full-design.png",
    href: "{{ battle_url }}",
    note: "Last chance to hold the crown.",
  },
  {
    key: "battleResult",
    label: "Battle result",
    category: "Product / Lifecycle Template",
    subject: "Your CrownMe battle results are in",
    fullDesignImage: "crownme-battle-result-full-design.png",
    href: "{{ battle_result_url }}",
    note: "Only one can wear the crown.",
  },
  {
    key: "youWonACrown",
    label: "You won a crown",
    category: "Product / Lifecycle Template",
    subject: "You won the crown 👑",
    fullDesignImage: "crownme-crown-won-full-design.png",
    href: "{{ crown_url }}",
    note: "A champion has been crowned.",
  },
  {
    key: "youveBeenDethroned",
    label: "You’ve been dethroned",
    category: "Product / Lifecycle Template",
    subject: "You’ve been dethroned",
    fullDesignImage: "crownme-dethroned-full-design.png",
    href: "{{ leaderboard_url }}",
    note: "Legends rise again.",
  },
  {
    key: "weeklyLeaderboardRecap",
    label: "Weekly leaderboard recap",
    category: "Product / Lifecycle Template",
    subject: "Your CrownMe weekly recap",
    fullDesignImage: "crownme-weekly-recap-full-design.png",
    href: "https://crownmemedia.com/leaderboard",
    note: "Every week shapes the throne.",
  },
  {
    key: "giftReceived",
    label: "Gift received",
    category: "Product / Lifecycle Template",
    subject: "A CrownMe gift has arrived",
    fullDesignImage: "crownme-gift-received-full-design.png",
    href: "{{ gift_url }}",
    note: "Royal rewards have arrived.",
  },
  {
    key: "shekelsPurchaseReceipt",
    label: "Shekels purchase receipt",
    category: "Product / Lifecycle Template",
    subject: "Your CrownMe Shekels are ready",
    fullDesignImage: "crownme-shekels-receipt-full-design.png",
    href: "{{ receipt_url }}",
    note: "Your balance just got stronger.",
  },
  {
    key: "payoutVerificationRequired",
    label: "Payout verification required",
    category: "Product / Lifecycle Template",
    subject: "Verify your account to unlock payouts",
    fullDesignImage: "crownme-payout-verification-full-design.png",
    href: "https://crownmemedia.com/verification",
    note: "Protected, verified, and ready to earn.",
  },
];

function resolveHref(href: string | undefined, context: CrownMeExactEmailContext = {}) {
  if (!href) return undefined;

  const siteUrl = context.siteUrl || "https://crownmemedia.com";

  return href
    .replaceAll("{{ post_url }}", context.postUrl || `${siteUrl}/post`)
    .replaceAll("{{ battle_url }}", context.battleUrl || `${siteUrl}/battles`)
    .replaceAll("{{ battle_result_url }}", context.battleResultUrl || context.battleUrl || `${siteUrl}/battles`)
    .replaceAll("{{ crown_url }}", context.crownUrl || context.postUrl || `${siteUrl}/leaderboard`)
    .replaceAll("{{ leaderboard_url }}", context.leaderboardUrl || `${siteUrl}/leaderboard`)
    .replaceAll("{{ gift_url }}", context.giftUrl || context.walletUrl || `${siteUrl}/wallet`)
    .replaceAll("{{ receipt_url }}", context.receiptUrl || context.walletUrl || `${siteUrl}/wallet`);
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function renderCrownMeExactEmail(
  key: CrownMeExactEmailKey,
  context: CrownMeExactEmailContext = {}
) {
  const definition = crownmeExactEmailDefinitions.find((template) => template.key === key);

  if (!definition) {
    throw new Error(`Unknown CrownMe email template: ${key}`);
  }

  const siteUrl = context.siteUrl || "https://crownmemedia.com";

  const imageUrl = definition.supabase
    ? `{{ .SiteURL }}/email/${definition.fullDesignImage}`
    : `${siteUrl}/email/${definition.fullDesignImage}`;

  const href = resolveHref(definition.href, context);
  const safeImageUrl = escapeHtml(imageUrl);
  const safeHref = href ? escapeHtml(href) : undefined;
  const safeAlt = escapeHtml(definition.label);
  const safeSubject = escapeHtml(definition.subject);
  const safeNote = escapeHtml(definition.note);

  const imageTag = `<img src="${safeImageUrl}" alt="${safeAlt}" width="640" style="display:block;width:100%;max-width:640px;height:auto;border:0;outline:none;text-decoration:none;" />`;

  const linkedImage = safeHref
    ? `<a href="${safeHref}" target="_blank" style="text-decoration:none;display:block;">${imageTag}</a>`
    : imageTag;

  const tokenBlock = definition.usesToken
    ? `
      <tr>
        <td style="padding:0 24px 24px 24px;background:#ffffff;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
            <tr>
              <td align="center" style="border:1px solid #e7c04a;border-radius:16px;background:linear-gradient(180deg,#24103f 0%,#13071f 100%);padding:18px 20px;box-shadow:0 10px 30px rgba(55,14,86,.25);">
                <div style="font-family:Georgia,'Times New Roman',serif;font-size:44px;line-height:1;letter-spacing:8px;color:#f0cb66;font-weight:700;">{{ .Token }}</div>
                <div style="margin-top:10px;font-family:Inter,Arial,sans-serif;font-size:12px;line-height:18px;color:#f6ead3;text-transform:uppercase;letter-spacing:2px;">Verification code</div>
              </td>
            </tr>
          </table>
        </td>
      </tr>`
    : "";

  const fallbackBlock = definition.fallback && safeHref
    ? `
      <tr>
        <td style="padding:0 24px 24px 24px;background:#ffffff;">
          <div style="font-family:Inter,Arial,sans-serif;font-size:13px;line-height:20px;color:#46385d;margin-bottom:8px;">Button not working? Copy and paste this link:</div>
          <div style="word-break:break-all;font-family:Inter,Arial,sans-serif;font-size:12px;line-height:18px;color:#6f4cb6;">${safeHref}</div>
        </td>
      </tr>`
    : "";

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <title>${safeSubject}</title>
  <style>
    body { margin:0; padding:0; background:#14091f; }
    img { border:0; display:block; max-width:100%; }
    table { border-collapse:collapse; }
    @media only screen and (max-width:640px) {
      .container { width:100% !important; }
      .inner-pad { padding-left:16px !important; padding-right:16px !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background:#14091f;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;background:#14091f;margin:0;padding:24px 0;">
    <tr>
      <td align="center">
        <table role="presentation" width="640" cellpadding="0" cellspacing="0" class="container" style="width:640px;max-width:640px;margin:0 auto;">
          <tr>
            <td style="padding:0;">${linkedImage}</td>
          </tr>
          ${tokenBlock}
          ${fallbackBlock}
          <tr>
            <td class="inner-pad" style="padding:0 24px 24px 24px;background:#ffffff;">
              <div style="font-family:Inter,Arial,sans-serif;font-size:13px;line-height:20px;color:#6b6178;text-align:center;">${safeNote}</div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return {
    definition,
    subject: definition.subject,
    html,
    href,
    imageUrl,
  };
}

export const crownmeExactEmailTemplates = Object.fromEntries(
  crownmeExactEmailDefinitions.map((definition) => [definition.key, definition])
) as Record<CrownMeExactEmailKey, CrownMeExactEmailDefinition>;

export const crownmeExactAuthEmailTemplates = crownmeExactEmailDefinitions.filter(
  (definition) => definition.supabase
);