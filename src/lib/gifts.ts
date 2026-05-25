import { GiftBundle, GiftCategory, RoyalGift } from "@/types/gifts";

export const SHEKEL = "₪";

export const formatShekels = (n: number): string =>
  n >= 1000 ? n.toLocaleString() : String(n);

/** $ value for a shekel amount. 1 ₪ = $0.01. */
export const shekelToUsd = (n: number): number => Math.round(n) / 100;

const G = (
  id: string,
  name: string,
  cost: number,
  category: GiftCategory,
  opts: Partial<RoyalGift> = {}
): RoyalGift => {
  const rarity =
    category === "low"
      ? cost >= 700 ? "rare" : "common"
      : category === "popular"
      ? "rare"
      : category === "premium"
      ? "epic"
      : category === "legendary"
      ? "legendary"
      : "mythic";
  const specialEffect = category === "legendary" || category === "mythic";
  return {
    id,
    name,
    shekelCost: cost,
    category,
    rarity,
    animationType: id,
    icon: "", // legacy; visuals are now driven by <GiftIcon animationType=... />
    visibilityBoost: specialEffect,
    crownScoreBoost: category === "premium" ? 1 : category === "legendary" ? 3 : category === "mythic" ? 10 : 0,
    ...opts,
  };
};

// ───── LOW (40) — 10..900 ─────
const FLOWERS: RoyalGift[] = [
  G("flower_daisy", "Daisy", 10, "low"),
  G("flower_lily", "Lily", 20, "low"),
  G("flower_tulip", "Tulip", 30, "low"),
  G("flower_rose_mini", "Mini Rose", 40, "low", { trending: true }),
  G("flower_sunflower", "Sunflower", 50, "low", { topPick: true }),
  G("flower_orchid", "Orchid", 60, "low"),
  G("flower_jasmine", "Jasmine", 70, "low"),
  G("flower_violet", "Violet", 80, "low"),
  G("flower_peony", "Peony", 90, "low"),
  G("flower_bouquet", "Bouquet", 100, "low", { trending: true }),
];
const OILS: RoyalGift[] = [
  G("oil_lavender", "Lavender Oil", 10, "low"),
  G("oil_rose", "Rose Oil", 20, "low"),
  G("oil_mint", "Mint Oil", 30, "low"),
  G("oil_eucalyptus", "Eucalyptus Oil", 40, "low"),
  G("oil_jasmine", "Jasmine Oil", 50, "low"),
  G("oil_sandalwood", "Sandalwood Oil", 60, "low", { topPick: true }),
  G("oil_amber", "Amber Oil", 70, "low"),
  G("oil_frankincense", "Frankincense Oil", 80, "low"),
  G("oil_myrrh", "Myrrh Oil", 90, "low"),
  G("oil_anointing", "Anointing Oil", 100, "low", { trending: true }),
];
const LOW: RoyalGift[] = [
  ...FLOWERS,
  ...OILS,
  G("royal_coin_toss", "Royal Coin Toss", 100, "low"),
  G("crown_spark", "Crown Spark", 200, "low", { trending: true }),
  G("gold_dust", "Gold Dust", 300, "low"),
  G("royal_clap", "Royal Clap", 300, "low"),
  G("mini_gem", "Mini Gem", 500, "low"),
  G("royal_scroll", "Royal Scroll", 500, "low"),
  G("golden_rose", "Golden Rose", 500, "low", { topPick: true }),
  G("court_applause", "Court Applause", 700, "low"),
  G("crown_wink", "Crown Wink", 700, "low"),
  G("little_scepter", "Little Scepter", 900, "low"),
  G("velvet_ribbon", "Velvet Ribbon", 900, "low"),
  G("gold_feather", "Gold Feather", 900, "low"),
  G("royal_seal", "Royal Seal", 900, "low"),
  G("purple_sparkle", "Purple Sparkle", 900, "low"),
  G("mini_crown_pin", "Mini Crown Pin", 900, "low"),
  G("palace_bell", "Palace Bell", 900, "low"),
  G("golden_cup", "Golden Cup", 900, "low"),
  G("jewel_drop", "Jewel Drop", 900, "low"),
  G("royal_token", "Royal Token", 900, "low"),
  G("noble_flame", "Noble Flame", 900, "low"),
];

// ───── POPULAR (25) — 1k..9k ─────
const POPULAR: RoyalGift[] = [
  G("golden_flame", "Golden Flame", 1000, "popular", { trending: true }),
  G("crown_burst", "Crown Burst", 1000, "popular"),
  G("coin_rain", "Coin Rain", 2000, "popular"),
  G("mini_crown_drop", "Mini Crown Drop", 2000, "popular"),
  G("royal_banner", "Royal Banner", 3000, "popular"),
  G("treasure_chest", "Treasure Chest", 3500, "popular", { topPick: true }),
  G("gold_ribbon", "Gold Ribbon", 5000, "popular"),
  G("royal_fireworks", "Royal Fireworks", 5000, "popular", { trending: true }),
  G("crown_pulse", "Crown Pulse", 5000, "popular"),
  G("kings_cup", "King’s Cup", 5000, "popular"),
  G("queens_mirror", "Queen’s Mirror", 5000, "popular"),
  G("purple_torch", "Purple Torch", 7000, "popular"),
  G("gold_lion", "Gold Lion", 7000, "popular"),
  G("royal_trumpets", "Royal Trumpets", 7000, "popular"),
  G("diamond_scroll", "Diamond Scroll", 7000, "popular"),
  G("noble_shield", "Noble Shield", 9000, "popular"),
  G("crown_beacon", "Crown Beacon", 9000, "popular"),
  G("palace_key", "Palace Key", 9000, "popular"),
  G("golden_laurel", "Golden Laurel", 9000, "popular"),
  G("royal_orb", "Royal Orb", 9000, "popular"),
  G("throne_spark", "Throne Spark", 9000, "popular"),
  G("crown_fire_trail", "Crown Fire Trail", 9000, "popular"),
  G("royal_halo", "Royal Halo", 9000, "popular"),
  G("gem_crown_flash", "Gem Crown Flash", 9000, "popular"),
  G("regal_starfall", "Regal Starfall", 9000, "popular"),
];

// ───── PREMIUM (25) — 10k..39k ─────
const PREMIUM: RoyalGift[] = [
  G("golden_wings", "Golden Wings", 10000, "premium"),
  G("throne_room", "Throne Room", 10000, "premium", { trending: true }),
  G("royal_armor", "Royal Armor", 15000, "premium"),
  G("golden_aura", "Golden Aura", 15000, "premium"),
  G("crown_ascension", "Crown Ascension", 15000, "premium"),
  G("throne_rise", "Throne Rise", 20000, "premium"),
  G("royal_guard", "Royal Guard", 20000, "premium"),
  G("crown_steal_attempt", "Crown Steal Attempt", 25000, "premium", { topPick: true }),
  G("scepter_strike", "Scepter Strike", 25000, "premium"),
  G("diamond_flame", "Diamond Flame", 25000, "premium"),
  G("royal_phoenix", "Royal Phoenix", 30000, "premium"),
  G("palace_gates", "Palace Gates", 30000, "premium"),
  G("gold_dragon", "Gold Dragon", 30000, "premium"),
  G("purple_empire_flag", "Purple Empire Flag", 30000, "premium"),
  G("kings_decree", "King’s Decree", 35000, "premium"),
  G("queens_blessing", "Queen’s Blessing", 35000, "premium"),
  G("crown_thunder", "Crown Thunder", 35000, "premium"),
  G("royal_meteor", "Royal Meteor", 35000, "premium"),
  G("jewel_storm", "Jewel Storm", 39000, "premium"),
  G("crown_portal", "Crown Portal", 39000, "premium"),
  G("golden_chariot", "Golden Chariot", 39000, "premium"),
  G("royal_eclipse", "Royal Eclipse", 39000, "premium"),
  G("crown_fortress", "Crown Fortress", 39000, "premium"),
  G("imperial_flame", "Imperial Flame", 39000, "premium"),
  G("royal_command", "Royal Command", 39000, "premium"),
];

// ───── LEGENDARY (20) — 40k..150k ─────
const LEGENDARY: RoyalGift[] = [
  G("diamond_crown", "Diamond Crown", 40000, "legendary", { trending: true }),
  G("crown_storm", "Crown Storm", 50000, "legendary"),
  G("global_spotlight", "Global Spotlight", 60000, "legendary", { topPick: true }),
  G("kingdom_arrival", "Kingdom Arrival", 75000, "legendary"),
  G("royal_coronation", "Royal Coronation", 75000, "legendary"),
  G("crown_armada", "Crown Armada", 75000, "legendary"),
  G("golden_empire", "Golden Empire", 100000, "legendary"),
  G("crown_vortex", "Crown Vortex", 100000, "legendary"),
  G("infinite_crown", "Infinite Crown", 100000, "legendary", { trending: true }),
  G("royal_celestial", "Royal Celestial", 100000, "legendary"),
  G("legendary_crown", "Legendary Crown", 150000, "legendary"),
  G("royal_heavens", "Royal Heavens", 150000, "legendary"),
  G("crown_of_kings", "Crown of Kings", 150000, "legendary"),
  G("crown_of_queens", "Crown of Queens", 150000, "legendary"),
  G("royal_dynasty", "Royal Dynasty", 150000, "legendary"),
  G("empire_rise", "Empire Rise", 150000, "legendary"),
  G("crown_eclipse", "Crown Eclipse", 150000, "legendary"),
  G("eternal_palace", "Eternal Palace", 150000, "legendary"),
  G("royal_sunburst", "Royal Sunburst", 150000, "legendary"),
  G("infinite_throne", "Infinite Throne", 150000, "legendary"),
];

// ───── MYTHIC (10) — 200k..1M ─────
const MYTHIC: RoyalGift[] = [
  G("crown_of_eternity", "Crown of Eternity", 200000, "mythic", { trending: true }),
  G("divine_throne", "Divine Throne", 250000, "mythic"),
  G("golden_universe", "Golden Universe", 300000, "mythic"),
  G("royal_godform", "Royal Godform", 400000, "mythic"),
  G("crown_of_worlds", "Crown of Worlds", 500000, "mythic", { topPick: true }),
  G("celestial_dynasty", "Celestial Dynasty", 600000, "mythic"),
  G("crown_ouroboros", "Crown Ouroboros", 700000, "mythic"),
  G("immortal_throne", "Immortal Throne", 800000, "mythic"),
  G("crown_of_creation", "Crown of Creation", 900000, "mythic"),
  G("god_emperor_crown", "God Emperor Crown", 1000000, "mythic", { trending: true }),
];

export const ROYAL_GIFTS: RoyalGift[] = [...LOW, ...POPULAR, ...PREMIUM, ...LEGENDARY, ...MYTHIC];

export const giftsByCategory = (cat: GiftCategory) =>
  ROYAL_GIFTS.filter((g) => g.category === cat);

export const findGift = (id: string) => ROYAL_GIFTS.find((g) => g.id === id);

export const SHEKEL_BUNDLES: GiftBundle[] = [
  { id: "b1", usd: 0.99, shekels: 100 },
  { id: "b2", usd: 4.99, shekels: 550 },
  { id: "b3", usd: 9.99, shekels: 1200, popular: true },
  { id: "b4", usd: 49.99, shekels: 6500 },
  { id: "b5", usd: 99.99, shekels: 14000 },
  { id: "b6", usd: 499.99, shekels: 80000 },
  { id: "b7", usd: 999.99, shekels: 170000, bestValue: true },
];

export const RARITY_RING: Record<RoyalGift["rarity"], string> = {
  common: "ring-1 ring-border",
  rare: "ring-1 ring-[hsl(var(--royal-blue)/0.6)] shadow-[0_0_18px_-4px_hsl(var(--royal-blue)/0.5)]",
  epic: "ring-1 ring-[hsl(var(--accent)/0.7)] shadow-[0_0_22px_-4px_hsl(var(--accent)/0.6)]",
  legendary:
    "ring-1 ring-[hsl(var(--primary)/0.9)] shadow-[0_0_26px_-2px_hsl(var(--primary)/0.7)] animate-[crown-pulse_2.4s_ease-in-out_infinite]",
  mythic:
    "ring-2 ring-[hsl(350_85%_60%/0.9)] shadow-[0_0_30px_-2px_hsl(350_90%_60%/0.8)] animate-[crown-pulse_1.8s_ease-in-out_infinite]",
};

export const RARITY_LABEL: Record<RoyalGift["rarity"], string> = {
  common: "Common",
  rare: "Rare",
  epic: "Epic",
  legendary: "Legendary",
  mythic: "Mythic",
};

export const CATEGORY_TABS: { key: GiftCategory; label: string }[] = [
  { key: "low", label: "Low" },
  { key: "popular", label: "Popular" },
  { key: "premium", label: "Premium" },
  { key: "legendary", label: "Legendary" },
  { key: "mythic", label: "Mythic" },
];
