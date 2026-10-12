export type GameItemType = 'TREE' | 'CROP' | 'ANIMAL' | 'BUILDING' | 'OTHER';
export type BuildingCategory = 'DECOR' | 'PEN' | 'FACTORY';
export type LevelReward = { kind: 'coins'; amount: number } | { kind: 'rubies'; amount: number } | { kind: 'item'; amount: number; itemId: string };
export interface LevelRewardEntry { level: number; rewards: LevelReward[]; }
export interface ItemSkin {
  id: string;
  name: string;
  price: number;
  priceCurrency?: 'coins' | 'rubies';
  images: string[];
  shopImage?: string;
  rarity?: 'common' | 'rare' | 'exclusive';
  productionTimeBonus?: {
    enabled: boolean;
    reductionPercent: number;
  };
}
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
  buildingCategory?: BuildingCategory;
  factoryInputItemId?: string;
  factoryCapacity?: number;
  spriteScale?: number;
  flipX?: boolean;
  canFlip?: boolean;
  price: number;
  priceCurrency?: 'coins' | 'rubies';
  mechanic?: 'expand_farm' | 'accelerate_growth' | 'grass_style' | 'background_style' | null;
  grassTexture?: string;
  grassEdgeOverlap?: number;
  grassEdgeBlur?: number;
  backgroundImage?: string;
  backgroundNightImage?: string;
  appearanceAnimation?: 'none' | 'snow' | 'blizzard';
  skinsEnabled?: boolean;
  skins?: ItemSkin[];
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