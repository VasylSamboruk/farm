import { create } from 'zustand';
import { useAuthStore } from './authStore'; 
import { API_BASE_URL } from '../api/axios';

export interface TileData {
  type: 'dirt' | 'item';
  itemId?: string;
  itemType?: 'TREE' | 'CROP' | 'ANIMAL' | 'BUILDING';
  stage?: number;
  quadrant?: number;
  occupiedQuadrants?: number[];
  occupiedCells?: { row: number; col: number; quadrant: number }[];
  flipX?: boolean;
  placedAt?: string;
  lastHarvestedAt?: string;
  housedAnimals?: HousedAnimal[];
}

export interface HousedAnimal {
  id: string;
  itemId: string;
  placedAt: string;
  lastHarvestedAt?: string;
}

export interface HarvestQueueEntry {
  row: number;
  col: number;
  quadrant: number;
  itemId: string;
  onComplete?: () => void;
}

export const HARVEST_QUEUE_DURATION_MS = 1500;

interface FarmTileResponse {
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
  housedAnimals?: HousedAnimal[];
}

interface FarmResponse {
  size?: number;
  tiles: FarmTileResponse[];
}

interface FarmState {
  tiles: Record<string, TileData>;
  farmSize: number;
  harvestQueue: HarvestQueueEntry[];
  activeHarvestStartedAt: number | null;
  gameMessage: string | null;
  enqueueHarvest: (entry: HarvestQueueEntry, userId: string) => void;
  notifyGameMessage: (message: string) => void;
  dismissGameMessage: () => void;
  loadFarm: (userId: string) => Promise<void>;
  expandFarm: (userId: string, itemId: string, fromInventory?: boolean) => Promise<boolean>;
  houseAnimal: (userId: string, building: { row: number; col: number; quadrant: number }, animal: { row: number; col: number; quadrant: number }) => Promise<boolean>;
  releaseHousedAnimal: (userId: string, building: { row: number; col: number; quadrant: number }, animalId: string, destination: { row: number; col: number; quadrant: number }) => Promise<boolean>;
  collectHousedAnimals: (userId: string, building: { row: number; col: number; quadrant: number }) => Promise<{ items: { yieldItem: string; yieldName: string; amount: number }[] } | null>;
  buyFertilizer: (userId: string, itemId: string) => Promise<boolean>;
  fertilizeItem: (userId: string, itemId: string, target: { row: number; col: number; quadrant: number }) => Promise<{ appliedTo: string; acceleratedMs: number } | null>;
  digTile: (row: number, col: number, userId: string) => void;
  removeTile: (row: number, col: number, quadrant: number, userId: string) => Promise<boolean>;
  placeItem: (row: number, col: number, quadrant: number, itemId: string, userId: string, fromInventory?: boolean) => Promise<boolean>;
  rotateTile: (row: number, col: number, quadrant: number, userId: string) => Promise<boolean>;
  moveTile: (fromRow: number, fromCol: number, fromQuadrant: number, row: number, col: number, quadrant: number, userId: string) => Promise<boolean>;
  harvestItem: (row: number, col: number, quadrant: number, userId: string) => Promise<boolean>;
  sellItem: (userId: string, itemId: string, amount: number) => Promise<boolean>;
  sellFarmItem: (userId: string, itemId: string, amount: number) => Promise<boolean>;
}

const convertToDbArray = (tiles: Record<string, TileData>) => {
  return Object.entries(tiles).map(([key, data]) => {
    const [row, col, quad] = key.split(',').map(Number);
    return {
      x: col, y: row,
      quadrant: Number.isFinite(quad) ? quad : -1,
      isDirt: data.type === 'dirt',
      itemId: data.itemId || 'dirt',
      occupiedQuadrants: data.occupiedQuadrants ?? (data.quadrant === undefined ? [] : [data.quadrant]),
      occupiedCells: data.occupiedCells?.map((cell) => ({ x: cell.col, y: cell.row, quadrant: cell.quadrant })),
      flipX: data.flipX ?? false,
      stage: data.stage || 0,
      placedAt: data.placedAt,
      lastHarvestedAt: data.lastHarvestedAt,
      housedAnimals: data.housedAnimals?.map(({ id, ...animal }) => ({ _id: id, ...animal })),
    };
  });
};

const toFarmTileMap = (tiles: FarmTileResponse[]) => {
  const tileMap: Record<string, TileData> = {};
  for (const tile of tiles) {
    const key = `${tile.y},${tile.x},${tile.isDirt ? -1 : tile.quadrant}`;
    tileMap[key] = tile.isDirt ? { type: 'dirt', flipX: tile.flipX ?? false } : {
      type: 'item',
      itemId: tile.itemId,
      stage: tile.stage,
      quadrant: tile.quadrant,
      occupiedQuadrants: tile.occupiedQuadrants?.length ? tile.occupiedQuadrants : [tile.quadrant],
      occupiedCells: tile.occupiedCells?.map((cell) => ({ row: cell.y, col: cell.x, quadrant: cell.quadrant })),
      flipX: tile.flipX ?? false,
      placedAt: tile.placedAt,
      lastHarvestedAt: tile.lastHarvestedAt,
      housedAnimals: tile.housedAnimals,
    };
  }
  return tileMap;
};

export const useFarmStore = create<FarmState>((set, get) => {
  let isProcessingHarvestQueue = false;

  const processHarvestQueue = async (userId: string) => {
    if (isProcessingHarvestQueue) return;
    isProcessingHarvestQueue = true;

    while (get().harvestQueue.length > 0) {
      const entry = get().harvestQueue[0];
      const key = `${entry.row},${entry.col},${entry.quadrant}`;
      const startedAt = Date.now();
      set({ activeHarvestStartedAt: startedAt });

      await new Promise((resolve) => setTimeout(resolve, HARVEST_QUEUE_DURATION_MS));
      const success = await get().harvestItem(entry.row, entry.col, entry.quadrant, userId);

      if (!success) {
        set({ gameMessage: 'Не вдалося зібрати врожай. Спробуй ще раз.' });
      } else {
        entry.onComplete?.();
      }
      set((state) => ({
        harvestQueue: state.harvestQueue.filter((queuedEntry) =>
          `${queuedEntry.row},${queuedEntry.col},${queuedEntry.quadrant}` !== key
        ),
        activeHarvestStartedAt: null
      }));
    }

    isProcessingHarvestQueue = false;
  };

  return {
  tiles: {},
  farmSize: 15,
  harvestQueue: [],
  activeHarvestStartedAt: null,
  gameMessage: null,

  enqueueHarvest: (entry, userId) => {
    const key = `${entry.row},${entry.col},${entry.quadrant}`;
    if (get().harvestQueue.some((queuedEntry) =>
      `${queuedEntry.row},${queuedEntry.col},${queuedEntry.quadrant}` === key
    )) return;

    set((state) => ({ harvestQueue: [...state.harvestQueue, entry] }));
    void processHarvestQueue(userId);
  },

  notifyGameMessage: (message) => set({ gameMessage: message }),
  dismissGameMessage: () => set({ gameMessage: null }),

  loadFarm: async (userId) => {
    if (!userId) return;
    try {
      const response = await fetch(`${API_BASE_URL}/farm/${userId}`);
      if (!response.ok) throw new Error(`Не вдалося завантажити ферму (${response.status})`);
      const data = await response.json() as FarmResponse;
      set({ tiles: toFarmTileMap(data.tiles), farmSize: data.size ?? 15 });
    } catch (error) {
      console.error('Не вдалося завантажити ферму:', error);
      throw error;
    }
  },

  expandFarm: async (userId, itemId, fromInventory = false) => {
    try {
      const response = await fetch(`${API_BASE_URL}/farm/expand`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, itemId, fromInventory }),
      });
      const data = await response.json();
      if (!response.ok) {
        set({ gameMessage: data.message || 'Не вдалося розширити ферму' });
        return false;
      }
      set({ tiles: toFarmTileMap(data.tiles as FarmTileResponse[]), farmSize: data.size });
      useAuthStore.getState().updateUser(data.user);
      return true;
    } catch (error) {
      console.error('Помилка розширення ферми', error);
      set({ gameMessage: 'Не вдалося розширити ферму. Перевір з’єднання із сервером.' });
      return false;
    }
  },

  houseAnimal: async (userId, building, animal) => {
    try {
      const response = await fetch(`${API_BASE_URL}/farm/housing/store`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          buildingX: building.col,
          buildingY: building.row,
          buildingQuadrant: building.quadrant,
          animalX: animal.col,
          animalY: animal.row,
          animalQuadrant: animal.quadrant,
        }),
      });
      const data = await response.json() as { message?: string; size?: number; tiles?: FarmTileResponse[] };
      if (!response.ok) {
        set({ gameMessage: data.message || 'Не вдалося помістити тварину в будівлю' });
        return false;
      }
      set({ tiles: toFarmTileMap(data.tiles ?? []), farmSize: data.size ?? get().farmSize });
      return true;
    } catch (error) {
      console.error('Не вдалося помістити тварину в будівлю:', error);
      set({ gameMessage: 'Не вдалося помістити тварину в будівлю. Перевір з’єднання із сервером.' });
      return false;
    }
  },

  releaseHousedAnimal: async (userId, building, animalId, destination) => {
    try {
      const response = await fetch(`${API_BASE_URL}/farm/housing/release`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          buildingX: building.col,
          buildingY: building.row,
          buildingQuadrant: building.quadrant,
          animalId,
          x: destination.col,
          y: destination.row,
          quadrant: destination.quadrant,
        }),
      });
      const data = await response.json() as { message?: string; size?: number; tiles?: FarmTileResponse[] };
      if (!response.ok) {
        set({ gameMessage: data.message || 'Не вдалося випустити тварину' });
        return false;
      }
      set({ tiles: toFarmTileMap(data.tiles ?? []), farmSize: data.size ?? get().farmSize });
      return true;
    } catch (error) {
      console.error('Не вдалося випустити тварину:', error);
      set({ gameMessage: 'Не вдалося випустити тварину. Перевір з’єднання із сервером.' });
      return false;
    }
  },

  collectHousedAnimals: async (userId, building) => {
    try {
      const response = await fetch(`${API_BASE_URL}/farm/housing/collect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          buildingX: building.col,
          buildingY: building.row,
          buildingQuadrant: building.quadrant,
        }),
      });
      const data = await response.json() as {
        message?: string;
        size?: number;
        tiles?: FarmTileResponse[];
        collected?: { yieldItem: string; yieldName: string; amount: number }[];
        user?: { coins: number; rubies: number; xp: number; level: number; inventory: Record<string, number> };
      };
      if (!response.ok) {
        set({ gameMessage: data.message || 'Не вдалося зібрати продукцію' });
        return null;
      }
      set({ tiles: toFarmTileMap(data.tiles ?? []), farmSize: data.size ?? get().farmSize });
      if (data.user) useAuthStore.getState().updateUser(data.user);
      return { items: data.collected ?? [] };
    } catch (error) {
      console.error('Не вдалося зібрати продукцію з будівлі:', error);
      set({ gameMessage: 'Не вдалося зібрати продукцію. Перевір з’єднання із сервером.' });
      return null;
    }
  },

  buyFertilizer: async (userId, itemId) => {
    try {
      const response = await fetch(`${API_BASE_URL}/farm/buy-item`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, itemId }),
      });
      const data = await response.json() as {
        message?: string;
        user?: { coins: number; rubies: number; itemInventory: Record<string, number> };
      };
      if (!response.ok || !data.user) {
        set({ gameMessage: data.message || 'Не вдалося купити добриво' });
        return false;
      }
      useAuthStore.getState().updateUser(data.user);
      return true;
    } catch (error) {
      console.error('Не вдалося купити добриво:', error);
      set({ gameMessage: 'Не вдалося купити добриво. Перевір з’єднання із сервером.' });
      return false;
    }
  },

  fertilizeItem: async (userId, itemId, target) => {
    try {
      const response = await fetch(`${API_BASE_URL}/farm/fertilize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          itemId,
          x: target.col,
          y: target.row,
          quadrant: target.quadrant,
        }),
      });
      const data = await response.json() as {
        message?: string;
        tiles?: FarmTileResponse[];
        size?: number;
        user?: { coins: number; rubies: number; itemInventory: Record<string, number> };
        appliedTo?: string;
        acceleratedMs?: number;
      };
      if (!response.ok || !data.user) {
        set({ gameMessage: data.message || 'Не вдалося застосувати добриво' });
        return null;
      }
      if (data.tiles) set({ tiles: toFarmTileMap(data.tiles), farmSize: data.size ?? get().farmSize });
      useAuthStore.getState().updateUser(data.user);
      return { appliedTo: data.appliedTo ?? 'об’єкта', acceleratedMs: data.acceleratedMs ?? 0 };
    } catch (error) {
      console.error('Не вдалося застосувати добриво:', error);
      set({ gameMessage: 'Не вдалося застосувати добриво. Перевір з’єднання із сервером.' });
      return null;
    }
  },

  digTile: (row, col, userId) => {
    const key = `${row},${col},-1`;
    set((state) => {
      const newTiles = { ...state.tiles, [key]: { type: 'dirt' as const } };
      syncWithServer(userId, newTiles);
      return { tiles: newTiles };
    });
  },

  removeTile: async (row, col, quadrant, userId) => {
    try {
      const response = await fetch(`${API_BASE_URL}/farm/remove`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, x: col, y: row, quadrant })
      });
      const data = await response.json();
      if (!response.ok) {
        set({ gameMessage: data.message || 'Не вдалося видалити предмет' });
        return false;
      }

      set((state) => {
        const newTiles = { ...state.tiles };
        for (const removedTile of data.removedTiles ?? [{ x: col, y: row, quadrant }]) {
          delete newTiles[`${removedTile.y},${removedTile.x},${removedTile.quadrant}`];
        }
        return { tiles: newTiles };
      });
      if (data.user) useAuthStore.getState().updateUser({ coins: data.user.coins, rubies: data.user.rubies });
      return true;
    } catch (err) {
      console.error('Помилка видалення', err);
      set({ gameMessage: 'Не вдалося видалити предмет. Перевір з’єднання із сервером.' });
      return false;
    }
  },

  placeItem: async (row, col, quadrant, itemId, userId, fromInventory = false) => {
    try {
      const res = await fetch(`${API_BASE_URL}/farm/place`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, x: col, y: row, quadrant, itemId, fromInventory })
      });
      const data = await res.json();
      
      if (!res.ok) {
        set({ gameMessage: data.message || 'Не вдалося розмістити предмет' });
        return false;
      }
      
      // Оновлюємо монети І ДОСВІД
      useAuthStore.getState().updateUser({ 
        coins: data.user.coins, 
        rubies: data.user.rubies,
        itemInventory: data.user.itemInventory,
        xp: data.user.xp, 
        level: data.user.level 
      });

      const key = `${row},${col},${quadrant}`;
      set((state) => ({
        tiles: {
          ...state.tiles,
          [key]: {
            type: 'item',
            itemId,
            stage: 0,
            quadrant,
            occupiedQuadrants: data.newTile.occupiedQuadrants,
            occupiedCells: data.newTile.occupiedCells?.map((cell: { x: number; y: number; quadrant: number }) => ({ row: cell.y, col: cell.x, quadrant: cell.quadrant })),
            placedAt: data.newTile.placedAt
          }
        }
      }));
      return true;
    } catch (error) {
      console.error(error);
      set({ gameMessage: 'Не вдалося розмістити предмет. Перевір з’єднання із сервером.' });
      return false;
    }
  },

  rotateTile: async (row, col, quadrant, userId) => {
    try {
      const res = await fetch(`${API_BASE_URL}/farm/rotate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, x: col, y: row, quadrant })
      });
      const data = await res.json();
      if (!res.ok) {
        set({ gameMessage: data.message || 'Не вдалося перевернути предмет' });
        return false;
      }

      const tile = data.tile as { x: number; y: number; quadrant: number } | undefined;
      const key = `${tile?.y ?? row},${tile?.x ?? col},${tile?.quadrant ?? quadrant}`;
      set((state) => ({ tiles: {
        ...state.tiles,
        [key]: {
          ...state.tiles[key],
          flipX: data.flipX,
          occupiedCells: (data.tile?.occupiedCells as { x: number; y: number; quadrant: number }[] | undefined)
            ?.map((cell) => ({ row: cell.y, col: cell.x, quadrant: cell.quadrant }))
        }
      } }));
      return true;
    } catch (error) {
      console.error(error);
      set({ gameMessage: 'Не вдалося перевернути предмет. Перевір з’єднання із сервером.' });
      return false;
    }
  },

  moveTile: async (fromRow, fromCol, fromQuadrant, row, col, quadrant, userId) => {
    try {
      const res = await fetch(`${API_BASE_URL}/farm/move`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, fromX: fromCol, fromY: fromRow, fromQuadrant, x: col, y: row, quadrant })
      });
      const data = await res.json();
      if (!res.ok) {
        set({ gameMessage: data.message || 'Не вдалося перемістити предмет' });
        return false;
      }

      const fromKey = `${fromRow},${fromCol},${fromQuadrant}`;
      const toKey = `${row},${col},${quadrant}`;
      set((state) => {
        const source = state.tiles[fromKey];
        if (!source) return state;
        const newTiles = { ...state.tiles };
        delete newTiles[fromKey];
        const sourceDirtKey = `${fromRow},${fromCol},-1`;
        const destinationDirtKey = `${row},${col},-1`;
        const sourceDirt = newTiles[sourceDirtKey];
        if (source.type === 'dirt' && sourceDirt?.type === 'dirt') {
          delete newTiles[sourceDirtKey];
          newTiles[destinationDirtKey] = sourceDirt;
        }
        newTiles[toKey] = {
          ...source,
          quadrant,
          occupiedQuadrants: data.tile.occupiedQuadrants,
          occupiedCells: data.tile.occupiedCells?.map((cell: { x: number; y: number; quadrant: number }) => ({ row: cell.y, col: cell.x, quadrant: cell.quadrant })),
          flipX: data.tile.flipX ?? source.flipX
        };
        return { tiles: newTiles };
      });
      return true;
    } catch (error) {
      console.error(error);
      set({ gameMessage: 'Не вдалося перемістити предмет. Перевір з’єднання із сервером.' });
      return false;
    }
  },

  harvestItem: async (row, col, quadrant, userId) => {
    try {
      const res = await fetch(`${API_BASE_URL}/farm/harvest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, x: col, y: row, quadrant })
      });
      const data = await res.json();
      if (res.ok) {
        useAuthStore.getState().updateUser({ 
            coins: data.user.coins, 
            xp: data.user.xp, 
            level: data.user.level,
            inventory: data.user.inventory
        });

        const key = `${row},${col},${quadrant}`;
        if (data.removed) {
          set((state) => {
            const newTiles = { ...state.tiles };
            delete newTiles[key];
            return { tiles: newTiles };
          });
        } else {
          set((state) => ({
            tiles: {
              ...state.tiles,
              [key]: { ...state.tiles[key], lastHarvestedAt: data.tile.lastHarvestedAt }
            }
          }));
        }
        return true;
      }
      return false;
    } catch (error) {
      console.error(error);
      return false;
    }
  },

  sellItem: async (userId, itemId, amount) => {
    try {
      const res = await fetch(`${API_BASE_URL}/farm/sell`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, itemId, amount })
      });
      const data = await res.json();
      if (!res.ok) {
        set({ gameMessage: data.message || 'Не вдалося продати товар' });
        return false;
      }

      useAuthStore.getState().updateUser({
        coins: data.user.coins,
        inventory: data.user.inventory
      });
      return true;
    } catch (error) {
      console.error('Помилка продажу:', error);
      set({ gameMessage: 'Не вдалося продати товар. Перевір з’єднання із сервером.' });
      return false;
    }
  },

  sellFarmItem: async (userId, itemId, amount) => {
    try {
      const response = await fetch(`${API_BASE_URL}/farm/sell-item`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, itemId, amount }),
      });
      const data = await response.json();
      if (!response.ok) {
        set({ gameMessage: data.message || 'Не вдалося продати предмет' });
        return false;
      }
      useAuthStore.getState().updateUser({
        coins: data.user.coins,
        rubies: data.user.rubies,
        itemInventory: data.user.itemInventory,
      });
      return true;
    } catch (error) {
      console.error('Помилка продажу предмета:', error);
      set({ gameMessage: 'Не вдалося продати предмет. Перевір з’єднання із сервером.' });
      return false;
    }
  }
  };
});

async function syncWithServer(userId: string, tiles: Record<string, TileData>) {
  if (!userId) return;
  try {
    const dbTilesArray = convertToDbArray(tiles);
    await fetch(`${API_BASE_URL}/farm/save`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, tiles: dbTilesArray }),
    });
  } catch (error) {
    console.error('Помилка синхронізації:', error);
  }
}