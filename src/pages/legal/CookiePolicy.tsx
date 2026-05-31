import LegalShell, { H2, P, UL } from "@/components/legal/LegalShell";

export default function CookiePolicy() {
  return (
    <LegalShell title="Cookie Policy" effectiveDate="May 2, 2026" lastUpdated="May 30, 2026">
      <P>
        This Cookie Policy explains how CrownMe Media (operated by CrownMe Media) uses
        cookies and similar technologies (e.g., local storage, SDKs, pixels) on our web and
        mobile services.
      </P>

      <H2>1. What are cookies?</H2>
      <P>
        Cookies are small text files placed on your device when you visit a site. "Similar
        technologies" includes browser local/session storage, IndexedDB, mobile SDK
        identifiers, and pixels. We refer to all of these collectively as "cookies."
      </P>

      <H2>2. Categories we use</H2>
      <UL>
        <li><strong>Strictly necessary</strong> — required for sign-in, security (CSRF, age confirmation), and core functionality. These cannot be turned off.</li>
        <li><strong>Functional</strong> — remember preferences (e.g., theme, last selected feed tab, filter sort).</li>
        <li><strong>Analytics</strong> — help us understand how the Service is used so we can improve it (page views, crashes, performance).</li>
        <li><strong>Advertising / sharing</strong> — currently CrownMe Media does not run third-party advertising. If this changes, we will update this policy and request consent where required.</li>
      </UL>

      <H2>3. Specific examples</H2>
      <UL>
        <li><code>sb-*</code> — Supabase authentication session (necessary).</li>
        <li><code>cm.feedTab</code>, <code>cm.filterSort</code> — remember last Feed tab and filter sort (functional).</li>
        <li><code>cm.notifPrefs</code> — your notification toggle preferences (functional).</li>
        <li>Crash and performance telemetry — anonymous, aggregated.</li>
      </UL>

      <H2>4. Managing cookies</H2>
      <P>
        Most browsers let you block or delete cookies via their settings. Mobile devices
        let you reset advertising identifiers. Note that disabling strictly necessary
        cookies will prevent core features such as login from working.
      </P>

      <H2>5. Do Not Track / Global Privacy Control</H2>
      <P>
        We honor the Global Privacy Control (GPC) signal as a request to opt out of any
        future "sharing" of personal information for cross-context behavioral advertising
        under California law.
      </P>

      <H2>6. Updates</H2>
      <P>
        We will update this policy as our use of cookies changes. Material changes will be
        announced in-app.
      </P>

      <H2>7. Contact</H2>
      <P>
        <a className="underline text-primary" href="mailto:support@crownmemedia.com">support@crownmemedia.com</a>
      </P>
    </LegalShell>
  );
}
