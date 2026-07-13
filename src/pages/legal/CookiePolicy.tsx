import LegalShell, { H2, P, UL } from "@/components/legal/LegalShell";

export default function CookiePolicy() {
  return (
    <LegalShell title="Cookie Policy" effectiveDate="July 13, 2026" lastUpdated="July 13, 2026" version="1.3">
      <P>
        This Cookie Policy explains how CrownMe Media, LLC uses cookies and similar
        technologies (e.g., local storage, SDKs, pixels, mobile identifiers) on our web
        and mobile services.
      </P>

      <H2>1. What are cookies?</H2>
      <P>
        Cookies are small text files placed on your device when you visit a site.
        "Similar technologies" includes browser local/session storage, IndexedDB, mobile
        SDK identifiers, and pixels. We refer to all of these collectively as "cookies."
      </P>

      <H2>2. Categories we use</H2>
      <UL>
        <li><strong>Strictly necessary</strong> — required for sign-in, security (CSRF, age confirmation), payment processing, real-time media routing (LiveKit signalling), and core functionality. These cannot be turned off.</li>
        <li><strong>Functional</strong> — remember preferences (e.g., theme, last selected feed tab, filter sort, notification prefs, self-view filter).</li>
        <li><strong>Analytics</strong> — help us understand how the Service is used so we can improve it (page views, crashes, performance). Where required, we ask for your consent before setting analytics cookies.</li>
        <li><strong>Advertising / sharing</strong> — CrownMe Media does not currently run third-party advertising. If this changes, we will update this policy and request consent where required.</li>
      </UL>

      <H2>3. Specific examples</H2>
      <UL>
        <li><code>sb-*</code> — authentication session (strictly necessary).</li>
        <li><code>cm.feedTab</code>, <code>cm.filterSort</code> — remember last Feed tab and filter sort (functional).</li>
        <li><code>cm.notifPrefs</code> — your notification toggle preferences (functional).</li>
        <li>LiveKit session tokens (in-memory) — establish real-time audio/video connections during Battle Arena Live Sessions (strictly necessary while the session is active).</li>
        <li>Crash and performance telemetry — pseudonymised and aggregated.</li>
      </UL>

      <H2>4. EU / UK Consent</H2>
      <P>
        In the EU, EEA, and UK, we obtain your consent before setting non-essential
        cookies through our in-app consent banner. You can change your choices at any
        time from Settings → Privacy &amp; Data.
      </P>

      <H2>5. Managing cookies</H2>
      <P>
        Most browsers let you block or delete cookies via their settings. Mobile devices
        let you reset advertising identifiers. Note that disabling strictly necessary
        cookies will prevent core features such as login and Live Sessions from working.
      </P>

      <H2>6. Do Not Track / Global Privacy Control</H2>
      <P>
        We honor the Global Privacy Control (GPC) signal as a request to opt out of any
        future "sharing" of personal information for cross-context behavioral advertising
        under California law.
      </P>

      <H2>7. Updates</H2>
      <P>
        We will update this policy as our use of cookies changes. Material changes will
        be announced in-app.
      </P>

      <H2>8. Contact</H2>
      <P>
        <a className="underline text-primary" href="mailto:support@crownmemedia.com">support@crownmemedia.com</a>
      </P>
    </LegalShell>
  );
}
