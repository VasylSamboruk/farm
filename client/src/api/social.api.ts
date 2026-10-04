import { api } from './axios';

export interface SocialPlayer {
  id: string;
  username: string;
  avatar: string;
  xp: number;
  level: number;
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

export const socialApi = {
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
};
