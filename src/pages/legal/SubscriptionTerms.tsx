import LegalShell, { H2, P, UL } from "@/components/legal/LegalShell";

export default function SubscriptionTerms() {
  return (
    <LegalShell title="Subscription Terms (Royal Pass)" effectiveDate="May 2, 2026" lastUpdated="May 30, 2026">
      <H2>1. The Royal Pass</H2>
      <P>
        The Royal Pass is an optional auto-renewing subscription that unlocks premium
        features such as exclusive cosmetics, profile flair, and other benefits described
        in the in-app store at the time of purchase. Benefits may change over time; we
        will provide reasonable notice of material reductions.
      </P>

      <H2>2. Pricing & Currency</H2>
      <P>
        Prices are displayed in your local currency where supported. Prices may vary by
        country and platform and may change. Any price change for an existing subscriber
        will be communicated at least 30 days in advance, and you may cancel before the
        change takes effect.
      </P>

      <H2>3. Billing & Auto-Renewal</H2>
      <UL>
        <li>Subscriptions begin upon purchase and renew automatically at the end of each billing cycle (e.g., monthly or annually) until cancelled.</li>
        <li>Payment is charged to your selected payment method or to your Apple ID / Google Play account for in-app purchases.</li>
        <li>You will not be billed if you cancel at least 24 hours before the end of the current period.</li>
      </UL>

      <H2>4. Cancellation</H2>
      <UL>
        <li><strong>Apple App Store</strong>: cancel via Settings → [Your Name] → Subscriptions on your iOS device.</li>
        <li><strong>Google Play</strong>: cancel via the Play Store app → Profile → Payments & subscriptions → Subscriptions.</li>
        <li><strong>Web (Stripe)</strong>: cancel from Settings → Wallet & Billing or via the customer portal link in your receipt.</li>
        <li>Cancellation takes effect at the end of the current paid period. You retain access until then.</li>
      </UL>

      <H2>5. Free Trials & Promotions</H2>
      <P>
        If a free trial is offered, you must cancel before the trial ends to avoid being
        charged. Trial eligibility is determined by us and the relevant platform; only one
        trial per user per product unless otherwise stated.
      </P>

      <H2>6. Refunds</H2>
      <P>
        Except as required by applicable law or by Apple/Google's policies, subscription
        fees are non-refundable. EU/UK consumers have a 14-day right of withdrawal that you
        may waive by beginning to use the digital content immediately upon purchase; by
        purchasing and using the Royal Pass you acknowledge that the right of withdrawal
        is lost upon first use.
      </P>

      <H2>7. Changes</H2>
      <P>
        We may change these Subscription Terms; material changes will be communicated at
        least 14 days in advance.
      </P>

      <H2>8. Contact</H2>
      <P>
        Billing questions:{" "}
        <a className="underline text-primary" href="mailto:support@crownmemedia.com">support@crownmemedia.com</a>
      </P>
    </LegalShell>
  );
}
