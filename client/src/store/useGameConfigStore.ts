import { create } from 'zustand';
import { gameApi } from '../api/game.api';
import type { GameItemConfig, LevelIconEntry } from '../types/game';
import { preloadGameImages } from '../game/sprites';
import { DEFAULT_LEVEL_ICONS } from '../config/levelIcons';

interface GameConfigState {
  items: Record<string, GameItemConfig>;
  levelIcons: LevelIconEntry[];
  loading: boolean;
  error: string | null;
  loadItems: (force?: boolean) => Promise<void>;
  setLevelIcons: (levelIcons: LevelIconEntry[]) => void;
}

export const useGameConfigStore = create<GameConfigState>((set, get) => ({
  items: {},
  levelIcons: DEFAULT_LEVEL_ICONS,
  loading: false,
  error: null,
  setLevelIcons: (levelIcons) => set({ levelIcons }),
  loadItems: async (force = false) => {
    if (get().loading || (!force && Object.keys(get().items).length > 0)) return;

    set({ loading: true, error: null });
    try {
      const [items, levelIcons] = await Promise.all([gameApi.getItems(), gameApi.getLevelIcons()]);
      set({
        items: Object.fromEntries(items.map((item) => [item.id, item])),
        levelIcons,
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