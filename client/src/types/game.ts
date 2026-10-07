export type GameItemType = 'TREE' | 'CROP' | 'ANIMAL' | 'BUILDING' | 'OTHER';
export type LevelReward = { kind: 'coins'; amount: number } | { kind: 'rubies'; amount: number } | { kind: 'item'; amount: number; itemId: string };
export interface LevelRewardEntry { level: number; rewards: LevelReward[]; }
export interface AdminGiftEntry {
  id: string;
  title: string;
  description: string;
  items: AdminGiftReward[];
}
export type AdminGiftReward =
  | { kind: 'item'; itemId: string; amount: number }
  | { kind: 'coins' | 'rubies' | 'xp' | 'level'; amount: number };

export interface GameItemConfig {
  id: string;
  name: string;
  type: GameItemType;
  footprint?: { width: number; height: number };
  largeFootprint?: { width: number; height: number };
  housing?: { capacity: number; animalTypes: string[] };
  spriteScale?: number;
  flipX?: boolean;
  canFlip?: boolean;
  price: number;
  priceCurrency?: 'coins' | 'rubies';
  mechanic?: 'expand_farm' | 'accelerate_growth' | null;
  accelerationMs?: number | null;
  plantingXp: number;
  requiredLevel?: number;
  sortOrder?: number;
  shopImage?: string;
  shopIcon?: string;
  growthImages?: string[];
  productionTimeMs?: number;
  yieldItem?: string;
  yieldName?: string;
  yieldIcon?: string;
  yieldImage?: string;
  yieldAmount?: number;
  sellPrice?: number | null;
  placementSurface?: 'grass' | 'soil';
  access?: 'all' | 'admin';
  giftOnly?: boolean;
  custom?: boolean;
  disabled?: boolean;
}