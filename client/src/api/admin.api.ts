import { api } from './axios';
import type { ItemSkin, LevelIconEntry, LevelRewardEntry } from '../types/game';
import type { AdminGiftReward } from '../types/game';

export interface AdminFarmItem {
  itemId: string;
  name: string;
  type: string;
  image?: string;
  x: number;
  y: number;
  quadrant: number;
  isDirt?: boolean;
  stage?: number;
  occupiedQuadrants?: number[];
  occupiedCells?: { x: number; y: number; quadrant: number }[];
  flipX?: boolean;
  placedAt?: string;
  lastHarvestedAt?: string;
}

export interface AdminUser {
  id: string;
  username: string;
  role: 'user' | 'admin';
  avatar: string;
  coins: number;
  rubies: number;
  xp: number;
  level: number;
  inventory: Record<string, number>;
  farmSize: number;
  grassStyle?: string;
  backgroundStyle?: string;
  backgroundIsNight?: boolean;
  createdAt?: string;
  isBanned: boolean;
  banUntil: string | null;
  banReason: string;
  farmItems: AdminFarmItem[];
}

export interface AdminCatalogItem {
  id: string;
  name: string;
  type: 'TREE' | 'CROP' | 'ANIMAL' | 'BUILDING' | 'OTHER';
  yieldItem?: string;
  yieldName?: string;
  yieldIcon?: string;
  yieldImage?: string | null;
  yieldAmount?: number;
  shopImage?: string | null;
  shopIcon?: string;
  placementSurface?: 'grass' | 'soil';
  price: number;
  priceCurrency?: 'coins' | 'rubies';
  sellPrice?: number | null;
  plantingXp: number;
  requiredLevel: number;
  sortOrder: number;
  productionTimeMs?: number | null;
  mechanic?: 'expand_farm' | 'accelerate_growth' | 'grass_style' | 'background_style' | null;
  grassTexture?: string | null;
  grassEdgeOverlap?: number;
  grassEdgeBlur?: number;
  backgroundImage?: string | null;
  backgroundNightImage?: string | null;
  appearanceAnimation?: 'none' | 'snow' | 'blizzard';
  skinsEnabled?: boolean;
  skins?: ItemSkin[];
  accelerationMs?: number | null;
  canFlip?: boolean;
  flipX?: boolean;
  spriteScale?: number;
  growthImages?: string[];
  footprint?: { width: number; height: number };
  largeFootprint?: { width: number; height: number } | null;
  housing?: { capacity: number; animalTypes: string[] } | null;
  buildingCategory?: 'DECOR' | 'PEN' | 'FACTORY';
  factoryInputItemId?: string;
  factoryCapacity?: number;
  access: 'all' | 'admin';
  custom?: boolean;
  disabled?: boolean;
  permanentlyDeleted?: boolean;
  giftOnly?: boolean;
}

export interface AdminGiftShopItem {
  itemId: string;
  name: string;
  type: AdminCatalogItem['type'];
  image: string;
  icon: string;
  price: number;
  priceCurrency: 'coins' | 'rubies';
  enabled: boolean;
}

export interface AdminMediaSettings {
  assetBaseUrl: string;
  previousAssetBaseUrl: string;
}

export interface LeaderboardPrizeRange {
  rankFrom: number;
  rankTo: number;
  rewards: import('../types/game').LevelReward[];
}

export interface LeaderboardSettings {
  prizeRanges: LeaderboardPrizeRange[];
  competitionId: string;
  competitionStartAt: string | null;
  competitionEndAt: string | null;
}

export interface AdminLeaderboardCompetition {
  competitionId: string;
  competitionStartAt: string | null;
  competitionEndAt: string | null;
  prizeRanges: LeaderboardPrizeRange[];
  prizesApplied: boolean;
  isActive: boolean;
}

export interface AdminLeaderboardCompetitions {
  activeCompetitionId: string;
  competitions: AdminLeaderboardCompetition[];
}

export interface AdminLeaderboardPlayer {
  id: string;
  username: string;
  avatar: string;
  xp: number;
  level: number;
  rank: number | null;
  hidden: boolean;
  isOnline: boolean;
  lastOnlineAt: string | null;
}

export interface AdminLeaderboardPlayers {
  entries: AdminLeaderboardPlayer[];
  total: number;
  page: number;
  pages: number;
}

export const adminApi = {
  getUsers: async (search = '', page = 1) => {
    const response = await api.get<{ users: AdminUser[]; page: number; limit: number; total: number; pages: number }>(
      '/admin/users',
      { params: { search, page, limit: 50 } }
    );
    return response.data;
  },
  getCatalog: async () => {
    const response = await api.get<{ items: AdminCatalogItem[] }>('/admin/catalog');
    return response.data.items;
  },
  getLevelRewards: async (): Promise<LevelRewardEntry[]> => {
    const response = await api.get<{ levels: LevelRewardEntry[] }>('/admin/level-rewards');
    return response.data.levels;
  },
  getLevelIcons: async (): Promise<LevelIconEntry[]> => {
    const response = await api.get<{ levelIcons: LevelIconEntry[] }>('/admin/level-icons');
    return response.data.levelIcons;
  },
  saveLevelIcons: async (levelIcons: LevelIconEntry[]): Promise<LevelIconEntry[]> => {
    const response = await api.put<{ levelIcons: LevelIconEntry[] }>('/admin/level-icons', { levelIcons });
    return response.data.levelIcons;
  },
  getGiftShop: async (): Promise<AdminGiftShopItem[]> => {
    const response = await api.get<{ items: AdminGiftShopItem[] }>('/admin/gift-shop');
    return response.data.items;
  },
  updateGiftShopItem: async (itemId: string, changes: Pick<AdminGiftShopItem, 'price' | 'priceCurrency' | 'enabled'>): Promise<AdminGiftShopItem> => {
    const response = await api.put<{ item: AdminGiftShopItem }>(`/admin/gift-shop/${itemId}`, changes);
    return response.data.item;
  },
  saveLevelRewards: async (level: number, rewards: LevelRewardEntry['rewards']): Promise<LevelRewardEntry> => {
    const response = await api.put<LevelRewardEntry>(`/admin/level-rewards/${level}`, { rewards });
    return response.data;
  },
  deleteLevelRewards: async (level: number): Promise<void> => {
    await api.delete(`/admin/level-rewards/${level}`);
  },
  getLeaderboardPrizes: async (): Promise<LeaderboardSettings> => {
    const response = await api.get<LeaderboardSettings>('/admin/leaderboard/prizes');
    return response.data;
  },
  getLeaderboardCompetitions: async (): Promise<AdminLeaderboardCompetitions> => {
    const response = await api.get<AdminLeaderboardCompetitions>('/admin/leaderboard/competitions');
    return response.data;
  },
  getLeaderboardPlayers: async (params: {
    type: 'total' | 'competition';
    competitionId?: string;
    page?: number;
    search?: string;
  }): Promise<AdminLeaderboardPlayers> => {
    const response = await api.get<AdminLeaderboardPlayers>('/admin/leaderboard/players', { params });
    return response.data;
  },
  setLeaderboardPlayerVisibility: async (userId: string, params: {
    type: 'total' | 'competition';
    competitionId?: string;
    hidden: boolean;
  }): Promise<void> => {
    await api.patch(`/admin/leaderboard/players/${encodeURIComponent(userId)}/visibility`, params);
  },
  createLeaderboardCompetition: async (
    prizeRanges: LeaderboardPrizeRange[],
    competitionStartAt: string,
    competitionEndAt: string,
  ): Promise<AdminLeaderboardCompetitions> => {
    const response = await api.post<AdminLeaderboardCompetitions>('/admin/leaderboard/competitions', {
      prizeRanges,
      competitionStartAt,
      competitionEndAt,
    });
    return response.data;
  },
  updateLeaderboardCompetition: async (
    competitionId: string,
    prizeRanges: LeaderboardPrizeRange[],
    competitionStartAt: string,
    competitionEndAt: string,
  ): Promise<AdminLeaderboardCompetitions> => {
    const response = await api.put<AdminLeaderboardCompetitions>(`/admin/leaderboard/competitions/${encodeURIComponent(competitionId)}`, {
      prizeRanges,
      competitionStartAt,
      competitionEndAt,
    });
    return response.data;
  },
  setLeaderboardCompetitionActive: async (competitionId: string, isActive: boolean): Promise<AdminLeaderboardCompetitions> => {
    const response = await api.patch<AdminLeaderboardCompetitions>(`/admin/leaderboard/competitions/${encodeURIComponent(competitionId)}/active`, { isActive });
    return response.data;
  },
  deleteLeaderboardCompetition: async (competitionId: string): Promise<AdminLeaderboardCompetitions> => {
    const response = await api.delete<AdminLeaderboardCompetitions>(`/admin/leaderboard/competitions/${encodeURIComponent(competitionId)}`);
    return response.data;
  },
  saveLeaderboardPrizes: async (
    prizeRanges: LeaderboardPrizeRange[],
    competitionStartAt: string,
    competitionEndAt: string,
  ): Promise<LeaderboardSettings> => {
    const response = await api.put<LeaderboardSettings>('/admin/leaderboard/prizes', {
      prizeRanges,
      competitionStartAt,
      competitionEndAt,
    });
    return response.data;
  },
  getMediaSettings: async () => {
    const response = await api.get<AdminMediaSettings>('/admin/media/settings');
    return response.data;
  },
  updateMediaBaseUrl: async (assetBaseUrl: string) => {
    const response = await api.put<AdminMediaSettings>('/admin/media/settings', { assetBaseUrl });
    return response.data;
  },
  restoreMediaBaseUrl: async () => {
    const response = await api.post<AdminMediaSettings>('/admin/media/settings/restore');
    return response.data;
  },
  createItem: async (item: Omit<AdminCatalogItem, 'sortOrder' | 'custom'>) => {
    const response = await api.post<{ item: AdminCatalogItem }>('/admin/catalog', item);
    return response.data.item;
  },
  archiveItem: async (itemId: string) => {
    const response = await api.delete<{ item: AdminCatalogItem }>(`/admin/catalog/${itemId}`);
    return response.data.item;
  },
  permanentlyDeleteItem: async (itemId: string) => {
    await api.delete(`/admin/catalog/${itemId}/permanent`);
  },
  restorePermanentlyDeletedItem: async (itemId: string) => {
    const response = await api.post<{ item: AdminCatalogItem }>(`/admin/catalog/${itemId}/restore`);
    return response.data.item;
  },
  updatePrices: async (itemId: string, price: number, sellPrice?: number) => {
    const response = await api.patch<{ item: AdminCatalogItem }>(`/admin/catalog/${itemId}/prices`, {
      price,
      ...(sellPrice === undefined ? {} : { sellPrice }),
    });
    return response.data.item;
  },
  updateConfig: async (itemId: string, config: Partial<AdminCatalogItem> & { name?: string }) => {
    const response = await api.patch<{ item: AdminCatalogItem }>(`/admin/catalog/${itemId}/config`, config);
    return response.data.item;
  },
  updateStats: async (userId: string, coinsDelta: number, rubiesDelta: number, xpDelta: number) => {
    const response = await api.patch<{ user: AdminUser }>(`/admin/users/${userId}/stats`, { coinsDelta, rubiesDelta, xpDelta });
    return response.data.user;
  },
  sendGift: async (userId: string, gift: { title: string; description: string; items: AdminGiftReward[] }) => {
    const response = await api.post<{ success: boolean; message: string }>(`/admin/users/${userId}/gifts`, gift);
    return response.data;
  },
  updateProfile: async (userId: string, changes: { username?: string; role?: 'user' | 'admin' }) => {
    const response = await api.patch<{ user: AdminUser }>(`/admin/users/${userId}/profile`, changes);
    return response.data.user;
  },
  banUser: async (userId: string, durationMinutes: number | null, reason: string) => {
    const response = await api.post<{ user: AdminUser }>(`/admin/users/${userId}/ban`, { durationMinutes, reason });
    return response.data.user;
  },
  unbanUser: async (userId: string) => {
    const response = await api.post<{ user: AdminUser }>(`/admin/users/${userId}/unban`);
    return response.data.user;
  },
  deleteUser: async (userId: string) => {
    await api.delete(`/admin/users/${userId}`);
  },
  clearFarm: async (userId: string) => {
    await api.delete(`/admin/users/${userId}/farm`);
  },
  resetProgress: async (userId: string) => {
    await api.post(`/admin/users/${userId}/reset-progress`);
  },
  deleteFarmItem: async (userId: string, item: Pick<AdminFarmItem, 'x' | 'y' | 'quadrant'>) => {
    await api.delete(`/admin/users/${userId}/farm-items/${item.x}/${item.y}/${item.quadrant}`);
  },
  updateFarmItem: async (
    userId: string,
    item: Pick<AdminFarmItem, 'x' | 'y' | 'quadrant'>,
    changes: { x: number; y: number; quadrant: number; flipX: boolean }
  ) => {
    const response = await api.patch<{ message: string; item: AdminFarmItem }>(
      `/admin/users/${userId}/farm-items/${item.x}/${item.y}/${item.quadrant}`,
      changes
    );
    return response.data.item;
  },
  updateInventory: async (userId: string, itemId: string, amountDelta: number) => {
    const response = await api.post<{ inventory: Record<string, number> }>(`/admin/users/${userId}/inventory`, { itemId, amountDelta });
    return response.data.inventory;
  },
  addFarmItem: async (userId: string, itemId: string) => {
    const response = await api.post<{ message: string; tile: AdminFarmItem }>(`/admin/users/${userId}/farm-items`, { itemId });
    return response.data;
  },
};
