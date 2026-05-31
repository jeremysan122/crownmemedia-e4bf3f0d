import LegalShell, { H2, P, UL } from "@/components/legal/LegalShell";

export default function VirtualGoodsPolicy() {
  return (
    <LegalShell title="Virtual Goods & No-Gambling Policy" effectiveDate="May 2, 2026" lastUpdated="May 30, 2026">
      <H2>1. Entertainment Only</H2>
      <P>
        Shekels, crowns, royal gifts, the Royal Pass, boosts, ranks, leaderboard positions,
        battle outcomes, and any other in-app items, currencies, or features (collectively,
        "Virtual Items") exist solely for entertainment within the Service. They have NO
        monetary value, are NOT prizes, and are NOT redeemable for cash, goods, or services
        outside CrownMe Media.
      </P>

      <H2>2. License, Not Ownership</H2>
      <P>
        You receive a personal, non-exclusive, non-transferable, revocable license to use
        Virtual Items inside the Service. You do not own them. We may modify, suspend,
        replace, expire, or remove Virtual Items at any time without compensation, except
        as required by applicable consumer law in your jurisdiction.
      </P>

      <H2>3. No Gambling</H2>
      <UL>
        <li>There is no real-money wager, no real-money prize, and no monetary consideration tied to any outcome on CrownMe Media.</li>
        <li>No randomized loot boxes are sold for currency that result in items of cash value.</li>
        <li>Battle outcomes and crown rankings are determined by user voting and engagement, not by chance for monetary reward.</li>
        <li>We do not facilitate, host, or permit gambling, betting, or wagering on or through the Service.</li>
      </UL>

      <H2>4. Purchases Are Final</H2>
      <P>
        All purchases of Virtual Items are final and non-refundable, except where required
        by law or by the platform from which you purchased (Apple App Store or Google Play).
        For App Store / Play Store purchases, refund requests must go through the relevant
        platform.
      </P>

      <H2>5. No Cash-Out, No Transfer</H2>
      <P>
        Virtual Items cannot be transferred between accounts (except via in-app gifting
        flows expressly provided), sold, traded for real-world value, or withdrawn.
        Engaging in real-money trading of Virtual Items or accounts is a violation of our
        Terms and may result in account termination and forfeiture of Virtual Items.
      </P>

      <H2>6. Account Closure</H2>
      <P>
        Upon account suspension, termination, or closure (by you or by us for cause), all
        unused Virtual Items are forfeited without refund.
      </P>

      <H2>7. Tax</H2>
      <P>
        You are responsible for any taxes associated with your purchases as required by
        your jurisdiction.
      </P>

      <H2>8. Questions</H2>
      <P>
        <a className="underline text-primary" href="mailto:support@crownmemedia.com">support@crownmemedia.com</a>
      </P>
    </LegalShell>
  );
}
