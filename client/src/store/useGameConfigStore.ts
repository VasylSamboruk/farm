import { create } from 'zustand';
import { gameApi } from '../api/game.api';
import type { GameItemConfig } from '../types/game';
import { preloadGameImages } from '../game/sprites';

interface GameConfigState {
  items: Record<string, GameItemConfig>;
  loading: boolean;
  error: string | null;
  loadItems: (force?: boolean) => Promise<void>;
}

export const useGameConfigStore = create<GameConfigState>((set, get) => ({
  items: {},
  loading: false,
  error: null,
  loadItems: async (force = false) => {
    if (get().loading || (!force && Object.keys(get().items).length > 0)) return;

    set({ loading: true, error: null });
    try {
      const items = await gameApi.getItems();
      set({
        items: Object.fromEntries(items.map((item) => [item.id, item])),
        loading: false,
      });
      void preloadGameImages(items).catch((error: unknown) => {
        console.error('Не вдалося завантажити зображення каталогу:', error);
      });
    } catch (error) {
      console.error('Не вдалося завантажити каталог гри:', error);
      set({ loading: false, error: 'Не вдалося завантажити каталог гри' });
    }
  },
}));