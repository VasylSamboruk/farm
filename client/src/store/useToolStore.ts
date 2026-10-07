import { create } from 'zustand';

// Інструмент може бути рядком 'shovel', 'trash', або 'place_apple_tree', 'place_wheat' і тд.
export type ToolType = 'shovel' | 'trash' | 'move' | 'rotate' | string | null; 

interface ToolState {
  activeTool: ToolType;
  isSettingsOpen: boolean;
  setActiveTool: (tool: ToolType) => void;
  setSettingsOpen: (isOpen: boolean) => void;
  cancelInteraction: () => void;
}

export const useToolStore = create<ToolState>((set) => ({
  activeTool: null,
  isSettingsOpen: false,
  setActiveTool: (tool) => set({ activeTool: tool }),
  setSettingsOpen: (isOpen) => set({ isSettingsOpen: isOpen }),
  cancelInteraction: () => set({ activeTool: null, isSettingsOpen: false }),
}));