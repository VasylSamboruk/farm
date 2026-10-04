import { api } from './axios';
import type { AdminGiftEntry, GameItemConfig, LevelRewardEntry } from '../types/game';
import type { User } from '../types/auth';

export const gameApi = {
  getItems: async (): Promise<GameItemConfig[]> => {
    const response = await api.get<GameItemConfig[]>('/game-config');
    return response.data;
  },
  getPendingLevelRewards: async (): Promise<LevelRewardEntry[]> => {
    const response = await api.get<{ rewards: LevelRewardEntry[] }>('/auth/level-rewards/pending');
    return response.data.rewards;
  },
  claimLevelReward: async (level: number): Promise<User> => {
    const response = await api.post<{ user: User }>('/auth/level-rewards/claim', { level });
    return response.data.user;
  },
  getPendingAdminGifts: async (): Promise<AdminGiftEntry[]> => {
    const response = await api.get<{ gifts: AdminGiftEntry[] }>('/auth/admin-gifts/pending');
    return response.data.gifts;
  },
  claimAdminGift: async (giftId: string): Promise<User> => {
    const response = await api.post<{ user: User }>('/auth/admin-gifts/claim', { giftId });
    return response.data.user;
  },
};