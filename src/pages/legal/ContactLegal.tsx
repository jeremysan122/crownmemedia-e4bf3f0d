import LegalShell, { H2, P } from "@/components/legal/LegalShell";

export default function ContactLegal() {
  return (
    <LegalShell title="Legal Contact & DPO" effectiveDate="May 2, 2026" lastUpdated="May 30, 2026">
      <P>
        CrownMe Media, is the
        controller of personal information processed through the Service. The official site is
        <a className="underline text-primary" href="https://www.crownmemedia.com"> crownmemedia.com</a>.
      </P>

      <H2>Mailing Address</H2>
      <P>
        CrownMe Media<br />
        Wisconsin, USA<br />
        (Full mailing address available on request for verified legal process.)
      </P>

      <H2>General Support</H2>
      <P>
        <a className="underline text-primary" href="mailto:support@crownmemedia.com">support@crownmemedia.com</a>
      </P>

      <H2>Privacy / Data Protection Officer</H2>
      <P>
        Subject line: "Privacy Request" — for access, deletion, correction, portability,
        opt-out, or other privacy rights.
      </P>

      <H2>Copyright (DMCA) Agent</H2>
      <P>
        Subject line: "DMCA Notice" — see our{" "}
        <a className="underline text-primary" href="/dmca">DMCA & Copyright Policy</a>.
      </P>

      <H2>Child Safety / CSAE</H2>
      <P>
        Subject line: "URGENT: CHILD SAFETY" — see our{" "}
        <a className="underline text-primary" href="/csae-policy">Child Safety Policy</a>.
        For emergencies, contact local law enforcement first.
      </P>

      <H2>Law Enforcement Requests</H2>
      <P>
        Subject line: "Law Enforcement Request." Include your agency, badge or ID number,
        a return email at your agency domain, and the legal process (subpoena, court
        order, search warrant). Emergency disclosure requests must include facts
        supporting reasonable belief of imminent danger of death or serious bodily injury.
      </P>

      <H2>Press</H2>
      <P>
        Subject line: "Press" — for media and partnership inquiries.
      </P>
    </LegalShell>
  );
}
