import { api } from './axios';
import type { AchievementProgress, GardenAchievement } from '../types/game';

export interface PlayerAchievements {
  achievements: {
    achievement: GardenAchievement;
    progress: AchievementProgress;
  }[];
}

export const getClaimableAchievementCount = (data: PlayerAchievements): number =>
  data.achievements.reduce((count, { achievement, progress }) => count + achievement.tiers.filter((tier) =>
    progress.count >= tier.requiredCount && !progress.claimedTiers.includes(`${achievement.id}:${tier.id}`),
  ).length, 0);

export const achievementsApi = {
  get: async (): Promise<PlayerAchievements> => {
    const response = await api.get<PlayerAchievements>('/achievements');
    return response.data;
  },
  claim: async (achievementId: string, tierId: string): Promise<AchievementProgress> => {
    const response = await api.post<AchievementProgress>('/achievements/claim', { achievementId, tierId });
    return response.data;
  },
};
