import LegalShell, { H2, P } from "@/components/legal/LegalShell";

export default function Eula() {
  return (
    <LegalShell title="End-User License Agreement" effectiveDate="July 13, 2026" lastUpdated="July 13, 2026" version="1.3" shellTitle="EULA">
      <P>
        This End-User License Agreement ("EULA") governs your use of the CrownMe Media
        mobile and web applications (the "App") provided by CrownMe Media, LLC
        ("Licensor").
      </P>

      <H2>1. License Grant</H2>
      <P>
        Subject to your compliance with this EULA and our{" "}
        <a className="underline text-primary" href="/terms">Terms of Service</a>, Licensor
        grants you a personal, limited, non-exclusive, non-transferable, non-sublicensable,
        revocable license to install and use the App on a device you own or control,
        solely for your personal, non-commercial use.
      </P>

      <H2>2. Restrictions</H2>
      <P>
        You will not (and will not permit any third party to): (a) copy, modify, or
        create derivative works of the App; (b) reverse engineer, decompile, or
        disassemble the App except to the extent allowed by law; (c) rent, lease, lend,
        sell, or sublicense the App; (d) remove proprietary notices; (e) use the App to
        develop a competing product; (f) circumvent access controls, feature flags, or
        age gating; or (g) use the App in violation of law.
      </P>

      <H2>3. Updates</H2>
      <P>
        Licensor may provide updates, upgrades, and patches automatically. The App may
        require periodic updates to remain functional and to comply with app-store
        requirements. This EULA governs all updates unless a separate license accompanies
        them.
      </P>

      <H2>4. Ownership</H2>
      <P>
        The App is licensed, not sold. Licensor and its licensors retain all right,
        title, and interest in and to the App, including all intellectual-property
        rights.
      </P>

      <H2>5. Real-Time Communications</H2>
      <P>
        The App includes real-time audio and video features (Battle Arena Live Sessions)
        powered by third-party media infrastructure. Your use of these features requires
        working camera and microphone permissions on your device and adequate network
        connectivity. Licensor is not responsible for network or device conditions
        outside its control.
      </P>

      <H2>6. Apple-Specific Terms</H2>
      <P>
        If you obtained the App from the Apple App Store, you acknowledge that: (a) this
        EULA is between you and Licensor only, not Apple; (b) Apple is not responsible
        for the App or any claims; (c) Apple has no warranty obligation; (d) in the
        event of a product-liability claim, claim that the App fails to conform to
        legal requirements, or claim arising under consumer-protection law, Apple is not
        responsible; (e) any third-party intellectual-property claim will be Licensor's
        sole responsibility; and (f) Apple and its subsidiaries are third-party
        beneficiaries of this EULA with the right to enforce it.
      </P>

      <H2>7. Google-Specific Terms</H2>
      <P>
        If you obtained the App from Google Play, your use is also subject to the Google
        Play Terms of Service and Google's developer policies.
      </P>

      <H2>8. U.S. Government End Users</H2>
      <P>
        The App is "commercial computer software." Government use is subject to the
        restrictions of this EULA per FAR §12.212 and DFARS §227.7202.
      </P>

      <H2>9. Termination</H2>
      <P>
        This EULA is effective until terminated. Your rights terminate automatically if
        you breach. Upon termination you must cease using and destroy all copies of the
        App.
      </P>

      <H2>10. Disclaimer & Limitation</H2>
      <P>
        Subject to the disclaimers and limitation of liability in our Terms of Service,
        which are incorporated by reference. Nothing in this EULA limits rights that
        cannot be excluded under applicable consumer law.
      </P>

      <H2>11. Contact</H2>
      <P>
        CrownMe Media, LLC ·{" "}
        <a className="underline text-primary" href="mailto:support@crownmemedia.com">support@crownmemedia.com</a>
      </P>
    </LegalShell>
  );
}
