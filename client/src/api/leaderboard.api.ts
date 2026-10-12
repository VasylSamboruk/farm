import { api } from './axios';
import type { LevelReward } from '../types/game';
import type { LeaderboardPrizeRange } from './admin.api';

export interface LeaderboardPlayer {
  id: string;
  username: string;
  avatar: string;
  xp: number;
  level: number;
  rank: number;
  isOnline: boolean;
  lastOnlineAt: string | null;
}

export interface LeaderboardData {
  competitionId: string;
  competitionStartAt: number | null;
  competitionEndAt: number | null;
  competitionStatus: 'not_configured' | 'scheduled' | 'active' | 'ended';
  entries: LeaderboardPlayer[];
  total: number;
  page: number;
  pages: number;
  self: LeaderboardPlayer | null;
  prizeRanges?: LeaderboardPrizeRange[];
}

export interface CompetitionReward {
  competitionId: string;
  rank: number;
  rewards: LevelReward[];
}

export const leaderboardApi = {
  get: async (type: 'total' | 'competition', page = 1): Promise<LeaderboardData> => {
    const response = await api.get<LeaderboardData>('/leaderboard', { params: { type, page } });
    return response.data;
  },
  getPendingRewards: async (): Promise<CompetitionReward[]> => {
    const response = await api.get<{ rewards: CompetitionReward[] }>('/leaderboard/competition-rewards/pending');
    return response.data.rewards;
  },
  claimReward: async (competitionId: string): Promise<{
    coins: number;
    rubies: number;
    xp: number;
    inventory: Record<string, number>;
    itemInventory: Record<string, number>;
    reward: CompetitionReward;
  }> => {
    const response = await api.post('/leaderboard/competition-rewards/claim', { competitionId });
    return response.data;
  },
};
