import { api } from './axios';

export interface AdminFarmItem {
  itemId: string;
  name: string;
  type: string;
  x: number;
  y: number;
  quadrant: number;
  placedAt?: string;
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
  farmItems: AdminFarmItem[];
}

export interface AdminCatalogItem {
  id: string;
  name: string;
  type: 'TREE' | 'CROP' | 'ANIMAL' | 'BUILDING';
  yieldItem?: string;
  yieldName?: string;
  yieldIcon?: string;
  yieldImage?: string;
  placementSurface?: 'grass' | 'soil';
  price: number;
  plantingXp: number;
  footprint?: { width: number; height: number };
  largeFootprint?: { width: number; height: number };
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
  updateStats: async (userId: string, coinsDelta: number, xpDelta: number) => {
    const response = await api.patch<{ user: AdminUser }>(`/admin/users/${userId}/stats`, { coinsDelta, xpDelta });
    return response.data.user;
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
