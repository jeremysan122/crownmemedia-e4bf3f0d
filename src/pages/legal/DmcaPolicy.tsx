import LegalShell, { H2, P, UL } from "@/components/legal/LegalShell";

export default function DmcaPolicy() {
  return (
    <LegalShell title="DMCA & Copyright Policy" effectiveDate="May 2, 2026">
      <P>
        CrownMe Media respects the intellectual-property rights of others. We respond to clear
        notices of alleged copyright infringement that comply with the U.S. Digital
        Millennium Copyright Act (DMCA) and to similar requests under other applicable laws.
      </P>

      <H2>1. Filing a Notice of Infringement</H2>
      <P>
        Send a written notice to our Designated Copyright Agent that includes ALL of the
        following:
      </P>
      <UL>
        <li>Your physical or electronic signature.</li>
        <li>Identification of the copyrighted work claimed to be infringed.</li>
        <li>Identification of the material that is allegedly infringing — please include the full CrownMe Media URL(s).</li>
        <li>Your contact information (name, address, phone, email).</li>
        <li>A statement that you have a good-faith belief the use is not authorized by the copyright owner, its agent, or the law.</li>
        <li>A statement, under penalty of perjury, that the information is accurate and that you are the owner or authorized to act on the owner's behalf.</li>
      </UL>

      <H2>2. Designated Copyright Agent</H2>
      <P>
        CrownMe Media — Copyright Agent<br />
        Wisconsin, USA<br />
        Email: <a className="underline text-primary" href="mailto:support@crownmemedia.com">support@crownmemedia.com</a>{" "}
        (subject: "DMCA Notice")
      </P>

      <H2>3. Counter-Notices</H2>
      <P>
        If you believe content was removed in error, you may submit a counter-notice that
        includes (a) your signature; (b) identification of the removed content and its
        prior location; (c) a statement under penalty of perjury that you have a good-faith
        belief the content was removed by mistake or misidentification; (d) your name,
        address, phone number; and (e) consent to jurisdiction of the federal court in
        Wisconsin and acceptance of service from the original notifier.
      </P>

      <H2>4. Repeat Infringers</H2>
      <P>
        We will terminate accounts of users found to be repeat infringers under appropriate
        circumstances.
      </P>

      <H2>5. Misrepresentations</H2>
      <P>
        Knowingly making material misrepresentations in a notice or counter-notice may
        result in liability for damages, costs, and attorneys' fees under 17 U.S.C. § 512(f).
      </P>
    </LegalShell>
  );
}
