export type GiftCategory = "low" | "popular" | "premium" | "legendary" | "mythic";
export type GiftRarity = "common" | "rare" | "epic" | "legendary" | "mythic";

export type GiftAnimationType = string;

export interface RoyalGift {
  id: string;
  name: string;
  shekelCost: number;
  category: GiftCategory;
  rarity: GiftRarity;
  animationType: GiftAnimationType;
  icon: string; // emoji
  crownScoreBoost?: number;
  visibilityBoost?: boolean;
  trending?: boolean;
  topPick?: boolean;
}

export interface GiftPanelRecipient {
  id: string;
  username: string;
  avatarUrl?: string;
}

export interface GiftBundle {
  id: string;
  usd: number;
  shekels: number;
  popular?: boolean;
  bestValue?: boolean;
}

export interface GiftTransactionRow {
  id: string;
  sender_id: string;
  receiver_id: string;
  post_id: string | null;
  gift_id: string;
  gift_name: string;
  quantity: number;
  total_shekels: number;
  created_at: string;
}
