import LegalShell, { H2, P, UL } from "@/components/legal/LegalShell";

export default function CsaePolicy() {
  return (
    <LegalShell title="Child Safety & CSAE Standards" effectiveDate="July 13, 2026" lastUpdated="July 13, 2026" version="1.3">
      <P>
        CrownMe Media, LLC has zero tolerance for child sexual abuse and exploitation
        ("CSAE"). This document describes our standards in compliance with the Google
        Play CSAE Standards, Apple App Store Review Guidelines, the UK Online Safety
        Act, the EU Digital Services Act, and equivalent laws, and explains how we
        prevent, detect, respond to, and report CSAE on our Service.
      </P>

      <H2>1. Scope</H2>
      <P>
        CrownMe Media is strictly an 18+ platform. We prohibit minors from creating or
        using accounts and prohibit any sexual content involving minors anywhere on the
        Service, including profiles, posts, comments, direct messages, gifts, usernames,
        bios, emotes, and Live Sessions.
      </P>

      <H2>2. What Is Prohibited</H2>
      <UL>
        <li>Child sexual abuse material (CSAM) of any kind.</li>
        <li>Sexualized depictions of minors, including computer-generated, drawn, or AI-generated content.</li>
        <li>Grooming behavior, including attempts to befriend, isolate, or sexualize a minor.</li>
        <li>Solicitation of minors for sexual contact, sexual imagery, or sexual conversation.</li>
        <li>Sextortion (using sexual content to threaten or coerce a minor).</li>
        <li>Trafficking, smuggling, or commercial sexual exploitation of children.</li>
        <li>Sharing personal information of a minor in a sexual context.</li>
      </UL>

      <H2>3. Age Verification</H2>
      <UL>
        <li>Self-declared date of birth at signup with hard 18+ gate.</li>
        <li>Repeated age confirmation prompts and re-verification on suspicious signals.</li>
        <li>Moderator and admin tools to revoke age confirmation, which forces immediate sign-out and re-verification.</li>
        <li>Additional age-eligibility gate before entering the Battle Arena or starting a Live Session.</li>
      </UL>

      <H2>4. Detection & Prevention</H2>
      <UL>
        <li>Automated scanning of uploaded media for known CSAM hashes.</li>
        <li>Keyword and behavioral signals in messages, posts, and Live Session metadata trigger human review.</li>
        <li>Rate limits, friction on new accounts, and pattern detection for grooming behavior.</li>
        <li>Restrictions on direct messaging and Live Sessions until trust signals are met.</li>
        <li>Live Session moderators may mute, kick, or ban participants and preserve evidence when abuse is suspected.</li>
      </UL>

      <H2>5. Reporting</H2>
      <P>
        Every post, comment, message, Live Session, and profile has an in-app Report
        button with a dedicated "Child safety" category. Reports are routed immediately
        to our priority safety queue for human review.
      </P>
      <P>
        You may also email{" "}
        <a className="underline text-primary" href="mailto:support@crownmemedia.com">support@crownmemedia.com</a>{" "}
        with subject "URGENT: CHILD SAFETY." We aim to triage within 24 hours.
      </P>

      <H2>6. Response & Reporting to Authorities</H2>
      <UL>
        <li>Confirmed CSAM is preserved as required and reported to the U.S. National Center for Missing &amp; Exploited Children (NCMEC) CyberTipline, and to law enforcement and analogous authorities (including the UK IWF and INHOPE network members) in other jurisdictions where required.</li>
        <li>Offending accounts are permanently banned and devices / IPs blocked where lawful.</li>
        <li>We cooperate with valid legal process from law-enforcement agencies investigating CSAE.</li>
      </UL>

      <H2>7. In-App Designated Point of Contact</H2>
      <P>
        Child-safety lead:{" "}
        <a className="underline text-primary" href="mailto:support@crownmemedia.com">support@crownmemedia.com</a>{" "}
        (subject: "CSAE Contact"). For law enforcement, use subject "Law Enforcement
        Request."
      </P>

      <H2>8. Survivor Resources</H2>
      <UL>
        <li>U.S.: NCMEC — <a className="underline text-primary" href="https://www.missingkids.org" target="_blank" rel="noopener noreferrer">missingkids.org</a> · CyberTipline 1-800-843-5678.</li>
        <li>U.K.: NSPCC — 0808 800 5000 · Internet Watch Foundation — <a className="underline text-primary" href="https://www.iwf.org.uk" target="_blank" rel="noopener noreferrer">iwf.org.uk</a>.</li>
        <li>International: INHOPE network — <a className="underline text-primary" href="https://www.inhope.org" target="_blank" rel="noopener noreferrer">inhope.org</a>.</li>
      </UL>
    </LegalShell>
  );
}
