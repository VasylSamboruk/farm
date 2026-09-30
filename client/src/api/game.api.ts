import { api } from './axios';
import type { GameItemConfig } from '../types/game';

export const gameApi = {
  getItems: async (): Promise<GameItemConfig[]> => {
    const response = await api.get<GameItemConfig[]>('/game-config');
    return response.data;
  },
};