import LegalShell, { H2, H3, P, UL } from "@/components/legal/LegalShell";

export default function PrivacyPolicy() {
  return (
    <LegalShell title="Privacy Policy" effectiveDate="July 13, 2026" lastUpdated="July 13, 2026" version="1.3" pdfSlug="crownme-privacy">
      <P>
        This Privacy Policy explains how CrownMe Media, LLC ("CrownMe Media," "we," "us"),
        collects, uses, shares, and protects information about you when you use our
        website, mobile applications, Battle Arena live video features, tournaments, and
        related services (the "Service"). It applies globally and incorporates rights
        granted by the EU/UK GDPR, California's CCPA/CPRA, Brazil's LGPD, Canada's PIPEDA,
        Australia's Privacy Act, and other applicable privacy laws.
      </P>

      <H2>1. Information We Collect</H2>
      <H3>1.1 Information you provide</H3>
      <UL>
        <li><strong>Account data</strong>: email address, username, password (hashed), date of birth, optional profile photo, bio, city/state/country.</li>
        <li><strong>Content</strong>: photos, captions, comments, votes, direct messages, emotes, gift transactions, and metadata you provide.</li>
        <li><strong>Live Session data</strong>: for Battle Arena and other live features, we process real-time camera and microphone streams, reactions, chat, presence, viewer counts, and pre-flight audio/video device checks. Live streams are transmitted in real time; we may record segments for safety, moderation, dispute resolution, or where required by law.</li>
        <li><strong>Payment data</strong>: processed by Stripe and the Apple / Google app stores. We receive transaction confirmations, currency, and card last-4 / brand, never full card numbers.</li>
        <li><strong>Subscription & Founder data</strong>: Royal Pass status, renewal date, Crown Shield ledger, Founder tier, and immutable financial audit records.</li>
        <li><strong>Support & moderation communications</strong>: messages, reports, appeals, and identity-verification materials you send us.</li>
      </UL>
      <H3>1.2 Information collected automatically</H3>
      <UL>
        <li><strong>Device & technical</strong>: IP address, device type, OS, browser type, app version, language, time zone.</li>
        <li><strong>Usage</strong>: pages viewed, votes cast, screens visited, session duration, tournament participation, moderation actions, crash reports, and performance metrics.</li>
        <li><strong>Approximate location</strong>: derived from IP and any city/state you provide. We do not collect precise GPS unless you explicitly enable a feature that requires it.</li>
        <li><strong>Cookies & similar</strong>: see our <a className="underline text-primary" href="/cookies">Cookie Policy</a>.</li>
      </UL>
      <H3>1.3 Information from third parties</H3>
      <UL>
        <li>Sign-in providers (e.g., Google, Apple) — we receive your email, name, and profile picture.</li>
        <li>Payment processors and app stores — to confirm and reconcile transactions and manage subscriptions, refunds, and chargebacks.</li>
        <li>Real-time media (LiveKit) — signaling and turn-server metadata required to route your Live Session.</li>
        <li>Analytics, crash reporting, and abuse-prevention providers.</li>
      </UL>

      <H2>2. How We Use Information</H2>
      <UL>
        <li>Provide, maintain, and improve the Service, including feeds, battles, tournaments, and live streaming.</li>
        <li>Authenticate users and verify age (18+).</li>
        <li>Personalize feeds, recommendations, and rankings.</li>
        <li>Process payments for shekels, gifts, boosts, Crown Shields, and the Royal Pass, and reconcile Founder ledger entries.</li>
        <li>Detect and prevent fraud, vote manipulation, tournament collusion, abuse, CSAE, and security incidents.</li>
        <li>Send transactional messages (security alerts, receipts, renewal reminders) and, where permitted, promotional messages you can opt out of.</li>
        <li>Comply with legal obligations (including tax, consumer protection, DSA statements of reasons, and law-enforcement requests) and enforce our Terms.</li>
      </UL>

      <H2>3. Legal Bases (EEA/UK)</H2>
      <P>
        We rely on the following lawful bases under the GDPR/UK GDPR: (a) performance of
        a contract (providing the Service you signed up for and the Royal Pass); (b)
        legitimate interests (security, fraud prevention, product improvement, moderation,
        integrity of battles and tournaments); (c) consent (optional cookies, camera and
        microphone access for Live Sessions, push notifications, marketing); (d) legal
        obligations (tax, consumer-protection, CSAE reporting, DSA); and (e) vital
        interests (imminent safety threats).
      </P>

      <H2>4. How We Share Information</H2>
      <UL>
        <li><strong>Other users</strong>: profile information, posts, comments, votes, live-session audio/video, presence, and gifts are visible per your privacy settings and the audience of the feature.</li>
        <li><strong>Service providers (subprocessors)</strong>: hosting and database (Lovable Cloud), real-time media (LiveKit), payments and subscriptions (Stripe), Apple App Store and Google Play (in-app purchases), transactional email delivery, analytics, error tracking, content delivery, and customer support — all bound by contract to use data only on our instructions and with appropriate safeguards.</li>
        <li><strong>Legal & safety</strong>: to comply with law, lawful requests, or to protect rights, property, or safety, including reporting CSAM to NCMEC and equivalent authorities.</li>
        <li><strong>Business transfers</strong>: in connection with a merger, acquisition, financing, or asset sale, with notice to you.</li>
        <li><strong>With your consent</strong>: any other sharing you authorize.</li>
      </UL>
      <P><strong>We do not sell your personal information for money.</strong> We may share limited identifiers with analytics providers which, under California law, can be considered "sharing" for cross-context behavioral advertising. You can opt out — see Section 8.</P>

      <H2>5. International Data Transfers</H2>
      <P>
        We are headquartered in the United States and process data in the U.S. and other
        countries where our service providers operate. For transfers from the EEA, UK, or
        Switzerland to countries without an adequacy decision, we rely on the European
        Commission's Standard Contractual Clauses (2021), the UK International Data
        Transfer Addendum, and supplementary measures as appropriate.
      </P>

      <H2>6. Data Retention</H2>
      <P>
        We retain data only as long as needed for the purposes described:
      </P>
      <UL>
        <li><strong>Account data</strong>: while your account is active, plus up to 90 days after deletion for backups and legal obligations.</li>
        <li><strong>Content (posts, comments, DMs)</strong>: until you delete them or your account is closed; backups purged within 90 days.</li>
        <li><strong>Live Session recordings (where captured)</strong>: up to 30 days for routine safety review, longer where required to preserve evidence of prohibited conduct or comply with legal process.</li>
        <li><strong>Payment and subscription records</strong>: retained for the period required by tax and financial-regulatory law (typically 7 years).</li>
        <li><strong>Moderation and audit logs</strong>: retained for the lifetime of the underlying content and a reasonable period thereafter for regulator response.</li>
        <li><strong>CSAE-related evidence</strong>: preserved as required by law for reporting to NCMEC and law enforcement.</li>
      </UL>

      <H2>7. Your Rights</H2>
      <P>
        Depending on where you live, you may have the right to: access your data; correct
        inaccurate data; delete your data; restrict or object to processing; data
        portability; withdraw consent; opt out of automated decision-making with legal or
        similarly significant effects; and lodge a complaint with your local data
        protection authority.
      </P>
      <P>
        Submit requests to{" "}
        <a className="underline text-primary" href="mailto:support@crownmemedia.com">support@crownmemedia.com</a>{" "}
        with the subject "Privacy Request." We will verify your identity before acting
        and respond within the timeframes required by applicable law (typically 30–45
        days).
      </P>

      <H2>8. California Residents (CCPA/CPRA)</H2>
      <P>
        California residents have additional rights, including the right to know, delete,
        correct, limit use of sensitive personal information, and opt out of "sale" or
        "sharing" of personal information for cross-context behavioral advertising. We
        honor Global Privacy Control (GPC) signals. To exercise these rights, email{" "}
        <a className="underline text-primary" href="mailto:support@crownmemedia.com">support@crownmemedia.com</a>{" "}
        with subject "California Privacy Rights." We do not knowingly sell or share
        personal information of consumers under 16, and CrownMe Media is not directed to
        anyone under 18.
      </P>

      <H2>9. Children & Age Verification</H2>
      <P>
        CrownMe Media is not intended for and does not knowingly collect personal
        information from anyone under 18. If we learn we have collected information from
        a minor, we will delete it and terminate the associated account. See our{" "}
        <a className="underline text-primary" href="/csae-policy">Child Safety Policy</a>.
      </P>

      <H2>10. Security</H2>
      <P>
        We use industry-standard administrative, technical, and physical safeguards
        including encryption in transit (TLS), encryption at rest, role-based access
        control, row-level security on our database, immutable financial-integrity audit
        logs for Crown Shield and Founder ledgers, and continuous monitoring. No method
        of transmission or storage is 100% secure; you use the Service at your own risk.
        We will notify affected users and regulators of a personal-data breach where
        legally required and without undue delay.
      </P>

      <H2>11. Automated Decision-Making</H2>
      <P>
        We use automated systems to rank content, detect fraud, screen for CSAE, and
        flag potentially violating content for human review. We do not make decisions
        that produce legal or similarly significant effects on you solely by automated
        means; enforcement actions with meaningful impact are reviewed or reviewable by
        a human, and you may request human review by contacting us.
      </P>

      <H2>11A. Sensitive Content &amp; Moderation Data</H2>
      <P>
        To operate our Sensitive Content system we process: your age-eligibility
        confirmation and timestamp; your Content Filter preference; per-post fields{" "}
        (<code>is_sensitive</code>, <code>sensitive_reason</code>,{" "}
        <code>content_rating</code>, <code>moderation_status</code>,{" "}
        <code>moderation_notes</code>, <code>moderated_by</code>,{" "}
        <code>moderated_at</code>); and a tamper-resistant audit log of every moderation
        change. Audit entries are accessible only to admins and moderators, retained for
        the lifetime of the post and a reasonable period thereafter for legal, safety,
        and regulator response, and may be exported to fulfil lawful requests. See our{" "}
        <a className="underline text-primary" href="/sensitive-content">Sensitive Content Policy</a>{" "}
        for the user-facing rules.
      </P>

      <H2>12. Changes to This Policy</H2>
      <P>
        We may update this Privacy Policy. Material changes will be communicated via the
        app or email at least 14 days before they take effect.
      </P>

      <H2>13. Contact / Data Protection Officer</H2>
      <P>
        CrownMe Media, LLC · Wisconsin, USA<br />
        Privacy / DPO contact:{" "}
        <a className="underline text-primary" href="mailto:support@crownmemedia.com">support@crownmemedia.com</a>{" "}
        (subject: "Privacy Request")
      </P>
    </LegalShell>
  );
}
