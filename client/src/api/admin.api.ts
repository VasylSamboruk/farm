import { api } from './axios';

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
  xp: number;
  level: number;
  inventory: Record<string, number>;
  createdAt?: string;
  isBanned: boolean;
  banUntil: string | null;
  banReason: string;
  farmItems: AdminFarmItem[];
}

export interface AdminCatalogItem {
  id: string;
  name: string;
  type: 'TREE' | 'CROP' | 'ANIMAL' | 'BUILDING';
  yieldItem?: string;
  yieldName?: string;
  yieldIcon?: string;
  yieldImage?: string | null;
  yieldAmount?: number;
  shopImage?: string | null;
  shopIcon?: string;
  placementSurface?: 'grass' | 'soil';
  price: number;
  sellPrice?: number;
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
  createCatalogItem: async (item: { templateItemId: string; name: string; price: number; access: 'all' | 'admin' }) => {
    const response = await api.post<{ item: AdminCatalogItem }>('/admin/catalog', item);
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
  updateStats: async (userId: string, coinsDelta: number, xpDelta: number) => {
    const response = await api.patch<{ user: AdminUser }>(`/admin/users/${userId}/stats`, { coinsDelta, xpDelta });
    return response.data.user;
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
