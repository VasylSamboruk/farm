export type GameItemType = 'TREE' | 'CROP' | 'ANIMAL' | 'BUILDING';

export interface GameItemConfig {
  id: string;
  name: string;
  type: GameItemType;
  footprint?: { width: number; height: number };
  largeFootprint?: { width: number; height: number };
  spriteScale?: number;
  flipX?: boolean;
  canFlip?: boolean;
  price: number;
  plantingXp: number;
  shopImage?: string;
  shopIcon?: string;
  growthImages?: string[];
  productionTimeMs?: number;
  yieldItem?: string;
  yieldName?: string;
  yieldIcon?: string;
  yieldImage?: string;
  yieldAmount?: number;
  sellPrice?: number;
  placementSurface?: 'grass' | 'soil';
}