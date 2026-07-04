import LegalShell, { H2, H3, P, UL } from "@/components/legal/LegalShell";

export default function PrivacyPolicy() {
  return (
    <LegalShell title="Privacy Policy" effectiveDate="May 2, 2026" lastUpdated="July 4, 2026" version="1.2" pdfSlug="crownme-privacy">
      <P>
        This Privacy Policy explains how CrownMe Media,
        ("CrownMe Media," "we," "us"), collects, uses, shares, and protects information about
        you when you use our website, mobile applications, and related services (the
        "Service"). It applies globally and incorporates rights granted by the EU/UK GDPR,
        California's CCPA/CPRA, Brazil's LGPD, and other applicable privacy laws.
      </P>

      <H2>1. Information We Collect</H2>
      <H3>1.1 Information you provide</H3>
      <UL>
        <li><strong>Account data</strong>: email address, username, password (hashed), date of birth, optional profile photo, bio, city/state/country.</li>
        <li><strong>Content</strong>: photos, captions, comments, votes, direct messages, gift transactions, and metadata you provide.</li>
        <li><strong>Payment data</strong>: processed by Stripe and the Apple/Google app stores. We receive transaction confirmations and last-4 digits, never full card numbers.</li>
        <li><strong>Support communications</strong>: messages you send to us.</li>
      </UL>
      <H3>1.2 Information collected automatically</H3>
      <UL>
        <li><strong>Device & technical</strong>: IP address, device type, OS, browser type, app version, language, time zone.</li>
        <li><strong>Usage</strong>: pages viewed, votes cast, screens visited, session duration, crash reports, performance metrics.</li>
        <li><strong>Approximate location</strong>: derived from IP and any city/state you provide. We do not collect precise GPS unless you explicitly enable a feature that requires it.</li>
        <li><strong>Cookies & similar</strong>: see our <a className="underline text-primary" href="/cookies">Cookie Policy</a>.</li>
      </UL>
      <H3>1.3 Information from third parties</H3>
      <UL>
        <li>Sign-in providers (e.g., Google, Apple) — we receive your email, name, and profile picture.</li>
        <li>Payment processors — to confirm and reconcile transactions.</li>
        <li>Analytics and error-monitoring providers.</li>
      </UL>

      <H2>2. How We Use Information</H2>
      <UL>
        <li>Provide, maintain, and improve the Service.</li>
        <li>Authenticate users and verify age (18+).</li>
        <li>Personalize feeds, recommendations, and rankings.</li>
        <li>Process payments for shekels, gifts, boosts, and the Royal Pass.</li>
        <li>Detect and prevent fraud, vote manipulation, abuse, and security incidents.</li>
        <li>Send transactional messages (security alerts, receipts) and, where permitted, promotional messages you can opt out of.</li>
        <li>Comply with legal obligations and enforce our Terms.</li>
      </UL>

      <H2>3. Legal Bases (EEA/UK)</H2>
      <P>
        We rely on the following lawful bases under the GDPR/UK GDPR: (a) performance of
        a contract (providing the Service you signed up for); (b) legitimate interests
        (security, fraud prevention, product improvement); (c) consent (optional cookies,
        push notifications, marketing); and (d) legal obligations.
      </P>

      <H2>4. How We Share Information</H2>
      <UL>
        <li><strong>Other users</strong>: profile information, posts, comments, votes, and gifts you make are visible per your privacy settings.</li>
        <li><strong>Service providers</strong>: hosting (Supabase / Lovable Cloud), payments (Stripe), email delivery, analytics, error tracking, content delivery, and customer support — bound by contract to use data only on our instructions.</li>
        <li><strong>Legal & safety</strong>: to comply with law, lawful requests, or to protect rights, property, or safety.</li>
        <li><strong>Business transfers</strong>: in connection with a merger, acquisition, or asset sale, with notice to you.</li>
        <li><strong>With your consent</strong>: any other sharing you authorize.</li>
      </UL>
      <P><strong>We do not sell your personal information for money.</strong> We may share limited identifiers with analytics or advertising vendors which, under California law, can be considered "sharing" for cross-context behavioral advertising. You can opt out — see Section 8.</P>

      <H2>5. International Data Transfers</H2>
      <P>
        We are headquartered in the United States and process data in the U.S. and other
        countries where our service providers operate. For transfers from the EEA, UK, or
        Switzerland to countries without an adequacy decision, we rely on Standard
        Contractual Clauses or other lawful transfer mechanisms.
      </P>

      <H2>6. Data Retention</H2>
      <P>
        We retain account data for as long as your account is active and for a reasonable
        period afterward to comply with legal obligations, resolve disputes, and enforce
        agreements. Posts and messages may persist as needed for the Service. You can
        delete content and your account at any time; backups are purged within 90 days.
      </P>

      <H2>7. Your Rights</H2>
      <P>
        Depending on where you live, you may have the right to: access your data; correct
        inaccurate data; delete your data; restrict or object to processing; data
        portability; withdraw consent; and lodge a complaint with a supervisory authority.
      </P>
      <P>
        Submit requests to{" "}
        <a className="underline text-primary" href="mailto:support@crownmemedia.com">support@crownmemedia.com</a>{" "}
        with the subject "Privacy Request." We will verify your identity before acting and
        respond within the timeframes required by applicable law (typically 30–45 days).
      </P>

      <H2>8. California Residents (CCPA/CPRA)</H2>
      <P>
        California residents have additional rights, including the right to know, delete,
        correct, limit use of sensitive personal information, and opt out of "sale" or
        "sharing" of personal information. To exercise these rights, email{" "}
        <a className="underline text-primary" href="mailto:support@crownmemedia.com">support@crownmemedia.com</a>{" "}
        with subject "California Privacy Rights." We do not knowingly sell personal
        information of consumers under 16.
      </P>

      <H2>9. Children & Age Verification</H2>
      <P>
        CrownMe Media is not intended for and does not knowingly collect personal information
        from anyone under 18. If we learn we have collected information from a minor, we
        will delete it. See our <a className="underline text-primary" href="/csae-policy">Child Safety Policy</a>.
      </P>

      <H2>10. Security</H2>
      <P>
        We use industry-standard administrative, technical, and physical safeguards
        including encryption in transit (TLS), encryption at rest, role-based access
        control, row-level security on our database, and continuous monitoring. No method
        of transmission or storage is 100% secure; you use the Service at your own risk.
      </P>

      <H2>11. Changes to This Policy</H2>
      <P>
        We may update this Privacy Policy. Material changes will be communicated via the
        app or email at least 14 days before they take effect.
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
        the lifetime of the post and a reasonable period thereafter for legal, safety, and
        regulator response, and may be exported as CSV to fulfil lawful requests. See our{" "}
        <a className="underline text-primary" href="/sensitive-content">Sensitive Content Policy</a>{" "}
        for the user-facing rules.
      </P>

      <H2>12. Contact / Data Protection Officer</H2>
      <P>
        CrownMe Media · Wisconsin, USA<br />
        Privacy/DPO contact:{" "}
        <a className="underline text-primary" href="mailto:support@crownmemedia.com">support@crownmemedia.com</a>
      </P>
    </LegalShell>
  );
}
