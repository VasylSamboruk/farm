import { api } from './axios';
import type { LevelRewardEntry } from '../types/game';
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
  canFlip?: boolean;
  flipX?: boolean;
  spriteScale?: number;
  growthImages?: string[];
  footprint?: { width: number; height: number };
  largeFootprint?: { width: number; height: number } | null;
  access: 'all' | 'admin';
  custom?: boolean;
  disabled?: boolean;
}

export interface AdminMediaSettings {
  assetBaseUrl: string;
  previousAssetBaseUrl: string;
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
  saveLevelRewards: async (level: number, rewards: LevelRewardEntry['rewards']): Promise<LevelRewardEntry> => {
    const response = await api.put<LevelRewardEntry>(`/admin/level-rewards/${level}`, { rewards });
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
