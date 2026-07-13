import LegalShell, { H2, P, UL } from "@/components/legal/LegalShell";

export default function SubscriptionTerms() {
  return (
    <LegalShell title="Subscription Terms (Royal Pass)" effectiveDate="July 13, 2026" lastUpdated="July 13, 2026" version="1.3">
      <H2>1. The Royal Pass</H2>
      <P>
        The Royal Pass is an optional auto-renewing subscription that unlocks premium
        features described in the in-app store at the time of purchase, which currently
        include exclusive cosmetics, profile flair, priority features, and a monthly
        allowance of 5 Crown Shields. Benefits may change over time; we will provide
        reasonable advance notice of any material reduction and, where required by law,
        allow you to cancel before the change takes effect.
      </P>

      <H2>2. Pricing, Currency & Taxes</H2>
      <P>
        Prices are displayed in your local currency where supported and, for EU/UK
        consumers, are shown inclusive of applicable VAT/GST. Prices may vary by country
        and platform and may change. Any price change for an existing subscriber will be
        communicated at least 30 days in advance, and you may cancel before the change
        takes effect. You are responsible for any additional taxes required by your
        jurisdiction.
      </P>

      <H2>3. Billing, Auto-Renewal & Renewal Reminders</H2>
      <UL>
        <li>Subscriptions begin upon purchase and <strong>renew automatically at the end of each billing cycle</strong> (e.g., monthly or annually) at the then-current price until cancelled.</li>
        <li>Payment is charged to your selected payment method or to your Apple ID / Google Play account for in-app purchases.</li>
        <li>You will not be billed if you cancel at least 24 hours before the end of the current period.</li>
        <li><strong>California residents:</strong> Consistent with California's Automatic Renewal Law, we disclose auto-renewal terms clearly before purchase, obtain your affirmative consent, send an acknowledgement, and provide an easy online cancellation method.</li>
        <li><strong>EU / EEA residents:</strong> For annual subscriptions, we send a renewal reminder at least 14 days before automatic renewal, in line with local consumer-law requirements.</li>
      </UL>

      <H2>4. Cancellation</H2>
      <UL>
        <li><strong>Apple App Store:</strong> cancel via Settings → [Your Name] → Subscriptions on your iOS device.</li>
        <li><strong>Google Play:</strong> cancel via the Play Store app → Profile → Payments &amp; subscriptions → Subscriptions.</li>
        <li><strong>Web (Stripe):</strong> cancel from Settings → Wallet &amp; Billing or via the customer portal link in your receipt.</li>
        <li>Cancellation takes effect at the end of the current paid period. You retain access until then.</li>
      </UL>

      <H2>5. Free Trials & Promotions</H2>
      <P>
        If a free trial is offered, you must cancel before the trial ends to avoid being
        charged. Trial eligibility is determined by us and the relevant platform; only
        one trial per user per product unless otherwise stated. Introductory pricing
        reverts to the standard price at the end of the promotional period, disclosed
        before you purchase.
      </P>

      <H2>6. Refunds & Right of Withdrawal</H2>
      <P>
        Except as required by applicable law or by Apple / Google's policies,
        subscription fees are non-refundable. Purchases made through the App Store or
        Google Play must be refunded through those platforms.
      </P>
      <P>
        <strong>EU / EEA / UK consumers</strong> have a statutory 14-day right of
        withdrawal for distance-purchased digital services. By purchasing the Royal Pass
        and expressly requesting that we begin providing the digital content immediately,
        you acknowledge that (a) performance begins during the withdrawal period at your
        request, and (b) you lose the right of withdrawal once performance has begun with
        your consent, to the extent permitted by local law. Where the right of withdrawal
        still applies, contact{" "}
        <a className="underline text-primary" href="mailto:support@crownmemedia.com">support@crownmemedia.com</a>{" "}
        with subject "Withdrawal Request."
      </P>

      <H2>7. Chargebacks & Payment Disputes</H2>
      <P>
        Please contact us before initiating a chargeback so we can resolve billing issues
        quickly. Chargebacks that we determine to be abusive or fraudulent may result in
        the loss of Virtual Items associated with the disputed purchase and, in repeat
        cases, account suspension.
      </P>

      <H2>8. Founder Program</H2>
      <P>
        The Founder Program is a limited recognition tier tied to your subscription. It
        confers cosmetic and status benefits only, is subject to availability, and grants
        no equity, revenue share, security, voting right, or ownership interest in
        CrownMe Media. Founder status may be revoked for violations of our Terms or
        applicable law.
      </P>

      <H2>9. Changes</H2>
      <P>
        We may change these Subscription Terms; material changes will be communicated at
        least 14 days in advance and, where required, prior consent will be obtained
        before the change applies to existing subscribers.
      </P>

      <H2>10. Contact</H2>
      <P>
        Billing questions:{" "}
        <a className="underline text-primary" href="mailto:support@crownmemedia.com">support@crownmemedia.com</a>
      </P>
    </LegalShell>
  );
}
