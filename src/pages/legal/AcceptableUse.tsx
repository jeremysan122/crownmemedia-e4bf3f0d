import LegalShell, { H2, P, UL } from "@/components/legal/LegalShell";

export default function AcceptableUse() {
  return (
    <LegalShell title="Acceptable Use Policy" effectiveDate="May 2, 2026">
      <P>
        This Acceptable Use Policy ("AUP") supplements our{" "}
        <a className="underline text-primary" href="/terms">Terms of Service</a> and{" "}
        <a className="underline text-primary" href="/conduct">Community Guidelines</a> and
        sets out specific behaviors that are prohibited on CrownMe Media.
      </P>

      <H2>Prohibited Content</H2>
      <UL>
        <li>Illegal content under U.S. federal law or the laws of your jurisdiction.</li>
        <li>Sexually explicit material, nudity, or sexually suggestive content involving any person who is, or appears to be, under 18 (zero tolerance).</li>
        <li>Content that promotes terrorism, violent extremism, or organized criminal activity.</li>
        <li>Content that promotes self-harm, suicide, or eating disorders.</li>
        <li>Content that incites violence or hatred against protected groups.</li>
        <li>Content infringing intellectual-property or privacy rights of others.</li>
      </UL>

      <H2>Prohibited Behavior</H2>
      <UL>
        <li>Harassment, threats, stalking, doxxing, or coordinated attacks.</li>
        <li>Impersonation or misrepresentation of identity, affiliation, or expertise.</li>
        <li>Spam, mass messaging, unsolicited promotion, or pyramid/MLM schemes.</li>
        <li>Vote manipulation, gaming the crown ranking, or coordinated battle rigging.</li>
        <li>Use of bots, scrapers, scripts, or automation without our written permission.</li>
        <li>Creating multiple accounts to evade bans or rate limits.</li>
        <li>Buying or selling accounts, votes, crowns, or in-app items for real money.</li>
      </UL>

      <H2>Prohibited Technical Activity</H2>
      <UL>
        <li>Probing, scanning, or testing the vulnerability of the Service without authorization.</li>
        <li>Bypassing or circumventing security, access controls, or rate limits.</li>
        <li>Uploading malware, viruses, or harmful code.</li>
        <li>Interfering with the Service's operation, including denial-of-service attacks.</li>
        <li>Scraping, harvesting, or replicating substantial portions of the Service or user data.</li>
      </UL>

      <H2>Reporting & Enforcement</H2>
      <P>
        Violations may result in content removal, feature restriction, suspension,
        termination, IP/device blocking, forfeiture of in-app items, and referral to law
        enforcement. Report violations via the in-app Report button or to{" "}
        <a className="underline text-primary" href="mailto:support@crownmemedia.com">support@crownmemedia.com</a>.
      </P>

      <H2>Responsible Disclosure</H2>
      <P>
        If you believe you have found a security vulnerability, please email{" "}
        <a className="underline text-primary" href="mailto:support@crownmemedia.com">support@crownmemedia.com</a>{" "}
        with subject "Security Disclosure." Do not publicly disclose until we have had a
        reasonable opportunity to remediate. We will not pursue legal action against
        researchers acting in good faith.
      </P>
    </LegalShell>
  );
}
