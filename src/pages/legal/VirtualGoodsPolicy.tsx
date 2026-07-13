import LegalShell, { H2, P, UL } from "@/components/legal/LegalShell";

export default function VirtualGoodsPolicy() {
  return (
    <LegalShell title="Virtual Goods & No-Gambling Policy" effectiveDate="July 13, 2026" lastUpdated="July 13, 2026" version="1.3">
      <H2>1. Entertainment Only</H2>
      <P>
        Shekels, crowns, Crown Shields, royal gifts, the Royal Pass, Founder rewards,
        boosts, emotes, ranks, leaderboard positions, tournament placements, battle
        outcomes, and any other in-app items, currencies, or features (collectively,
        "Virtual Items") exist solely for entertainment within the Service. They have NO
        monetary value, are NOT prizes, and are NOT redeemable for cash, goods, or
        services outside CrownMe Media.
      </P>

      <H2>2. License, Not Ownership</H2>
      <P>
        You receive a personal, non-exclusive, non-transferable, revocable license to use
        Virtual Items inside the Service. You do not own them. We may modify, suspend,
        replace, expire, or remove Virtual Items at any time without compensation, except
        as required by applicable consumer law in your jurisdiction.
      </P>

      <H2>3. No Gambling, No Loot Boxes for Cash Value</H2>
      <UL>
        <li>There is no real-money wager, no real-money prize, and no monetary consideration tied to any outcome on CrownMe Media.</li>
        <li>No randomized loot boxes are sold for currency that result in items of real-world cash value or that can be traded for value outside the Service.</li>
        <li>Battle outcomes, tournament brackets, and crown rankings are determined by user voting and engagement, not by chance for monetary reward.</li>
        <li>We do not facilitate, host, or permit gambling, betting, or wagering on or through the Service.</li>
      </UL>

      <H2>4. Crown Shields</H2>
      <P>
        Crown Shields are protective consumables. Royal Pass subscribers receive a
        monthly allowance (currently 5 per month) which does not roll over unless
        explicitly stated at the time of purchase. Crown Shields are subject to the same
        no-cash-out and forfeiture rules as all other Virtual Items.
      </P>

      <H2>5. Purchases Are Final</H2>
      <P>
        All purchases of Virtual Items are final and non-refundable, except where
        required by law or by the platform from which you purchased (Apple App Store or
        Google Play). For App Store / Play Store purchases, refund requests must go
        through the relevant platform. EU / EEA / UK consumers acknowledge that, by
        expressly requesting immediate delivery of Virtual Items, the statutory 14-day
        right of withdrawal is lost once delivery begins, to the extent permitted by
        local law.
      </P>

      <H2>6. No Cash-Out, No Transfer, No Secondary Market</H2>
      <P>
        Virtual Items cannot be transferred between accounts (except via in-app gifting
        flows expressly provided), sold, traded for real-world value, or withdrawn.
        Engaging in real-money trading of Virtual Items or accounts is a violation of
        our Terms and may result in account termination and forfeiture of Virtual Items.
      </P>

      <H2>7. Account Closure & Forfeiture</H2>
      <P>
        Upon account suspension, termination, or closure (by you or by us for cause),
        all unused Virtual Items are forfeited without refund, except where local
        consumer law requires otherwise.
      </P>

      <H2>8. Tax</H2>
      <P>
        You are responsible for any taxes associated with your purchases as required by
        your jurisdiction. Prices displayed to EU / UK consumers include applicable
        VAT/GST.
      </P>

      <H2>9. Questions</H2>
      <P>
        <a className="underline text-primary" href="mailto:support@crownmemedia.com">support@crownmemedia.com</a>
      </P>
    </LegalShell>
  );
}
