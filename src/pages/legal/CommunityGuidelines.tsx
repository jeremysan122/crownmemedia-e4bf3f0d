import LegalShell, { H2, H3, P, UL } from "@/components/legal/LegalShell";

export default function CommunityGuidelines() {
  return (
    <LegalShell title="Community Guidelines" effectiveDate="May 2, 2026" lastUpdated="July 4, 2026" version="1.2" shellTitle="Conduct" pdfSlug="crownme-community-guidelines">
      <P>
        CrownMe Media is an 18+ social photo-sharing community where members earn crowns through
        positive engagement. These Community Guidelines explain what is and is not allowed.
        Violating them may result in content removal, feature restrictions, account
        suspension, or permanent ban — even on first offense for severe violations.
      </P>

      <H2>1. Be Kind. Be Real.</H2>
      <UL>
        <li>Treat every member with respect, even when you disagree.</li>
        <li>Use your real likeness and identity. No impersonation.</li>
        <li>No coordinated harassment, pile-ons, or vote brigading.</li>
      </UL>

      <H2>2. Zero Tolerance — Immediate Permanent Ban</H2>
      <UL>
        <li><strong>Child sexual abuse and exploitation (CSAE)</strong>: any sexualized content involving minors, grooming, or solicitation. We report to NCMEC and law enforcement. See our <a className="underline text-primary" href="/csae-policy">Child Safety Policy</a>.</li>
        <li><strong>Non-consensual intimate imagery</strong> (revenge porn, deepfakes).</li>
        <li><strong>Threats of violence</strong>, terrorism, promotion of violent extremism.</li>
        <li><strong>Doxxing</strong> or sharing another person's private information without consent.</li>
        <li><strong>Sale of regulated/illegal goods</strong> (drugs, weapons, stolen items, fake IDs).</li>
        <li><strong>Human trafficking</strong> or sex trafficking content.</li>
      </UL>

      <H2>3. Not Allowed</H2>
      <UL>
        <li><strong>Nudity & sexually explicit content</strong>. CrownMe Media is 18+ but is not an adult-content platform. No genitalia, sex acts, or porn.</li>
        <li><strong>Hate speech</strong> attacking people based on race, ethnicity, national origin, religion, caste, sexual orientation, gender, gender identity, disability, or serious disease.</li>
        <li><strong>Harassment & bullying</strong>: targeted insults, slurs, threats, or unwanted sexual advances.</li>
        <li><strong>Self-harm & suicide</strong> content that promotes, glorifies, or provides instructions. We surface help resources when topics arise.</li>
        <li><strong>Graphic violence or gore</strong> shared for shock value.</li>
        <li><strong>Spam, scams, vote manipulation</strong>, automated activity, fake accounts, or buying/selling accounts.</li>
        <li><strong>Misinformation</strong> that could cause real-world harm (e.g., dangerous health hoaxes).</li>
        <li><strong>Intellectual-property infringement</strong> (see our <a className="underline text-primary" href="/dmca">DMCA Policy</a>).</li>
      </UL>

      <H2>4. Crowns, Voting & Battles</H2>
      <UL>
        <li>One vote per person, per post, per allowed window.</li>
        <li>No coordinating vote swaps, bots, scripts, or multi-account voting.</li>
        <li>Battles are for fun. Don't use them to target a real-world rival or harass.</li>
      </UL>

      <H2>5. Direct Messages</H2>
      <UL>
        <li>No unsolicited sexual content or nude imagery, ever.</li>
        <li>No commercial spam or unsolicited promotion.</li>
        <li>Block and report aggressive or abusive senders — we review every report.</li>
      </UL>

      <H2>5A. Sensitive Content Labels</H2>
      <P>
        Posts may carry a sensitive label and a content rating (<em>safe</em>,{" "}
        <em>suggestive</em>, <em>mature</em>, <em>explicit</em>). You must label honestly,
        respect viewers' Content Filter preferences, and accept that moderators can change
        labels and that those changes cannot be reversed by the author. Full rules,
        including what is gated, blurred, hidden, or removed, are in the{" "}
        <a className="underline text-primary" href="/sensitive-content">Sensitive Content Policy</a>.
      </P>

      <H2>6. Reporting</H2>
      <P>
        Use the Report button on any post, comment, message, or profile. Provide details
        and any evidence. Reports are confidential. Urgent safety threats can be emailed
        to <a className="underline text-primary" href="mailto:support@crownmemedia.com">support@crownmemedia.com</a>{" "}
        with subject "URGENT SAFETY."
      </P>

      <H2>7. Enforcement</H2>
      <P>
        Our moderation team reviews reports using a combination of automated systems and
        human review. Actions range from a warning, content removal, or feature restriction
        (e.g., temporary mute), to suspension or permanent ban. We may also withhold or
        revoke crowns and other in-app items earned through violating activity.
      </P>

      <H2>8. Appeals</H2>
      <P>
        If you believe an enforcement action was made in error, email{" "}
        <a className="underline text-primary" href="mailto:support@crownmemedia.com">support@crownmemedia.com</a>{" "}
        with subject "Appeal" and the action or content URL. We aim to respond within 7
        business days.
      </P>
    </LegalShell>
  );
}
