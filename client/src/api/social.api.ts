import { api } from './axios';

export interface SocialPlayer {
  id: string;
  username: string;
  avatar: string;
  xp: number;
  level: number;
  isOnline?: boolean;
  lastOnlineAt?: string | null;
  relation?: 'none' | 'friend' | 'pending_sent' | 'pending_received';
}

export interface SocialFarmTile {
  x: number;
  y: number;
  quadrant: number;
  isDirt: boolean;
  itemId: string;
  stage: number;
  occupiedQuadrants?: number[];
  occupiedCells?: { x: number; y: number; quadrant: number }[];
  flipX?: boolean;
  placedAt?: string;
  lastHarvestedAt?: string;
}

export interface FriendFarm {
  profile: SocialPlayer;
  size: number;
  tiles: SocialFarmTile[];
}

export interface SocialGiftProduct {
  itemId: string;
  name: string;
  type: string;
  image: string;
  icon: string;
  price: number;
  priceCurrency: 'coins' | 'rubies';
  enabled: boolean;
}

export interface ReceivedSocialGift {
  id: string;
  senderId: string;
  senderName: string;
  senderAvatar: string;
  senderLevel: number;
  itemId: string;
  itemName: string;
  image: string;
  type: string;
  sentAt: string;
}

export const socialApi = {
  updatePresence: async (): Promise<void> => {
    await api.post('/social/presence');
  },
  updateAvatar: async (avatar: string): Promise<{ avatar: string }> => {
    const response = await api.put('/social/profile/avatar', { avatar });
    return response.data;
  },
  search: async (query: string): Promise<SocialPlayer[]> => {
    const response = await api.get('/social/search', { params: { query } });
    return response.data.players;
  },
  getFriends: async (): Promise<SocialPlayer[]> => {
    const response = await api.get('/social/friends');
    return response.data.friends;
  },
  getRequests: async (): Promise<SocialPlayer[]> => {
    const response = await api.get('/social/requests');
    return response.data.requests;
  },
  sendRequest: async (userId: string): Promise<void> => {
    await api.post(`/social/requests/${userId}`);
  },
  acceptRequest: async (userId: string): Promise<void> => {
    await api.post(`/social/requests/${userId}/accept`);
  },
  declineRequest: async (userId: string): Promise<void> => {
    await api.delete(`/social/requests/${userId}`);
  },
  removeFriend: async (userId: string): Promise<void> => {
    await api.delete(`/social/friends/${userId}`);
  },
  getFriendFarm: async (userId: string): Promise<FriendFarm> => {
    const response = await api.get(`/social/profile/${userId}`);
    return response.data;
  },
  getGiftShop: async (): Promise<SocialGiftProduct[]> => {
    const response = await api.get<{ items: SocialGiftProduct[] }>('/social/gift-shop');
    return response.data.items;
  },
  getGifts: async (): Promise<{ gifts: ReceivedSocialGift[]; cooldowns: Record<string, string> }> => {
    const response = await api.get<{ gifts: ReceivedSocialGift[]; cooldowns: Record<string, string> }>('/social/gifts');
    return response.data;
  },
  sendGift: async (friendId: string, itemId: string): Promise<{ message: string; coins: number; rubies: number; cooldownUntil: string }> => {
    const response = await api.post<{ message: string; coins: number; rubies: number; cooldownUntil: string }>('/social/gifts', { friendId, itemId });
    return response.data;
  },
  acceptGift: async (giftId: string): Promise<{ message: string; itemInventory: Record<string, number> }> => {
    const response = await api.post<{ message: string; itemInventory: Record<string, number> }>(`/social/gifts/${giftId}/accept`);
    return response.data;
  },
  rejectGift: async (giftId: string): Promise<void> => {
    await api.post(`/social/gifts/${giftId}/reject`);
  },
};
